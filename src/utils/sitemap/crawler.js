import puppeteer from "puppeteer";
import { parse } from "node-html-parser";
import { SitemapStats } from "../statsLogger.js";
import { config } from "./config.js";
import { renderCache, crawlCache, initCrawlCache, saveCache } from "./cache.js";
import { isValidImageUrl, normalizeUrl, isValidUrl } from "./urlUtils.js";
import { fetchWithRetry } from "./httpClient.js";
import { fetchRobotsTxtRules, isPathAllowed } from "./robots.js";
import {
  fetchAndParseSitemap,
  discoverSitemap,
  generateSitemap,
} from "./parser.js";

const CONCURRENCY = 5;

export function calculatePriority(depth) {
  const priority = 1.0 - depth * 0.1;
  return Math.max(0.1, priority).toFixed(1);
}

export function isIndexable(headers, root) {
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

export function detectCSR(html, root) {
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

export function shouldRender(currentUrl, html, root) {
  try {
    const origin = new URL(currentUrl).origin;
    const cached = renderCache.get(origin);
    if (cached === "http") return false;
    if (cached === "browser") return true;

    const isCSR = detectCSR(html, root);
    const samples = renderCache.get(`${origin}:samples`) || [];
    samples.push(isCSR);

    if (samples.length >= 3 && samples.every((s) => s === samples[0])) {
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
  baseUrl,
  maxPages = 100,
  cfg = config,
  onProgress,
  robotsRules = { disallowed: [], allowed: [] },
  stats = null,
  getBrowserArg = null,
) {
  const sitemapData = new Map();
  const normalizedBase = normalizeUrl(baseUrl, baseUrl);
  const queue = [{ url: normalizedBase, depth: 0 }];
  const visited = new Set([normalizedBase]);
  let puppeteerBrowser = null;
  let activeCount = 0;

  const getBrowser =
    getBrowserArg ||
    (async () => {
      if (!puppeteerBrowser) {
        puppeteerBrowser = await puppeteer.launch({
          headless: true,
          args: [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
          ],
        });
      }
      return puppeteerBrowser;
    });

  const next = () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (sitemapData.size + activeCount < maxPages) {
        return item;
      }
    }
    return null;
  };

  const processOne = async ({ url, depth }) => {
    if (onProgress) {
      onProgress(url, sitemapData.size + 1);
    }

    const {
      links,
      lastmod,
      alternates,
      canonical,
      isIndexable: pageIndexable,
      images,
    } = await crawlUrl(url, baseUrl, cfg, getBrowser);

    if (sitemapData.size < maxPages) {
      const priority = calculatePriority(depth);

      if (pageIndexable) {
        sitemapData.set(url, { lastmod, priority, alternates, images });
        if (stats) {
          stats.incrementCrawledPages();
          stats.updateDepthInfo(depth);
        }
      }

      // Check if canonical URL is different and should be queued
      const normalizedCanonical = canonical
        ? normalizeUrl(canonical, baseUrl)
        : null;
      const normalizedCurrent = normalizeUrl(url, baseUrl);
      const linksToQueue = [...links];

      if (normalizedCanonical && normalizedCanonical !== normalizedCurrent) {
        const canonicalUrlObj = new URL(normalizedCanonical);
        const baseUrlObj = new URL(baseUrl);
        if (canonicalUrlObj.hostname === baseUrlObj.hostname) {
          linksToQueue.push(normalizedCanonical);
        }
      }

      const maxDepth = cfg.maxDepth || 10;
      if (depth < maxDepth) {
        for (const link of linksToQueue) {
          try {
            const path = new URL(link).pathname;
            const isAllowed = isPathAllowed(path, robotsRules);

            if (!visited.has(link) && isAllowed) {
              visited.add(link);
              queue.push({ url: link, depth: depth + 1 });
            }
          } catch {}
        }
      }
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
        } catch (e) {
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
        await puppeteerBrowser.close();
      } catch (e) {
        console.error("Error closing browser:", e.message);
      }
    }
  }

  return sitemapData;
}

export async function crawlUrl(currentUrl, baseUrl, cfg, getBrowser) {
  let httpData = null;

  const origin = new URL(currentUrl).origin;
  const cachedDecision = renderCache.get(origin);
  const runHttp = cachedDecision !== "browser";

  if (runHttp) {
    try {
      httpData = await getLinksWithHTTP(baseUrl, currentUrl, cfg);
    } catch {
      // Lock origin to Browser rendering to avoid wasting time on subsequent URLs
      renderCache.set(origin, "browser");
    }
  }

  // Handle HTTP redirect target
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

  // If HTTP succeeded and it was not indexable, respect that decision (e.g. noindex)
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

  // If HTTP succeeded, is not CSR, and returned links, we are good to go (fast path)
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

    // Handle Puppeteer redirect target
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

      // Deduplicate alternates
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

export async function getLinksWithHTTP(baseUrl, currentUrl, cfg) {
  const cached = crawlCache[currentUrl];
  const headers = {};
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

  const finalUrl = response.request?.res?.responseUrl
    ? normalizeUrl(response.request.res.responseUrl, baseUrl)
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
      redirectTarget: finalUrl,
    };
  }

  // Gate on status 200 OK
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
    // Cache the failure as well to avoid re-requests
    crawlCache[currentUrl] = {
      lastmodHeader: response.headers["last-modified"] || null,
      etag: response.headers["etag"] || null,
      ...result,
    };
    return result;
  }

  const contentType = response.headers["content-type"] || "";
  if (
    contentType.includes("application/json") ||
    !contentType.includes("text/html")
  ) {
    const result = {
      links: [],
      isCSR: false,
      lastmod: null,
      alternates: [],
      canonical: null,
      isIndexable: false,
      images: [],
    };
    crawlCache[currentUrl] = {
      lastmodHeader: response.headers["last-modified"] || null,
      etag: response.headers["etag"] || null,
      ...result,
    };
    return result;
  }

  let html = response.data;
  if (typeof html !== "string") {
    html = String(html);
  }

  const root = parse(html);

  // Check last-modified
  const lastmodHeader = response.headers["last-modified"];
  let lastmod = null;
  if (lastmodHeader) {
    const parsedDate = new Date(lastmodHeader);
    if (!isNaN(parsedDate.getTime())) {
      lastmod = parsedDate.toISOString();
    }
  }

  // Gating indexability
  const pageIndexable = isIndexable(response.headers, root);
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
    crawlCache[currentUrl] = {
      lastmodHeader: response.headers["last-modified"] || null,
      etag: response.headers["etag"] || null,
      ...result,
    };
    return result;
  }

  const { links, alternates, canonical, images } = extractLinks(
    root,
    baseUrl,
    currentUrl,
  );

  // Gating canonical mismatch
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
    crawlCache[currentUrl] = {
      lastmodHeader: response.headers["last-modified"] || null,
      etag: response.headers["etag"] || null,
      ...result,
    };
    return result;
  }

  const isCSR = shouldRender(currentUrl, html, root);

  const result = {
    links: isCSR ? [] : links,
    isCSR,
    lastmod,
    alternates: isCSR ? [] : alternates,
    canonical: isCSR ? null : canonical,
    isIndexable: true,
    images: isCSR ? [] : images,
  };

  // Cache the successful HTTP results
  crawlCache[currentUrl] = {
    lastmodHeader: response.headers["last-modified"] || null,
    etag: response.headers["etag"] || null,
    ...result,
  };

  return result;
}

