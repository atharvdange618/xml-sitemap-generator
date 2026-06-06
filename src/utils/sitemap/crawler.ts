import puppeteer, { Browser, Page } from "puppeteer";
import { parse, HTMLElement } from "node-html-parser";
import { SitemapStats } from "../statsLogger";
import { config, CrawlerConfig } from "./config";
import { CrawlCaches, createCrawlCaches, setCrawlCache } from "./cache";
import { isValidImageUrl, normalizeUrl, isValidUrl } from "./urlUtils";
import { fetchWithRetry } from "./httpClient";
import {
  fetchRobotsTxtRules,
  isPathAllowed,
  RobotsRulesCompiled,
} from "./robots";
import {
  fetchAndParseSitemap,
  discoverSitemap,
  generateSitemap,
} from "./parser";
import { SitemapItem } from "../../types/sitemap";

const CONCURRENCY = 5;

class RecyclableBrowser {
  private currentBrowser: Browser | null = null;
  private currentBrowserPagesOpened = 0;
  private activePagesPerBrowser = new Map<Browser, number>();
  private recycleScheduled = false;
  private maxPages = 50;

  async init() {
    if (!this.currentBrowser) {
      this.currentBrowser = await puppeteer.launch({
        headless: true,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });
      this.currentBrowserPagesOpened = 0;
      this.recycleScheduled = false;
      this.activePagesPerBrowser.set(this.currentBrowser, 0);
    }
  }

  async newPage(): Promise<Page> {
    await this.init();

    const browserToUse = this.currentBrowser!;
    const page = await browserToUse.newPage();

    this.currentBrowserPagesOpened++;
    const currentActive = this.activePagesPerBrowser.get(browserToUse) || 0;
    this.activePagesPerBrowser.set(browserToUse, currentActive + 1);

    if (
      !this.recycleScheduled &&
      this.currentBrowserPagesOpened >= this.maxPages
    ) {
      console.log(
        `[RecyclableBrowser] Scheduling browser recycle after ${this.currentBrowserPagesOpened} pages`,
      );
      this.recycleScheduled = true;
    }

    const realClose = page.close.bind(page);
    let closed = false;
    page.close = async () => {
      if (!closed) {
        closed = true;
        const active = this.activePagesPerBrowser.get(browserToUse) || 0;
        const newActive = Math.max(0, active - 1);
        this.activePagesPerBrowser.set(browserToUse, newActive);

        if (
          newActive === 0 &&
          this.recycleScheduled &&
          browserToUse === this.currentBrowser
        ) {
          console.log(
            "[RecyclableBrowser] Recycling browser now that all pages are closed",
          );
          this.currentBrowser = null;
          this.recycleScheduled = false;
          this.activePagesPerBrowser.delete(browserToUse);
          await browserToUse
            .close()
            .catch((e: any) =>
              console.error("Error closing recycled browser:", e.message),
            )
            .finally(() => {
              try {
                browserToUse.process()?.kill("SIGKILL");
              } catch {}
            });
        }
      }
      return realClose();
    };

    return page;
  }

  async close() {
    const browser = this.currentBrowser;
    this.currentBrowser = null;
    this.recycleScheduled = false;
    if (browser) {
      this.activePagesPerBrowser.delete(browser);
      await browser
        .close()
        .catch(() => {})
        .finally(() => {
          try {
            browser.process()?.kill("SIGKILL");
          } catch {}
        });
    }
    this.activePagesPerBrowser.clear();
  }
}

export function calculatePriority(depth: number): string {
  const priority = 1.0 - depth * 0.1;
  return Math.max(0.1, priority).toFixed(1);
}

export function isIndexable(
  headers: Record<string, string> | undefined,
  root: HTMLElement,
): boolean {
  // 1. Check X-Robots-Tag header
  const xRobots = headers?.["x-robots-tag"];
  if (xRobots && /noindex/i.test(String(xRobots))) {
    return false;
  }

  // 2. Check meta tag
  const metaRobots = root.querySelector('meta[name="robots" i]');
  if (metaRobots) {
    const content = metaRobots.getAttribute("content");
    if (content && /noindex/i.test(content)) {
      return false;
    }
  }

  return true;
}

export function detectCSR(html: string, root: HTMLElement): boolean {
  let score = 0;

  // 1. Strong negatives - server-rendered with hydration data
  if (
    html.includes("__NEXT_DATA__") ||
    html.includes("self.__next_f") ||
    html.includes("window.__NUXT__") ||
    html.includes("__remixContext") ||
    html.includes("__remixManifest") ||
    html.includes("astro-island") ||
    html.includes("data-sveltekit-hydrate") ||
    html.includes("__sveltekit_")
  ) {
    return false; // SSR/hydrated - HTTP is sufficient
  }

  // 2. Strong positive - dev-confirmed CSR
  if (
    /<noscript>[^<]*(enable javascript|requires javascript|javascript is required|turn on javascript)/i.test(
      html,
    )
  ) {
    return true;
  }

  // 3. Visible text after script/style strip
  const body = root.querySelector("body");
  if (!body) return true; // Empty body triggers Puppeteer fallback

  const bodyClone = parse(body.outerHTML);
  bodyClone
    .querySelectorAll("script, style, template, noscript")
    .forEach((el) => el.remove());
  const visibleText = bodyClone.text.replace(/\s+/g, " ").trim();
  const visibleTextLen = visibleText.length;

  if (visibleTextLen < 200) score += 3;
  else if (visibleTextLen < 800) score += 1;

  // 4. Framework root selectors
  const roots = ["#root", "#__next", "#app", "#__nuxt", "[ng-version]"];
  const hasRoot = roots.some((s) => root.querySelector(s));
  const rootIsEmpty = roots.some((s) => {
    const el = root.querySelector(s);
    return el && el.childNodes.length === 0;
  });

  if (hasRoot && rootIsEmpty) score += 4;
  else if (hasRoot && visibleTextLen < 500) score += 2;

  // 5. True splash screen (only loading/spinner classes inside body)
  const splash = body.querySelector(
    '[class*="loading" i], [class*="spinner" i]',
  );
  if (splash && bodyClone.childNodes.length <= 3) {
    score += 2;
  }

  return score >= 3;
}

export function shouldRender(
  currentUrl: string,
  html: string,
  root: HTMLElement,
  renderCache: Map<string, any>,
): boolean {
  try {
    const origin = new URL(currentUrl).origin;
    const cached = renderCache.get(origin);
    if (cached === "http") return false;
    if (cached === "browser") return true;

    const isCSR = detectCSR(html, root);
    const samples = renderCache.get(`${origin}:samples`) || [];
    samples.push(isCSR);

    if (samples.length >= 3 && samples.every((s: any) => s === samples[0])) {
      renderCache.set(origin, samples[0] ? "browser" : "http");
    } else {
      renderCache.set(`${origin}:samples`, samples);
    }
    return isCSR;
  } catch (e) {
    return detectCSR(html, root);
  }
}

export async function crawlSite(
  baseUrl: string,
  maxPages = 100,
  cfg: CrawlerConfig = config,
  onProgress?: (url: string, count: number) => void,
  robotsRules: RobotsRulesCompiled = { disallowed: [], allowed: [] },
  stats: SitemapStats | null = null,
  getBrowserArg: (() => Promise<Browser>) | null = null,
  caches: CrawlCaches = createCrawlCaches(),
): Promise<Map<string, SitemapItem>> {
  const sitemapData = new Map<string, SitemapItem>();
  const normalizedBase = normalizeUrl(baseUrl, baseUrl);
  const queue = [{ url: normalizedBase, depth: 0 }];
  const visited = new Set([normalizedBase]);
  let puppeteerBrowser: any = null;
  let activeCount = 0;

  const getBrowser =
    getBrowserArg ||
    (async () => {
      if (!puppeteerBrowser) {
        puppeteerBrowser = new RecyclableBrowser();
      }
      return puppeteerBrowser as any as Browser;
    });

  const next = () => {
    if (queue.length > 0) {
      const item = queue[0];
      if (item && sitemapData.size + activeCount < maxPages) {
        return queue.shift()!;
      }
    }
    return null;
  };

  const processOne = async ({ url, depth }: { url: string; depth: number }) => {
    const canonicalChain = new Set<string>();
    canonicalChain.add(normalizeUrl(url, baseUrl));
    let currentUrl = url;
    let currentDepth = depth;

    while (true) {
      const result = await crawlUrl(
        currentUrl,
        baseUrl,
        cfg,
        getBrowser,
        caches,
      );
      const {
        links,
        lastmod,
        alternates,
        canonical,
        isIndexable: pageIndexable,
        images,
      } = result;

      const normalizedCanonical = canonical
        ? normalizeUrl(canonical, baseUrl)
        : null;
      const normalizedCurrent = normalizeUrl(currentUrl, baseUrl);

      let followTarget: string | null = null;
      if (!pageIndexable) {
        if (links.length === 1 && links[0] !== normalizedCurrent) {
          try {
            const target = new URL(links[0]);
            const base = new URL(baseUrl);
            if (target.hostname === base.hostname) {
              followTarget = links[0];
            }
          } catch {}
        }
        if (
          !followTarget &&
          normalizedCanonical &&
          normalizedCanonical !== normalizedCurrent
        ) {
          try {
            const canonicalObj = new URL(normalizedCanonical);
            const baseObj = new URL(baseUrl);
            if (canonicalObj.hostname === baseObj.hostname) {
              followTarget = normalizedCanonical;
            }
          } catch {}
        }
      }

      if (followTarget && !canonicalChain.has(followTarget)) {
        canonicalChain.add(followTarget);
        currentUrl = followTarget;
        continue;
      }

      if (sitemapData.size < maxPages) {
        const priority = calculatePriority(currentDepth);

        if (pageIndexable) {
          sitemapData.set(currentUrl, {
            lastmod,
            priority,
            alternates,
            images,
          });
          if (onProgress) {
            onProgress(currentUrl, Math.min(sitemapData.size, maxPages));
          }
          if (stats) {
            stats.incrementCrawledPages();
            stats.updateDepthInfo(currentDepth);
          }
        }

        const maxDepth = cfg.maxDepth || 10;
        if (currentDepth < maxDepth) {
          for (const link of links) {
            try {
              const path = new URL(link).pathname;
              const isAllowed = isPathAllowed(path, robotsRules);
              if (!visited.has(link) && isAllowed) {
                visited.add(link);
                queue.push({ url: link, depth: currentDepth + 1 });
              }
            } catch {}
          }
        }
      }

      break;
    }
  };

  try {
    const workersCount = cfg.concurrency || CONCURRENCY;
    const workers = Array.from({ length: workersCount }, async () => {
      while (true) {
        const item = next();
        if (!item) {
          if (activeCount === 0) break;
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }

        activeCount++;
        try {
          await processOne(item);
        } catch (e: any) {
          console.error(`Error processing ${item.url}:`, e.message);
          if (stats) {
            stats.addError(item.url, e.message);
          }
        } finally {
          activeCount--;
        }
      }
    });

    await Promise.all(workers);
  } finally {
    if (puppeteerBrowser && !getBrowserArg) {
      try {
        await (puppeteerBrowser as Browser).close();
      } catch (e: any) {
        console.error("Error closing browser:", e.message);
      }
    }
  }

  return sitemapData;
}