export async function getLinksWithPuppeteer(browser, baseUrl, currentUrl) {
  const page = await browser.newPage();

  try {
    // Intercept and block unnecessary media requests to save time
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
        redirectTarget: finalUrl,
      };
    }

    // Check header indexability
    const headers = response?.headers() || {};
    const xRobots = headers["x-robots-tag"];
    if (xRobots && /noindex/i.test(xRobots)) {
      return { links: [], alternates: [], canonical: null, isIndexable: false };
    }

    // Wait Strategy (race between body content density or selector markers)
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

    // Check meta noindex
    const metaNoIndex = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="robots" i]');
      return meta && /noindex/i.test(meta.getAttribute("content") || "");
    });

    if (metaNoIndex) {
      return { links: [], alternates: [], canonical: null, isIndexable: false };
    }

    const pageData = await page.evaluate((baseUrl) => {
      const links = [];
      const alternates = [];
      let canonical = null;

      // Piercing Shadow DOM to find all anchors
      function findAllAnchors(root = document) {
        const anchors = Array.from(root.querySelectorAll("a[href]"));
        const shadowRoots = Array.from(root.querySelectorAll("*"))
          .map((el) => el.shadowRoot)
          .filter(Boolean);
        for (const sr of shadowRoots) {
          anchors.push(...findAllAnchors(sr));
        }
        return anchors;
      }

      // Extract anchors
      const linkElements = findAllAnchors();
      for (const element of linkElements) {
        try {
          const href = element.getAttribute("href");
          if (!href) continue;
          const url = new URL(href, window.location.href);
          if (url.origin === baseUrl) {
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

      // Extract alternates and canonical
      const linkTags = document.querySelectorAll(
        'link[rel="canonical"], link[rel="alternate"]',
      );
      for (const link of linkTags) {
        try {
          const rel = link.getAttribute("rel")?.toLowerCase();
          const href = link.getAttribute("href");
          if (!href) continue;
          const url = new URL(href, window.location.href);
          if (url.origin === baseUrl) {
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
              const hreflang = link.getAttribute("hreflang");
              if (hreflang) {
                alternates.push({ hreflang, href: url.href });
              }
              links.push(url.href);
            }
          }
        } catch {}
      }

      // Extract images
      const images = [];
      const imgElements = document.querySelectorAll("img[src]");
      for (const element of imgElements) {
        try {
          const src = element.getAttribute("src");
          if (!src) continue;
          const url = new URL(src, window.location.href);
          images.push(url.href);
        } catch {}
      }

      return {
        links: [...new Set(links)],
        alternates,
        canonical,
        images: [...new Set(images)],
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
    } catch (e) {
      console.error("Error closing page:", e.message);
    }
  }
}

export function extractLinks(root, baseUrl, currentUrl) {
  const links = [];
  const alternates = [];
  let canonical = null;
  const baseUrlObj = new URL(baseUrl);
  const images = [];

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
      if (isValidImageUrl(normalized)) {
        images.push(normalized);
      }
    } catch {}
  }

  return {
    links: [...new Set(links)],
    alternates,
    canonical,
    images: [...new Set(images)],
  };
}