export async function crawlUrl(
  currentUrl: string,
  baseUrl: string,
  cfg: CrawlerConfig,
  getBrowser: () => Promise<Browser>,
  caches: CrawlCaches,
): Promise<{
  links: string[];
  lastmod: string | null;
  alternates: { hreflang: string; href: string }[];
  canonical: string | null;
  isIndexable: boolean;
  images: string[];
  redirectTarget?: string;
}> {
  let httpData: any = null;

  const origin = new URL(currentUrl).origin;
  const cachedDecision = caches.renderCache.get(origin);
  const runHttp = cachedDecision !== "browser";

  if (runHttp) {
    try {
      httpData = await getLinksWithHTTP(baseUrl, currentUrl, cfg, caches);
    } catch {
      const failures = (caches.renderCache.get(`${origin}:failures`) || 0) + 1;
      caches.renderCache.set(`${origin}:failures`, failures);
      if (failures >= 3) {
        console.log(
          `[crawlUrl] Origin ${origin} locked to browser after ${failures} consecutive HTTP failures`,
        );
        caches.renderCache.set(origin, "browser");
      }
    }
  }

  if (httpData && httpData.redirectTarget) {
    try {
      const redirectTargetUrl = new URL(httpData.redirectTarget);
      const baseUrlObj = new URL(baseUrl);
      if (redirectTargetUrl.hostname === baseUrlObj.hostname) {
        return {
          links: [httpData.redirectTarget],
          lastmod: null,
          alternates: [],
          canonical: null,
          isIndexable: false,
          images: [],
        };
      }
    } catch {}
    return {
      links: [],
      lastmod: null,
      alternates: [],
      canonical: null,
      isIndexable: false,
      images: [],
    };
  }

  if (httpData && !httpData.isIndexable) {
    return {
      links: [],
      lastmod: httpData.lastmod,
      alternates: [],
      canonical: httpData.canonical,
      isIndexable: false,
      images: [],
    };
  }

  if (httpData && !httpData.isCSR && httpData.links.length > 0) {
    const normalizedCanonical = httpData.canonical
      ? normalizeUrl(httpData.canonical, baseUrl)
      : null;
    const normalizedCurrent = normalizeUrl(currentUrl, baseUrl);
    if (normalizedCanonical && normalizedCanonical !== normalizedCurrent) {
      return {
        links: [],
        lastmod: httpData.lastmod,
        alternates: [],
        canonical: httpData.canonical,
        isIndexable: false,
        images: [],
      };
    }
    return {
      links: httpData.links,
      lastmod: httpData.lastmod,
      alternates: httpData.alternates,
      canonical: httpData.canonical,
      isIndexable: true,
      images: httpData.images || [],
    };
  }

  // Fallback to Puppeteer if:
  // 1. HTTP failed (httpData is null)
  // 2. HTTP succeeded but is CSR
  // 3. HTTP succeeded but returned 0 links (probe for content/links using browser rendering)
  try {
    const browser = await getBrowser();
    const puppeteerData = await getLinksWithPuppeteer(
      browser,
      baseUrl,
      currentUrl,
    );

    if (puppeteerData.redirectTarget) {
      try {
        const redirectTargetUrl = new URL(puppeteerData.redirectTarget);
        const baseUrlObj = new URL(baseUrl);
        if (redirectTargetUrl.hostname === baseUrlObj.hostname) {
          return {
            links: [puppeteerData.redirectTarget],
            lastmod: null,
            alternates: [],
            canonical: null,
            isIndexable: false,
            images: [],
          };
        }
      } catch {}
      return {
        links: [],
        lastmod: null,
        alternates: [],
        canonical: null,
        isIndexable: false,
        images: [],
      };
    }

    if (puppeteerData.isIndexable) {
      const finalLinks = [
        ...new Set([...(httpData?.links || []), ...puppeteerData.links]),
      ];
      const finalAlternates = [
        ...(httpData?.alternates || []),
        ...puppeteerData.alternates,
      ];
      const finalImages = [
        ...new Set([
          ...(httpData?.images || []),
          ...(puppeteerData.images || []),
        ]),
      ].filter(isValidImageUrl);

      const altMap = new Map();
      for (const alt of finalAlternates) {
        altMap.set(alt.hreflang, alt);
      }
      const finalAlternatesDedup = Array.from(altMap.values());
      const finalCanonical =
        puppeteerData.canonical || httpData?.canonical || null;
      const lastmod = httpData?.lastmod || null;

      const normalizedCanonical = finalCanonical
        ? normalizeUrl(finalCanonical, baseUrl)
        : null;
      const normalizedCurrent = normalizeUrl(currentUrl, baseUrl);
      if (normalizedCanonical && normalizedCanonical !== normalizedCurrent) {
        return {
          links: [],
          lastmod,
          alternates: [],
          canonical: finalCanonical,
          isIndexable: false,
          images: [],
        };
      }

      return {
        links: finalLinks,
        lastmod,
        alternates: finalAlternatesDedup,
        canonical: finalCanonical,
        isIndexable: true,
        images: finalImages,
      };
    } else {
      return {
        links: [],
        lastmod: httpData?.lastmod || null,
        alternates: [],
        canonical: puppeteerData.canonical,
        isIndexable: false,
        images: [],
      };
    }
  } catch (puppeteerError) {
    return {
      links: [],
      lastmod: null,
      alternates: [],
      canonical: null,
      isIndexable: false,
      images: [],
    };
  }
}

export async function getLinksWithHTTP(
  baseUrl: string,
  currentUrl: string,
  cfg: CrawlerConfig,
  caches: CrawlCaches,
): Promise<{
  links: string[];
  isCSR: boolean;
  lastmod: string | null;
  alternates: { hreflang: string; href: string }[];
  canonical: string | null;
  isIndexable: boolean;
  images: string[];
  redirectTarget?: string;
}> {
  const cached = caches.crawlCache[currentUrl];
  const headers: Record<string, string> = {};
  if (cached) {
    if (cached.lastmodHeader) {
      headers["If-Modified-Since"] = cached.lastmodHeader;
    }
    if (cached.etag) {
      headers["If-None-Match"] = cached.etag;
    }
  }

  const response = await fetchWithRetry(currentUrl, headers);

  if (response.status === 304 && cached) {
    return {
      links: cached.links,
      isCSR: cached.isCSR || false,
      lastmod: cached.lastmod || null,
      alternates: cached.alternates || [],
      canonical: cached.canonical || null,
      isIndexable: cached.isIndexable !== false,
      images: cached.images || [],
    };
  }

  const finalUrl = (response.request as any)?.res?.responseUrl
    ? normalizeUrl((response.request as any).res.responseUrl, baseUrl)
    : null;
  const normalizedCurrent = normalizeUrl(currentUrl, baseUrl);

  if (finalUrl && finalUrl !== normalizedCurrent) {
    return {
      links: [],
      isCSR: false,
      lastmod: null,
      alternates: [],
      canonical: null,
      isIndexable: false,
      images: [],
      redirectTarget: finalUrl,
    };
  }

  if (response.status !== 200) {
    const result = {
      links: [],
      isCSR: false,
      lastmod: null,
      alternates: [],
      canonical: null,
      isIndexable: false,
      images: [],
    };
    setCrawlCache(caches, currentUrl, {
      lastmodHeader: response.headers["last-modified"] || null,
      etag: response.headers["etag"] || null,
      ...result,
    });
    return result;
  }

  const contentType = (response.headers["content-type"] as string) || "";
  const isHtml =
    contentType.includes("text/html") ||
    contentType.includes("application/xhtml+xml");
  if (contentType.includes("application/json") || !isHtml) {
    const result = {
      links: [],
      isCSR: false,
      lastmod: null,
      alternates: [],
      canonical: null,
      isIndexable: false,
      images: [],
    };
    setCrawlCache(caches, currentUrl, {
      lastmodHeader: response.headers["last-modified"] || null,
      etag: response.headers["etag"] || null,
      ...result,
    });
    return result;
  }

  let html = response.data;
  if (typeof html !== "string") {
    html = String(html);
  }

  const root = parse(html);

  const lastmodHeader = response.headers["last-modified"] as string;
  let lastmod = null;
  if (lastmodHeader) {
    const parsedDate = new Date(lastmodHeader);
    if (!isNaN(parsedDate.getTime())) {
      lastmod = parsedDate.toISOString();
    }
  }

  const pageIndexable = isIndexable(response.headers as any, root);
  if (!pageIndexable) {
    const result = {
      links: [],
      isCSR: false,
      lastmod,
      alternates: [],
      canonical: null,
      isIndexable: false,
      images: [],
    };
    setCrawlCache(caches, currentUrl, {
      lastmodHeader: response.headers["last-modified"] || null,
      etag: response.headers["etag"] || null,
      ...result,
    });
    return result;
  }

  const { links, alternates, canonical, images } = extractLinks(
    root,
    baseUrl,
    currentUrl,
  );

  const normalizedCanonical = canonical
    ? normalizeUrl(canonical, baseUrl)
    : null;
  if (normalizedCanonical && normalizedCanonical !== normalizedCurrent) {
    const result = {
      links,
      isCSR: false,
      lastmod,
      alternates,
      canonical,
      isIndexable: false,
      images,
    };
    setCrawlCache(caches, currentUrl, {
      lastmodHeader: response.headers["last-modified"] || null,
      etag: response.headers["etag"] || null,
      ...result,
    });
    return result;
  }

  const isCSR = shouldRender(currentUrl, html, root, caches.renderCache);

  const result = {
    links: isCSR ? [] : links,
    isCSR,
    lastmod,
    alternates: isCSR ? [] : alternates,
    canonical: isCSR ? null : canonical,
    isIndexable: true,
    images: isCSR ? [] : images,
  };

  setCrawlCache(caches, currentUrl, {
    lastmodHeader: response.headers["last-modified"] || null,
    etag: response.headers["etag"] || null,
    ...result,
  });

  return result;
}