export async function processSitemapUrls(
  urls,
  baseUrl,
  maxPages,
  cfg,
  onProgress,
  robotsRules = { disallowed: [], allowed: [] },
  getBrowser,
) {
  const sitemapData = new Map();
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

  const processOne = async (url) => {
    if (onProgress) {
      onProgress(url, sitemapData.size + 1);
    }

    const {
      lastmod,
      isIndexable: pageIndexable,
      images,
    } = await getUrlMetadata(url, getBrowser);

    if (pageIndexable && sitemapData.size < maxPages) {
      const depth = new URL(url).pathname.split("/").filter(Boolean).length;
      const priority = calculatePriority(depth);
      sitemapData.set(url, {
        lastmod,
        priority,
        alternates: [],
        images: images || [],
      });
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
      } catch (error) {
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

export async function getUrlMetadata(url, getBrowser) {
  const cached = crawlCache[url];
  const headers = {};
  if (cached) {
    if (cached.lastmodHeader) {
      headers["If-Modified-Since"] = cached.lastmodHeader;
    }
    if (cached.etag) {
      headers["If-None-Match"] = cached.etag;
    }
  }

  let httpSuccess = false;
  let response = null;
  let root = null;
  let pageIndexable = false;

  const origin = new URL(url).origin;
  const cachedDecision = renderCache.get(origin);
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
        root = parse(response.data || "");
        pageIndexable = isIndexable(response.headers, root);
        httpSuccess = true;
      }
    } catch {
      renderCache.set(origin, "browser");
    }
  }

  if (httpSuccess) {
    if (!pageIndexable) {
      const result = { lastmod: null, isIndexable: false, images: [] };
      crawlCache[url] = {
        lastmodHeader: response.headers["last-modified"] || null,
        etag: response.headers["etag"] || null,
        ...result,
      };
      return result;
    }

    const lastmodHeader = response.headers["last-modified"];
    let lastmod = null;
    if (lastmodHeader) {
      const parsedDate = new Date(lastmodHeader);
      if (!isNaN(parsedDate.getTime())) {
        lastmod = parsedDate.toISOString();
      }
    }

    // Extract images
    const images = [];
    const imgTags = root.querySelectorAll("img");
    for (const img of imgTags) {
      const src = img.getAttribute("src");
      if (src) {
        try {
          const normalizedSrc = normalizeUrl(src, url);
          if (isValidImageUrl(normalizedSrc)) {
            images.push(normalizedSrc);
          }
        } catch {}
      }
    }

    const result = { lastmod, isIndexable: true, images: [...new Set(images)] };
    crawlCache[url] = {
      lastmodHeader: response.headers["last-modified"] || null,
      etag: response.headers["etag"] || null,
      ...result,
    };
    return result;
  }

  // Fallback to Puppeteer
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
          return meta && /noindex/i.test(meta.getAttribute("content") || "");
        });

        if (metaNoIndex) {
          return { lastmod: null, isIndexable: false, images: [] };
        }

        // Gating canonical redirects
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
        const images = await page.evaluate(() => {
          return Array.from(document.querySelectorAll("img[src]"))
            .map((img) => img.getAttribute("src"))
            .filter(Boolean);
        });
        const normalizedImages = images
          .map((src) => {
            try {
              return normalizeUrl(src, url);
            } catch {
              return null;
            }
          })
          .filter(Boolean)
          .filter(isValidImageUrl);

        return {
          lastmod: null,
          isIndexable: true,
          images: [...new Set(normalizedImages)],
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

export async function createSitemap(websiteUrl, maxPages = 100, onProgress) {
  renderCache.clear(); // Clear the render cache to start each crawl run fresh
  initCrawlCache(); // Load cached requests and initialize the object
  const stats = new SitemapStats(websiteUrl);
  const baseUrl = new URL(websiteUrl).origin;

  let puppeteerBrowser = null;
  const getBrowser = async () => {
    if (!puppeteerBrowser) {
      puppeteerBrowser = await puppeteer.launch({
        headless: true,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ],
      });
    }
    return puppeteerBrowser;
  };

  try {
    let robotsRules = { disallowed: [], allowed: [] };
    try {
      robotsRules = await fetchRobotsTxtRules(baseUrl, getBrowser);
    } catch (e) {
      console.error("Error setting up robots.txt rules:", e.message);
    }

    stats.setRobotsTxtInfo(robotsRules.disallowed.map((r) => r.pattern));

    const sitemapUrlsList = await discoverSitemap(baseUrl, getBrowser);
    let sitemapUrls = [];

    if (sitemapUrlsList && sitemapUrlsList.length > 0) {
      const parsedResults = await Promise.all(
        sitemapUrlsList.map((url) =>
          fetchAndParseSitemap(url, getBrowser).catch(() => []),
        ),
      );
      sitemapUrls = [...new Set(parsedResults.flat())];
      stats.setSitemapPages(sitemapUrls.length);

      if (onProgress) {
        onProgress(
          `Sitemap: ${sitemapUrls.length} URLs | Starting crawl for more...`,
          0,
        );
      }
    }

    if (onProgress) {
      onProgress(
        `Crawling from homepage to find more pages...`,
        sitemapUrls.length,
      );
    }

    const crawledData = await crawlSite(
      baseUrl,
      maxPages,
      config,
      (url, count) => {
        if (onProgress) {
          onProgress(url, sitemapUrls.length + count);
        }
      },
      robotsRules,
      stats,
      getBrowser,
    );

    const allUrls = new Set([
      ...sitemapUrls,
      ...Array.from(crawledData.keys()),
    ]);

    if (onProgress) {
      onProgress(
        `Merging results: ${allUrls.size} unique URLs found`,
        allUrls.size,
      );
    }

    const finalData = new Map(crawledData);
    const uncrawledUrls = sitemapUrls.filter((url) => !finalData.has(url));

    if (uncrawledUrls.length > 0 && finalData.size < maxPages) {
      const remainingSlots = maxPages - finalData.size;
      const additionalData = await processSitemapUrls(
        uncrawledUrls,
        baseUrl,
        remainingSlots,
        config,
        (url, count) => {
          if (onProgress) {
            onProgress(url, finalData.size + count);
          }
        },
        robotsRules,
        getBrowser,
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

    if (onProgress) {
      onProgress(`Complete! ${finalData.size} pages processed`, finalData.size);
    }

    await stats.save();
    saveCache(crawlCache);
    console.log(stats.getSummary());

    return {
      sitemap: generateSitemap(finalData),
      stats: stats.toJSON(),
    };
  } catch (error) {
    console.error("Critical error during createSitemap:", error.message);
    try {
      // Persist partial stats collected on error
      await stats.save();
      saveCache(crawlCache);
    } catch (saveError) {
      console.error("Could not save partial stats:", saveError.message);
    }
    throw error;
  } finally {
    if (puppeteerBrowser) {
      try {
        await puppeteerBrowser.close();
      } catch (e) {
        console.error(
          "Error closing browser in createSitemap finally block:",
          e.message,
        );
      }
    }
  }
}