export async function getLinksWithPuppeteer(
  browser: Browser,
  baseUrl: string,
  currentUrl: string,
): Promise<{
  links: string[];
  alternates: { hreflang: string; href: string }[];
  canonical: string | null;
  isIndexable: boolean;
  images: string[];
  redirectTarget?: string;
}> {
  const page = await browser.newPage();

  try {
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const type = req.resourceType();
      if (["image", "media", "font", "stylesheet"].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    const response = await page.goto(currentUrl, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    const finalUrl = response ? normalizeUrl(response.url(), baseUrl) : null;
    const normalizedCurrent = normalizeUrl(currentUrl, baseUrl);

    if (finalUrl && finalUrl !== normalizedCurrent) {
      return {
        links: [],
        alternates: [],
        canonical: null,
        isIndexable: false,
        images: [],
        redirectTarget: finalUrl,
      };
    }

    const headers = response?.headers() || {};
    const xRobots = headers["x-robots-tag"];
    if (xRobots && /noindex/i.test(xRobots)) {
      return {
        links: [],
        alternates: [],
        canonical: null,
        isIndexable: false,
        images: [],
      };
    }

    await Promise.race([
      page.waitForFunction(
        () =>
          document.body &&
          document.body.innerText.replace(/\s+/g, " ").trim().length > 300,
        { timeout: 8000 },
      ),
      page.waitForSelector(
        'main, article, [role="main"], #__next, #root, #app',
        { timeout: 8000 },
      ),
    ]).catch(() => {
      // Best-effort wait fallback
    });

    const metaNoIndex = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="robots" i]');
      return !!(meta && /noindex/i.test(meta.getAttribute("content") || ""));
    });

    if (metaNoIndex) {
      return {
        links: [],
        alternates: [],
        canonical: null,
        isIndexable: false,
        images: [],
      };
    }

    const pageData = await page.evaluate((baseUrlStr) => {
      const links: string[] = [];
      const alternates: { hreflang: string; href: string }[] = [];
      let canonical: string | null = null;

      function findAllAnchors(
        rootNode: Document | ShadowRoot = document,
        depth = 0,
      ): HTMLAnchorElement[] {
        const MAX_SHADOW_DEPTH = 10;
        if (depth > MAX_SHADOW_DEPTH) return [];

        const anchors = Array.from(
          rootNode.querySelectorAll("a[href]"),
        ) as HTMLAnchorElement[];
        const shadowRoots = Array.from(rootNode.querySelectorAll("*"))
          .map((el) => el.shadowRoot)
          .filter(Boolean) as ShadowRoot[];
        for (const sr of shadowRoots) {
          anchors.push(...findAllAnchors(sr, depth + 1));
        }
        return anchors;
      }

      const linkElements = findAllAnchors();
      for (const element of linkElements) {
        try {
          const href = element.getAttribute("href");
          if (!href) continue;
          const url = new URL(href, window.location.href);
          if (url.origin === baseUrlStr) {
            url.hash = "";
            const blacklist = [
              "utm_source",
              "utm_medium",
              "utm_campaign",
              "utm_term",
              "utm_content",
              "utm_id",
              "fbclid",
              "gclid",
              "dclid",
              "msclkid",
              "jsessionid",
              "phpsessid",
            ];
            const params = new URLSearchParams(url.search);
            for (const key of Array.from(params.keys())) {
              if (blacklist.includes(key.toLowerCase())) {
                params.delete(key);
              }
            }
            const searchStr = params.toString();
            url.search = searchStr ? `?${searchStr}` : "";

            if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
              url.pathname = url.pathname.slice(0, -1);
            }
            links.push(url.href);
          }
        } catch {}
      }

      const linkTags = document.querySelectorAll(
        'link[rel="canonical"], link[rel="alternate"]',
      );
      for (const linkTag of Array.from(linkTags)) {
        try {
          const rel = linkTag.getAttribute("rel")?.toLowerCase();
          const href = linkTag.getAttribute("href");
          if (!href) continue;
          const url = new URL(href, window.location.href);
          if (url.origin === baseUrlStr) {
            url.hash = "";
            const blacklist = [
              "utm_source",
              "utm_medium",
              "utm_campaign",
              "utm_term",
              "utm_content",
              "utm_id",
              "fbclid",
              "gclid",
              "dclid",
              "msclkid",
              "jsessionid",
              "phpsessid",
            ];
            const params = new URLSearchParams(url.search);
            for (const key of Array.from(params.keys())) {
              if (blacklist.includes(key.toLowerCase())) {
                params.delete(key);
              }
            }
            const searchStr = params.toString();
            url.search = searchStr ? `?${searchStr}` : "";

            if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
              url.pathname = url.pathname.slice(0, -1);
            }

            if (rel === "canonical") {
              canonical = url.href;
            } else if (rel === "alternate") {
              const hreflang = linkTag.getAttribute("hreflang");
              if (hreflang) {
                alternates.push({ hreflang, href: url.href });
              }
              links.push(url.href);
            }
          }
        } catch {}
      }

      const images: string[] = [];
      const imgElements = document.querySelectorAll("img[src]");
      for (const imgEl of Array.from(imgElements)) {
        try {
          const src = imgEl.getAttribute("src");
          if (!src) continue;
          const url = new URL(src, window.location.href);
          images.push(url.href);
        } catch {}
      }

      return {
        links: Array.from(new Set(links)),
        alternates,
        canonical,
        images: Array.from(new Set(images)),
      };
    }, baseUrl);

    return {
      links: pageData.links,
      alternates: pageData.alternates,
      canonical: pageData.canonical,
      isIndexable: true,
      images: pageData.images,
    };
  } finally {
    try {
      await page.close();
    } catch (e: any) {
      console.error("Error closing page:", e.message);
    }
  }
}

export function extractLinks(
  root: HTMLElement,
  baseUrl: string,
  currentUrl: string,
): {
  links: string[];
  alternates: { hreflang: string; href: string }[];
  canonical: string | null;
  images: string[];
} {
  const links: string[] = [];
  const alternates: { hreflang: string; href: string }[] = [];
  let canonical: string | null = null;
  const baseUrlObj = new URL(baseUrl);
  const images: string[] = [];

  // 1. Anchors
  const anchors = root.querySelectorAll("a");
  for (const anchor of anchors) {
    const href = anchor.getAttribute("href");
    if (!href) continue;

    try {
      const normalized = normalizeUrl(href, currentUrl);
      const url = new URL(normalized);
      if (url.hostname === baseUrlObj.hostname) {
        if (isValidUrl(normalized)) {
          links.push(normalized);
        }
      }
    } catch {}
  }

  // 2. Canonical and Alternates
  const linkTags = root.querySelectorAll(
    'link[rel="canonical"], link[rel="alternate"]',
  );
  for (const link of linkTags) {
    const rel = link.getAttribute("rel")?.toLowerCase();
    const href = link.getAttribute("href");
    if (!href) continue;

    try {
      const normalized = normalizeUrl(href, currentUrl);
      const url = new URL(normalized);
      if (url.hostname === baseUrlObj.hostname) {
        if (rel === "canonical") {
          canonical = normalized;
        } else if (rel === "alternate") {
          const hreflang = link.getAttribute("hreflang");
          if (hreflang) {
            alternates.push({ hreflang, href: normalized });
          }
          if (isValidUrl(normalized)) {
            links.push(normalized);
          }
        }
      }
    } catch {}
  }

  // 3. Images
  const imgTags = root.querySelectorAll("img");
  for (const img of imgTags) {
    const src = img.getAttribute("src");
    if (!src) continue;

    try {
      const normalized = normalizeUrl(src, currentUrl);
      try {
        new URL(normalized);
      } catch {
        continue;
      }
      if (isValidImageUrl(normalized)) {
        images.push(normalized);
      }
    } catch {}
  }

  return {
    links: Array.from(new Set(links)),
    alternates,
    canonical,
    images: Array.from(new Set(images)),
  };
}

export async function processSitemapUrls(
  urls: string[],
  baseUrl: string,
  maxPages: number,
  cfg: CrawlerConfig,
  onProgress?: (url: string, count: number) => void,
  robotsRules: RobotsRulesCompiled = { disallowed: [], allowed: [] },
  getBrowser?: () => Promise<Browser>,
  caches?: CrawlCaches,
): Promise<Map<string, SitemapItem>> {
  const sitemapData = new Map<string, SitemapItem>();
  const urlsToProcess = urls
    .filter((url) => {
      try {
        const urlObj = new URL(url);
        const path = urlObj.pathname;
        const isAllowed = isPathAllowed(path, robotsRules);
        return isAllowed && urlObj.origin === baseUrl;
      } catch {
        return false;
      }
    })
    .slice(0, maxPages);

  let activeCount = 0;
  let index = 0;

  const nextUrl = () => {
    if (
      index < urlsToProcess.length &&
      sitemapData.size + activeCount < maxPages
    ) {
      return urlsToProcess[index++];
    }
    return null;
  };

  const processOne = async (url: string) => {
    if (sitemapData.size >= maxPages) return;

    const {
      lastmod,
      isIndexable: pageIndexable,
      images,
    } = await getUrlMetadata(url, getBrowser, caches);

    if (pageIndexable && sitemapData.size < maxPages) {
      const depth = new URL(url).pathname.split("/").filter(Boolean).length;
      const priority = calculatePriority(depth);
      sitemapData.set(url, {
        lastmod,
        priority,
        alternates: [],
        images: images
          ? images.map((img) => (typeof img === "string" ? { loc: img } : img))
          : [],
      });
      if (onProgress) {
        onProgress(url, Math.min(sitemapData.size, maxPages));
      }
    }
  };

  const workersCount = cfg.concurrency || CONCURRENCY;
  const workers = Array.from({ length: workersCount }, async () => {
    while (true) {
      const url = nextUrl();
      if (!url) break;

      activeCount++;
      try {
        await processOne(url);
      } catch (error: any) {
        console.error(`Error processing sitemap URL ${url}:`, error.message);
      } finally {
        activeCount--;
      }
    }
  });

  await Promise.all(workers);

  if (sitemapData.size > maxPages) {
    const entries = Array.from(sitemapData.entries()).slice(0, maxPages);
    return new Map(entries);
  }

  return sitemapData;
}

export async function getUrlMetadata(
  url: string,
  getBrowser?: () => Promise<Browser>,
  caches?: CrawlCaches,
): Promise<{
  lastmod: string | null;
  isIndexable: boolean;
  images: string[];
}> {
  const cached = caches ? caches.crawlCache[url] : undefined;
  const headers: Record<string, string> = {};
  if (cached) {
    if (cached.lastmodHeader) {
      headers["If-Modified-Since"] = cached.lastmodHeader;
    }
    if (cached.etag) {
      headers["If-None-Match"] = cached.etag;
    }
  }

  let httpSuccess = false;
  let response: any = null;
  let root: HTMLElement | null = null;
  let pageIndexable = false;

  const origin = new URL(url).origin;
  const cachedDecision = caches ? caches.renderCache.get(origin) : undefined;
  const runHttp = cachedDecision !== "browser";

  if (runHttp) {
    try {
      response = await fetchWithRetry(url, headers);
      if (response.status === 304 && cached) {
        return {
          lastmod: cached.lastmod || null,
          isIndexable: cached.isIndexable !== false,
          images: cached.images || [],
        };
      }
      if (response.status === 200) {
        const ct = (response.headers["content-type"] as string) || "";
        const isPageHtml =
          ct.includes("text/html") || ct.includes("application/xhtml+xml");
        if (!ct.includes("application/json") && isPageHtml) {
          root = parse(response.data || "");
          pageIndexable = isIndexable(response.headers as any, root);
          httpSuccess = true;
        }
      }
    } catch {
      if (caches) {
        const failures =
          (caches.renderCache.get(`${origin}:failures`) || 0) + 1;
        caches.renderCache.set(`${origin}:failures`, failures);
        if (failures >= 3) {
          caches.renderCache.set(origin, "browser");
        }
      }
    }
  }

  if (httpSuccess && response && root) {
    if (!pageIndexable) {
      const result = { lastmod: null, isIndexable: false, images: [] };
      if (caches) {
        setCrawlCache(caches, url, {
          lastmodHeader: response.headers["last-modified"] || null,
          etag: response.headers["etag"] || null,
          ...result,
        });
      }
      return result;
    }

    const lastmodHeader = response.headers["last-modified"] as string;
    let lastmod = null;
    if (lastmodHeader) {
      const parsedDate = new Date(lastmodHeader);
      if (!isNaN(parsedDate.getTime())) {
        lastmod = parsedDate.toISOString();
      }
    }

    // Extract images
    const images: string[] = [];
    const imgTags = root.querySelectorAll("img");
    for (const img of imgTags) {
      const src = img.getAttribute("src");
      if (src) {
        try {
          const normalizedSrc = normalizeUrl(src, url);
          try {
            new URL(normalizedSrc);
          } catch {
            continue;
          }
          if (isValidImageUrl(normalizedSrc)) {
            images.push(normalizedSrc);
          }
        } catch {}
      }
    }

    const result = {
      lastmod,
      isIndexable: true,
      images: Array.from(new Set(images)),
    };
    if (caches) {
      setCrawlCache(caches, url, {
        lastmodHeader: response.headers["last-modified"] || null,
        etag: response.headers["etag"] || null,
        ...result,
      });
    }
    return result;
  }

  if (getBrowser) {
    try {
      const browser = await getBrowser();
      const page = await browser.newPage();
      try {
        await page.setRequestInterception(true);
        page.on("request", (req) => {
          const type = req.resourceType();
          if (["image", "media", "font", "stylesheet"].includes(type)) {
            req.abort();
          } else {
            req.continue();
          }
        });

        const res = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });

        const headers = res?.headers() || {};
        const xRobots = headers["x-robots-tag"];
        if (xRobots && /noindex/i.test(xRobots)) {
          return { lastmod: null, isIndexable: false, images: [] };
        }

        const metaNoIndex = await page.evaluate(() => {
          const meta = document.querySelector('meta[name="robots" i]');
          return !!(
            meta && /noindex/i.test(meta.getAttribute("content") || "")
          );
        });

        if (metaNoIndex) {
          return { lastmod: null, isIndexable: false, images: [] };
        }

        const canonical = await page.evaluate(() => {
          const link = document.querySelector('link[rel="canonical"]');
          return link ? link.getAttribute("href") : null;
        });

        if (canonical) {
          const normalizedCanonical = normalizeUrl(canonical, url);
          const normalizedCurrent = normalizeUrl(url, url);
          if (normalizedCanonical !== normalizedCurrent) {
            return { lastmod: null, isIndexable: false, images: [] };
          }
        }

        // Extract images in evaluate
        const imgUrls = await page.evaluate(() => {
          return Array.from(document.querySelectorAll("img[src]"))
            .map((img) => img.getAttribute("src"))
            .filter(Boolean) as string[];
        });
        const normalizedImages = imgUrls
          .map((src) => {
            try {
              return normalizeUrl(src, url);
            } catch {
              return null;
            }
          })
          .filter(Boolean) as string[];

        const validImages = normalizedImages.filter(isValidImageUrl);

        return {
          lastmod: null,
          isIndexable: true,
          images: Array.from(new Set(validImages)),
        };
      } finally {
        try {
          await page.close();
        } catch {}
      }
    } catch {
      return { lastmod: null, isIndexable: false, images: [] };
    }
  }

  return { lastmod: null, isIndexable: false, images: [] };
}

export async function createSitemap(
  websiteUrl: string,
  maxPages = 100,
  onProgress?: (url: string, count: number) => void,
): Promise<{
  sitemap: string;
  stats: any;
  chunks?: string[];
}> {
  const jobCaches = createCrawlCaches();
  const stats = new SitemapStats(websiteUrl);
  const baseUrl = new URL(websiteUrl).origin;

  let puppeteerBrowser: any = null;
  const getBrowser = async () => {
    if (!puppeteerBrowser) {
      puppeteerBrowser = new RecyclableBrowser();
    }
    return puppeteerBrowser as any as Browser;
  };

  let lastEmitted = 0;
  const throttledProgress = (url: string, count: number) => {
    if (!onProgress) return;
    const now = Date.now();
    const isMilestone =
      url.startsWith("Sitemap:") ||
      url.startsWith("Crawling") ||
      url.startsWith("Merging") ||
      url.startsWith("Complete!");
    if (isMilestone || now - lastEmitted >= 500 || count >= maxPages) {
      lastEmitted = now;
      onProgress(url, count);
    }
  };

  try {
    let robotsRules: RobotsRulesCompiled = { disallowed: [], allowed: [] };
    try {
      robotsRules = await fetchRobotsTxtRules(baseUrl);
    } catch (e: any) {
      console.error("Error setting up robots.txt rules:", e.message);
    }

    stats.setRobotsTxtInfo(robotsRules.disallowed.map((r) => r.pattern));

    const sitemapUrlsList = await discoverSitemap(baseUrl);
    let sitemapUrls: string[] = [];

    if (sitemapUrlsList && sitemapUrlsList.length > 0) {
      const parsedResults = await Promise.all(
        sitemapUrlsList.map((url) => fetchAndParseSitemap(url).catch(() => [])),
      );
      sitemapUrls = Array.from(new Set(parsedResults.flat()));
      stats.setSitemapPages(sitemapUrls.length);

      throttledProgress(
        `Sitemap: ${sitemapUrls.length} URLs | Starting crawl for more...`,
        0,
      );
    }

    throttledProgress(
      `Crawling from homepage to find more pages...`,
      Math.min(sitemapUrls.length, maxPages),
    );

    const crawledData = await crawlSite(
      baseUrl,
      maxPages,
      config,
      (url, count) => {
        throttledProgress(url, Math.min(sitemapUrls.length + count, maxPages));
      },
      robotsRules,
      stats,
      getBrowser,
      jobCaches,
    );

    const allUrls = new Set([
      ...sitemapUrls,
      ...Array.from(crawledData.keys()),
    ]);

    throttledProgress(
      `Merging results: ${allUrls.size} unique URLs found`,
      Math.min(allUrls.size, maxPages),
    );

    const finalData = new Map<string, SitemapItem>(crawledData);
    const uncrawledUrls = sitemapUrls.filter((url) => !finalData.has(url));

    if (uncrawledUrls.length > 0 && finalData.size < maxPages) {
      const remainingSlots = maxPages - finalData.size;
      const additionalData = await processSitemapUrls(
        uncrawledUrls,
        baseUrl,
        remainingSlots,
        config,
        (url, count) => {
          throttledProgress(url, Math.min(finalData.size + count, maxPages));
        },
        robotsRules,
        getBrowser,
        jobCaches,
      );

      for (const [url, data] of additionalData.entries()) {
        if (finalData.size >= maxPages) break;
        finalData.set(url, data);
      }
    }

    const sitemapUrlsSet = new Set(sitemapUrls);
    const crawledUrlsSet = new Set(crawledData.keys());

    const overlapPages = Array.from(sitemapUrlsSet).filter((url) =>
      crawledUrlsSet.has(url),
    ).length;
    const sitemapOnlyPages = sitemapUrls.length - overlapPages;
    const crawledOnlyPages = crawledData.size - overlapPages;

    stats.setPageBreakdown(sitemapOnlyPages, crawledOnlyPages, overlapPages);
    stats.setTotalPages(finalData.size);

    throttledProgress(
      `Complete! ${finalData.size} pages processed`,
      finalData.size,
    );

    await stats.save();
    console.log(stats.getSummary());

    const { xml, chunks } = generateSitemap(finalData, baseUrl);
    return {
      sitemap: xml,
      chunks,
      stats: stats.toJSON(),
    };
  } catch (error: any) {
    console.error("Critical error during createSitemap:", error.message);
    try {
      await stats.save();
    } catch (saveError: any) {
      console.error("Could not save partial stats:", saveError.message);
    }
    throw error;
  } finally {
    if (puppeteerBrowser) {
      try {
        await (puppeteerBrowser as Browser).close();
      } catch (e: any) {
        console.error(
          "Error closing browser in createSitemap finally block:",
          e.message,
        );
      }
    }
  }
}
