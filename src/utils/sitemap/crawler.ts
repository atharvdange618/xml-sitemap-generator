import puppeteer, { Browser, Page } from "puppeteer";
import { parse, HTMLElement } from "node-html-parser";
import { SitemapStats } from "../statsLogger";
import { config, CrawlerConfig } from "./config";
import { CrawlCaches, createCrawlCaches, setCrawlCache } from "./cache";
import {
  isValidImageUrl,
  normalizeUrl,
  isValidUrl,
  isSameOrWwwDomain,
} from "./urlUtils";
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
  private pendingCreations = new Map<Browser, number>();
  private recycleScheduled = false;
  private maxPages = 100;

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
      this.pendingCreations.set(this.currentBrowser, 0);
    }
  }

  private async tryRecycle(browserToUse: Browser) {
    const active = this.activePagesPerBrowser.get(browserToUse) || 0;
    const pending = this.pendingCreations.get(browserToUse) || 0;
    if (active === 0 && pending === 0 && this.recycleScheduled && browserToUse === this.currentBrowser) {
      console.log("[RecyclableBrowser] Recycling browser now that all pages are closed");
      this.currentBrowser = null;
      this.recycleScheduled = false;
      this.activePagesPerBrowser.delete(browserToUse);
      this.pendingCreations.delete(browserToUse);
      try { await browserToUse.close(); } catch {}
      try { browserToUse.process()?.kill(); } catch {}
    }
  }

  async newPage(): Promise<Page> {
    await this.init();
    const browserToUse = this.currentBrowser!;

    const pending = this.pendingCreations.get(browserToUse) || 0;
    this.pendingCreations.set(browserToUse, pending + 1);
    this.currentBrowserPagesOpened++;

    if (!this.recycleScheduled && this.currentBrowserPagesOpened >= this.maxPages) {
      console.log(`[RecyclableBrowser] Scheduling browser recycle after ${this.currentBrowserPagesOpened} pages`);
      this.recycleScheduled = true;
    }

    let page: Page;
    try {
      page = await browserToUse.newPage();
    } catch (e) {
      const p = this.pendingCreations.get(browserToUse) || 0;
      this.pendingCreations.set(browserToUse, Math.max(0, p - 1));
      this.tryRecycle(browserToUse);
      throw e;
    }

    const p = this.pendingCreations.get(browserToUse) || 0;
    this.pendingCreations.set(browserToUse, Math.max(0, p - 1));
    const currentActive = this.activePagesPerBrowser.get(browserToUse) || 0;
    this.activePagesPerBrowser.set(browserToUse, currentActive + 1);

    const realClose = page.close.bind(page);
    let closed = false;
    page.close = async () => {
      if (!closed) {
        closed = true;
        const active = this.activePagesPerBrowser.get(browserToUse) || 0;
        this.activePagesPerBrowser.set(browserToUse, Math.max(0, active - 1));
        await this.tryRecycle(browserToUse);
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
      this.pendingCreations.delete(browser);
      try { await browser.close(); } catch {}
      try { browser.process()?.kill(); } catch {}
    }
    this.activePagesPerBrowser.clear();
    this.pendingCreations.clear();
  }
}

export function calculatePriority(depth: number): string {
  return Math.max(0.1, 1.0 - depth * 0.1).toFixed(1);
}

export function isIndexable(headers: Record<string, string> | undefined, root: HTMLElement): boolean {
  const xRobots = headers?.["x-robots-tag"];
  if (xRobots && /noindex/i.test(String(xRobots))) return false;
  const metaRobots = root.querySelector('meta[name="robots" i]');
  if (metaRobots) {
    const content = metaRobots.getAttribute("content");
    if (content && /noindex/i.test(content)) return false;
  }
  return true;
}

export function detectCSR(html: string, root: HTMLElement): boolean {
  let score = 0;
  if (html.includes("__NEXT_DATA__") || html.includes("self.__next_f") || html.includes("window.__NUXT__") ||
      html.includes("__remixContext") || html.includes("__remixManifest") || html.includes("astro-island") ||
      html.includes("data-sveltekit-hydrate") || html.includes("__sveltekit_")) return false;
  if (/<noscript>[^<]*(enable javascript|requires javascript|javascript is required|turn on javascript)/i.test(html)) return true;
  const body = root.querySelector("body");
  if (!body) return true;
  const bodyClone = parse(body.outerHTML);
  bodyClone.querySelectorAll("script, style, template, noscript").forEach(el => el.remove());
  const visibleTextLen = bodyClone.text.replace(/\s+/g, " ").trim().length;
  if (visibleTextLen < 200) score += 3; else if (visibleTextLen < 800) score += 1;
  const roots = ["#root", "#__next", "#app", "#__nuxt", "[ng-version]"];
  const hasRoot = roots.some(s => root.querySelector(s));
  const rootIsEmpty = roots.some(s => { const e = root.querySelector(s); return e && e.childNodes.length === 0; });
  if (hasRoot && rootIsEmpty) score += 4; else if (hasRoot && visibleTextLen < 500) score += 2;
  const splash = body.querySelector('[class*="loading" i], [class*="spinner" i]');
  if (splash && bodyClone.childNodes.length <= 3) score += 2;
  return score >= 3;
}

function getRenderCacheKey(url: string): string {
  const origin = new URL(url).origin;
  const parts = url.split("?")[0].split("/").filter(Boolean);
  return `${origin}:${parts[0] || "__root__"}`;
}

export function shouldRender(currentUrl: string, html: string, root: HTMLElement, renderCache: Map<string, any>): boolean {
  try {
    const cacheKey = getRenderCacheKey(currentUrl);
    const cached = renderCache.get(cacheKey);
    if (cached === "http") return false;
    if (cached === "browser") return true;
    const isCSR = detectCSR(html, root);
    const samples = renderCache.get(`${cacheKey}:samples`) || [];
    samples.push(isCSR);
    if (samples.length >= 3 && samples.every((s: any) => s === samples[0])) {
      renderCache.set(cacheKey, samples[0] ? "browser" : "http");
    } else {
      renderCache.set(`${cacheKey}:samples`, samples);
    }
    return isCSR;
  } catch { return detectCSR(html, root); }
}

export async function crawlSite(
  baseUrl: string, maxPages = 100, cfg: CrawlerConfig = config,
  onProgress?: (url: string, count: number) => void,
  robotsRules: RobotsRulesCompiled = { disallowed: [], allowed: [] },
  stats: SitemapStats | null = null,
  getBrowserArg: (() => Promise<Browser>) | null = null,
  caches: CrawlCaches = createCrawlCaches(),
  signal?: AbortSignal,
): Promise<Map<string, SitemapItem>> {
  const sitemapData = new Map<string, SitemapItem>();
  const normalizedBase = normalizeUrl(baseUrl, baseUrl);
  const queue = [{ url: normalizedBase, depth: 0 }];
  const visited = new Set([normalizedBase]);
  let puppeteerBrowser: any = null;
  let activeCount = 0;

  const getBrowser = getBrowserArg || (async () => {
    if (!puppeteerBrowser) puppeteerBrowser = new RecyclableBrowser();
    return puppeteerBrowser as any as Browser;
  });

  const next = () => {
    if (queue.length > 0 && sitemapData.size + activeCount < maxPages) return queue.shift()!;
    return null;
  };

  const processOne = async ({ url, depth }: { url: string; depth: number }) => {
    if (signal?.aborted) return;
    const canonicalChain = new Set<string>();
    canonicalChain.add(normalizeUrl(url, baseUrl));
    let currentUrl = url;
    let currentDepth = depth;

    while (true) {
      const result = await crawlUrl(currentUrl, baseUrl, cfg, getBrowser, caches, signal);
      const { links, lastmod, alternates, canonical, isIndexable: pageIndexable, images } = result;

      const normalizedCanonical = canonical ? normalizeUrl(canonical, baseUrl) : null;
      const normalizedCurrent = normalizeUrl(currentUrl, baseUrl);
      let followTarget: string | null = null;
      if (!pageIndexable) {
        if (links.length === 1 && links[0] !== normalizedCurrent) {
          try { if (isSameOrWwwDomain(links[0], baseUrl)) followTarget = links[0]; } catch {}
        }
        if (!followTarget && normalizedCanonical && normalizedCanonical !== normalizedCurrent) {
          try { if (isSameOrWwwDomain(normalizedCanonical, baseUrl)) followTarget = normalizedCanonical; } catch {}
        }
      }

      if (followTarget && !canonicalChain.has(followTarget) && !visited.has(followTarget)) {
        canonicalChain.add(followTarget);
        currentUrl = followTarget;
        continue;
      }

      if (sitemapData.size < maxPages) {
        const priority = calculatePriority(currentDepth);
        if (pageIndexable) {
          sitemapData.set(currentUrl, { lastmod, priority, alternates, images });
          if (onProgress) onProgress(currentUrl, Math.min(sitemapData.size, maxPages));
          if (stats) { stats.incrementCrawledPages(); stats.updateDepthInfo(currentDepth); }
        }
        const maxDepth = cfg.maxDepth || 10;
        if (currentDepth < maxDepth) {
          for (const link of links) {
            try {
              if (!visited.has(link) && isPathAllowed(new URL(link).pathname, robotsRules)) {
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
        if (signal?.aborted) break;
        const item = next();
        if (!item) { if (activeCount === 0) break; await new Promise(r => setTimeout(r, 100)); continue; }
        activeCount++;
        try { await processOne(item); } catch (e: any) {
          console.error(`Error processing ${item.url}:`, e.message);
          if (stats) stats.addError(item.url, e.message);
        } finally { activeCount--; }
      }
    });
    await Promise.all(workers);
  } catch (e: any) {
    if (e?.name === "AbortError" || signal?.aborted) {
      console.log(`[crawlSite] AbortSignal received, stopping crawl at ${sitemapData.size} pages`);
    } else { console.error("Error in crawlSite:", e.message); throw e; }
  } finally {
    if (puppeteerBrowser && !getBrowserArg) {
      try { await (puppeteerBrowser as Browser).close(); } catch (e: any) { console.error("Error closing browser:", e.message); }
    }
  }
  return sitemapData;
}

export async function crawlUrl(
  currentUrl: string, baseUrl: string, cfg: CrawlerConfig,
  getBrowser: () => Promise<Browser>, caches: CrawlCaches,
  signal?: AbortSignal,
): Promise<{ links: string[]; lastmod: string|null; alternates: {hreflang:string;href:string}[]; canonical: string|null; isIndexable: boolean; images: string[]; redirectTarget?: string }> {
  let httpData: any = null;
  const origin = new URL(currentUrl).origin;
  const cacheKey = `${origin}:${new URL(currentUrl).pathname.split("/").filter(Boolean)[0] || "__root__"}`;
  const cachedDecision = caches.renderCache.get(`${origin}`) || caches.renderCache.get(cacheKey);
  const runHttp = cachedDecision !== "browser";

  if (runHttp) {
    try {
      httpData = await getLinksWithHTTP(baseUrl, currentUrl, cfg, caches, signal);
      caches.renderCache.delete(`${origin}:httpBlocked`);
    } catch {
      const failures = (caches.renderCache.get(`${cacheKey}:failures`) || 0) + 1;
      caches.renderCache.set(`${cacheKey}:failures`, failures);
      if (failures >= 3) { console.log(`[crawlUrl] Path ${cacheKey} locked to browser after ${failures} HTTP failures`); caches.renderCache.set(cacheKey, "browser"); }
      const blockedPaths = (caches.renderCache.get(`${origin}:httpBlocked`) || 0) + 1;
      caches.renderCache.set(`${origin}:httpBlocked`, blockedPaths);
      if (blockedPaths >= 3) { console.log(`[crawlUrl] Origin ${origin} domain-wide skip HTTP after ${blockedPaths} path failures`); caches.renderCache.set(`${origin}`, "browser"); }
    }
  }

  if (httpData?.redirectTarget) {
    try { if (isSameOrWwwDomain(httpData.redirectTarget, baseUrl)) return { links: [httpData.redirectTarget], lastmod: null, alternates: [], canonical: null, isIndexable: false, images: httpData?.images || [] }; } catch {}
    return { links: [], lastmod: null, alternates: [], canonical: null, isIndexable: false, images: httpData?.images || [] };
  }
  if (httpData && !httpData.isIndexable) return { links: [], lastmod: httpData.lastmod, alternates: [], canonical: httpData.canonical, isIndexable: false, images: httpData?.images || [] };

  if (httpData && !httpData.isCSR && httpData.links.length > 0) {
    const nCanonical = httpData.canonical ? normalizeUrl(httpData.canonical, baseUrl) : null;
    if (nCanonical && nCanonical !== normalizeUrl(currentUrl, baseUrl)) {
      return { links: [], lastmod: httpData.lastmod, alternates: [], canonical: httpData.canonical, isIndexable: false, images: httpData?.images || [] };
    }
    return { links: httpData.links, lastmod: httpData.lastmod, alternates: httpData.alternates, canonical: httpData.canonical, isIndexable: true, images: httpData.images || [] };
  }

  try {
    const browser = await getBrowser();
    const pd = await getLinksWithPuppeteer(browser, baseUrl, currentUrl, signal);
    if (pd.redirectTarget) {
      try { if (isSameOrWwwDomain(pd.redirectTarget, baseUrl)) return { links: [pd.redirectTarget], lastmod: null, alternates: [], canonical: null, isIndexable: false, images: httpData?.images || [] }; } catch {}
      return { links: [], lastmod: null, alternates: [], canonical: null, isIndexable: false, images: httpData?.images || [] };
    }
    if (pd.isIndexable) {
      const normalizedPdLinks = pd.links.map(l => { try { return normalizeUrl(l, baseUrl); } catch { return l; } }).filter(l => {
        try { return isValidUrl(l) && isSameOrWwwDomain(l, baseUrl); } catch { return false; }
      });
      const finalLinks = [...new Set([...(httpData?.links || []), ...normalizedPdLinks])];
      const finalImages = [...new Set([...(httpData?.images || []), ...(pd.images || [])])].filter(isValidImageUrl);
      const altMap = new Map();
      for (const a of [...(httpData?.alternates || []), ...pd.alternates]) altMap.set(a.hreflang, a);
      const finalCanonical = pd.canonical || httpData?.canonical || null;
      const lastmod = httpData?.lastmod || null;
      if (finalCanonical && normalizeUrl(finalCanonical, baseUrl) !== normalizeUrl(currentUrl, baseUrl)) {
        return { links: [], lastmod, alternates: [], canonical: finalCanonical, isIndexable: false, images: finalImages };
      }
      return { links: finalLinks, lastmod, alternates: Array.from(altMap.values()), canonical: finalCanonical, isIndexable: true, images: finalImages };
    }
    return { links: [], lastmod: httpData?.lastmod || null, alternates: [], canonical: pd.canonical, isIndexable: false, images: httpData?.images || [] };
  } catch (e: any) {
    console.error(`[crawlUrl] Puppeteer fallback failed for ${currentUrl}:`, e.message || e);
    return { links: [], lastmod: null, alternates: [], canonical: null, isIndexable: false, images: [] };
  }
}

export async function getLinksWithHTTP(
  baseUrl: string, currentUrl: string, cfg: CrawlerConfig, caches: CrawlCaches,
  signal?: AbortSignal,
): Promise<{ links: string[]; isCSR: boolean; lastmod: string|null; alternates: {hreflang:string;href:string}[]; canonical: string|null; isIndexable: boolean; images: string[]; redirectTarget?: string }> {
  const cached = caches.crawlCache[currentUrl];
  const headers: Record<string, string> = {};
  if (cached) { if (cached.lastmodHeader) headers["If-Modified-Since"] = cached.lastmodHeader; if (cached.etag) headers["If-None-Match"] = cached.etag; }

  const hostname = new URL(currentUrl).hostname;
  const bareHost = hostname.replace(/^www\./, "");
  const timeoutMs = (cfg?.timeoutOverrides[hostname] >= 1000) ? cfg.timeoutOverrides[hostname]
    : (cfg?.timeoutOverrides[bareHost] >= 1000) ? cfg.timeoutOverrides[bareHost] : cfg?.defaultTimeout;

  const response = await fetchWithRetry(currentUrl, headers, 3, signal, timeoutMs);

  if (response.status === 304 && cached) {
    return { links: cached.links, isCSR: cached.isCSR || false, lastmod: cached.lastmod || null, alternates: cached.alternates || [], canonical: cached.canonical || null, isIndexable: cached.isIndexable !== false, images: cached.images || [] };
  }

  const finalUrl = (response.request as any)?.res?.responseUrl ? normalizeUrl((response.request as any).res.responseUrl, baseUrl) : null;
  if (finalUrl && finalUrl !== normalizeUrl(currentUrl, baseUrl)) {
    return { links: [], isCSR: false, lastmod: null, alternates: [], canonical: null, isIndexable: false, images: [], redirectTarget: finalUrl };
  }

  if (response.status !== 200) {
    if (response.status === 404) {
      const r = { links: [], isCSR: false, lastmod: null, alternates: [], canonical: null, isIndexable: false, images: [] };
      setCrawlCache(caches, currentUrl, { lastmodHeader: response.headers["last-modified"] || null, etag: response.headers.etag || null, ...r });
      return r;
    }
    throw new Error(`HTTP status ${response.status}`);
  }

  const ct = (response.headers["content-type"] as string) || "";
  const isHtml = ct.includes("text/html") || ct.includes("application/xhtml+xml");
  if (ct.includes("application/json") || !isHtml) {
    const r = { links: [], isCSR: false, lastmod: null, alternates: [], canonical: null, isIndexable: false, images: [] };
    setCrawlCache(caches, currentUrl, { lastmodHeader: response.headers["last-modified"] || null, etag: response.headers.etag || null, ...r });
    return r;
  }

  let html = response.data; if (typeof html !== "string") html = String(html);
  const root = parse(html);

  let lastmod = null;
  const lm = response.headers["last-modified"] as string;
  if (lm) { const d = new Date(lm); if (!isNaN(d.getTime())) lastmod = d.toISOString(); }

  if (!isIndexable(response.headers as any, root)) {
    const r = { links: [], isCSR: false, lastmod, alternates: [], canonical: null, isIndexable: false, images: [] };
    setCrawlCache(caches, currentUrl, { lastmodHeader: lm || null, etag: response.headers.etag || null, ...r });
    return r;
  }

  const { links, alternates, canonical, images } = extractLinks(root, baseUrl, currentUrl);
  const nCanonical = canonical ? normalizeUrl(canonical, baseUrl) : null;
  if (nCanonical && nCanonical !== normalizeUrl(currentUrl, baseUrl)) {
    const r = { links, isCSR: false, lastmod, alternates, canonical, isIndexable: false, images };
    setCrawlCache(caches, currentUrl, { lastmodHeader: lm || null, etag: response.headers.etag || null, ...r });
    return r;
  }

  const isCSR = shouldRender(currentUrl, html, root, caches.renderCache);
  const r = { links: isCSR ? [] : links, isCSR, lastmod, alternates: isCSR ? [] : alternates, canonical: isCSR ? null : canonical, isIndexable: true, images };
  setCrawlCache(caches, currentUrl, { lastmodHeader: lm || null, etag: response.headers.etag || null, ...r });
  return r;
}

export async function getLinksWithPuppeteer(
  browser: Browser, baseUrl: string, currentUrl: string, signal?: AbortSignal,
): Promise<{ links: string[]; alternates: {hreflang:string;href:string}[]; canonical: string|null; isIndexable: boolean; images: string[]; redirectTarget?: string }> {
  const page = await browser.newPage();
  try {
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1280, height: 800 });
    await page.setRequestInterception(true);
    page.on("request", req => {
      if (["image", "media", "font"].includes(req.resourceType())) req.abort(); else req.continue();
    });

    const response = await page.goto(currentUrl, { waitUntil: "domcontentloaded", timeout: 15000, signal });

    const finalUrl = response ? normalizeUrl(response.url(), baseUrl) : null;
    if (finalUrl && finalUrl !== normalizeUrl(currentUrl, baseUrl)) {
      return { links: [], alternates: [], canonical: null, isIndexable: false, images: [], redirectTarget: finalUrl };
    }

    const headers = response?.headers() || {};
    if (headers["x-robots-tag"] && /noindex/i.test(headers["x-robots-tag"])) {
      return { links: [], alternates: [], canonical: null, isIndexable: false, images: [] };
    }

    await Promise.race([
      page.waitForFunction(`document.body && document.body.innerText.replace(/\\s+/g, " ").trim().length > 300`, { timeout: 8000 }),
      page.waitForSelector('main, article, [role="main"], #__next, #root, #app', { timeout: 8000 }),
    ]).catch(() => {});

    if (await page.evaluate(`(() => { const m = document.querySelector('meta[name="robots" i]'); return !!(m && /noindex/i.test(m.getAttribute("content") || "")); })()`)) {
      return { links: [], alternates: [], canonical: null, isIndexable: false, images: [] };
    }

    const pageData = (await page.evaluate(`((baseUrlStr) => {
      const links = [];
      const alternates = [];
      let canonical = null;
      function findAllAnchors(rootNode, depth) {
        if (!rootNode) rootNode = document;
        if (depth === undefined) depth = 0;
        if (depth > 10) return [];
        const anchors = Array.from(rootNode.querySelectorAll("a[href]"));
        const shadowRoots = Array.from(rootNode.querySelectorAll("*")).map(el=>el.shadowRoot).filter(Boolean);
        for (const sr of shadowRoots) anchors.push(...findAllAnchors(sr, depth+1));
        return anchors;
      }
      for (const el of findAllAnchors()) {
        try {
          const href = el.getAttribute("href"); if (!href) continue;
          const url = new URL(href, window.location.href);
          if (url.origin !== baseUrlStr) continue;
          url.hash = "";
          const bl = ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","utm_id","fbclid","gclid","dclid","msclkid","jsessionid","phpsessid"];
          const p = new URLSearchParams(url.search);
          for (const k of Array.from(p.keys())) { if (bl.includes(k.toLowerCase())) p.delete(k); }
          const s = p.toString(); url.search = s ? "?"+s : "";
          if (url.pathname.length>1 && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0,-1);
          links.push(url.href);
        } catch {}
      }
      for (const lt of Array.from(document.querySelectorAll('link[rel="canonical"], link[rel="alternate"]'))) {
        try {
          const rel = lt.getAttribute("rel")?.toLowerCase();
          const href = lt.getAttribute("href"); if (!href) continue;
          const url = new URL(href, window.location.href);
          if (url.origin !== baseUrlStr) continue;
          url.hash = "";
          const bl = ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","utm_id","fbclid","gclid","dclid","msclkid","jsessionid","phpsessid"];
          const p = new URLSearchParams(url.search);
          for (const k of Array.from(p.keys())) { if (bl.includes(k.toLowerCase())) p.delete(k); }
          const s = p.toString(); url.search = s ? "?"+s : "";
          if (url.pathname.length>1 && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0,-1);
          if (rel==="canonical") canonical = url.href;
          else if (rel==="alternate") { const hl = lt.getAttribute("hreflang"); if (hl) alternates.push({hreflang:hl,href:url.href}); links.push(url.href); }
        } catch {}
      }
      const images = [];
      const imgEls = document.querySelectorAll("img[src], img[data-src], img[data-lazy-src], img[data-original]");
      for (const img of Array.from(imgEls)) {
        try {
          const src = img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original");
          if (!src) continue;
          images.push(new URL(src, window.location.href).href);
        } catch {}
      }
      for (const el of Array.from(document.querySelectorAll("img[srcset], img[data-srcset], source[srcset], source[data-srcset]"))) {
        try {
          const ss = el.getAttribute("srcset") || el.getAttribute("data-srcset"); if (!ss) continue;
          const candidates = ss.split(",").map(c => { const parts = c.trim().split(/\\s+/); return {url:parts[0],size:parts[1]? (parts[1].endsWith("x")?parseFloat(parts[1]):parseInt(parts[1],10)):1 }; });
          if (candidates.length) { const largest = candidates.reduce((a,b)=>a.size>b.size?a:b); images.push(new URL(largest.url, window.location.href).href); }
        } catch {}
      }
      return { links: Array.from(new Set(links)), alternates, canonical, images: Array.from(new Set(images)) };
    })('${baseUrl}')`)) as any;

    return { links: pageData.links, alternates: pageData.alternates, canonical: pageData.canonical, isIndexable: true, images: pageData.images };
  } finally { try { await page.close(); } catch {} }
}

export function extractLinks(root: HTMLElement, baseUrl: string, currentUrl: string): {
  links: string[]; alternates: {hreflang:string;href:string}[]; canonical: string|null; images: string[];
} {
  const links: string[] = [];
  const alternates: {hreflang:string;href:string}[] = [];
  let canonical: string|null = null;
  const images: string[] = [];

  for (const a of root.querySelectorAll("a")) {
    const href = a.getAttribute("href"); if (!href) continue;
    try { const n = normalizeUrl(href, currentUrl); if (isSameOrWwwDomain(n, baseUrl) && isValidUrl(n)) links.push(n); } catch {}
  }

  for (const lt of root.querySelectorAll('link[rel="canonical"], link[rel="alternate"]')) {
    const rel = lt.getAttribute("rel")?.toLowerCase();
    const href = lt.getAttribute("href"); if (!href) continue;
    try {
      const n = normalizeUrl(href, currentUrl);
      if (isSameOrWwwDomain(n, baseUrl)) {
        if (rel === "canonical") canonical = n;
        else if (rel === "alternate") { const hl = lt.getAttribute("hreflang"); if (hl) alternates.push({ hreflang: hl, href: n }); if (isValidUrl(n)) links.push(n); }
      }
    } catch {}
  }

  // Regular src + lazy-load attributes
  for (const img of root.querySelectorAll("img[src], img[data-src], img[data-lazy-src], img[data-original]")) {
    const src = img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original");
    if (!src) continue;
    try {
      const n = normalizeUrl(src, currentUrl);
      try { new URL(n); } catch { continue; }
      if (isValidImageUrl(n)) images.push(n);
    } catch {}
  }

  // srcset from img and source elements
  for (const el of root.querySelectorAll("img[srcset], img[data-srcset], source[srcset], source[data-srcset]")) {
    const ss = el.getAttribute("srcset") || el.getAttribute("data-srcset");
    if (!ss) continue;
    try {
      const candidates = ss.split(",").map(c => {
        const parts = c.trim().split(/\s+/);
        return { url: parts[0], size: parts[1] ? (parts[1].endsWith("x") ? parseFloat(parts[1]) : parseInt(parts[1], 10)) : 1 };
      });
      if (candidates.length) {
        const largest = candidates.reduce((a, b) => a.size > b.size ? a : b);
        const n = normalizeUrl(largest.url, currentUrl);
        try { new URL(n); } catch { continue; }
        if (isValidImageUrl(n)) images.push(n);
      }
    } catch {}
  }

  return { links: Array.from(new Set(links)), alternates, canonical, images: Array.from(new Set(images)) };
}

export async function processSitemapUrls(
  urls: string[], baseUrl: string, maxPages: number, cfg: CrawlerConfig,
  onProgress?: (url:string,count:number)=>void,
  robotsRules: RobotsRulesCompiled = { disallowed: [], allowed: [] },
  getBrowser?: ()=>Promise<Browser>, caches?: CrawlCaches,
  signal?: AbortSignal,
): Promise<Map<string, SitemapItem>> {
  const sitemapData = new Map<string, SitemapItem>();
  const urlsToProcess = urls.filter(url => {
    try { return isPathAllowed(new URL(url).pathname, robotsRules) && isSameOrWwwDomain(url, baseUrl); } catch { return false; }
  }).slice(0, maxPages);

  let activeCount = 0, idx = 0;
  const nextUrl = () => idx < urlsToProcess.length && sitemapData.size + activeCount < maxPages ? urlsToProcess[idx++] : null;

  const processOne = async (url: string) => {
    if (sitemapData.size >= maxPages) return;
    const { lastmod, isIndexable, images } = await getUrlMetadata(url, getBrowser, caches, signal);
    if (isIndexable && sitemapData.size < maxPages) {
      const depth = new URL(url).pathname.split("/").filter(Boolean).length;
      sitemapData.set(url, { lastmod, priority: calculatePriority(depth), alternates: [], images: images?.map(img => typeof img === "string" ? { loc: img } : img) || [] });
      if (onProgress) onProgress(url, Math.min(sitemapData.size, maxPages));
    }
  };

  const wc = cfg.concurrency || CONCURRENCY;
  await Promise.all(Array.from({ length: wc }, async () => {
    while (true) {
      if (signal?.aborted) break;
      const url = nextUrl(); if (!url) break;
      activeCount++;
      try { await processOne(url); } catch (e: any) { console.error(`Error processing sitemap URL ${url}:`, e.message); }
      finally { activeCount--; }
    }
  }));

  return sitemapData.size > maxPages ? new Map(Array.from(sitemapData.entries()).slice(0, maxPages)) : sitemapData;
}

export async function getUrlMetadata(
  url: string, getBrowser?: () => Promise<Browser>, caches?: CrawlCaches,
  signal?: AbortSignal,
): Promise<{ lastmod: string|null; isIndexable: boolean; images: string[] }> {
  const cached = caches ? caches.crawlCache[url] : undefined;
  const headers: Record<string,string> = {};
  if (cached) { if (cached.lastmodHeader) headers["If-Modified-Since"] = cached.lastmodHeader; if (cached.etag) headers["If-None-Match"] = cached.etag; }

  let response: any = null, root: HTMLElement|null = null, pageIndexable = false, httpSuccess = false;
  const uo = new URL(url).origin;
  const upk = `${uo}:${new URL(url).pathname.split("/").filter(Boolean)[0] || "__root__"}`;
  const cachedDecision = caches ? (caches.renderCache.get(`${uo}`) || caches.renderCache.get(upk)) : undefined;
  const runHttp = cachedDecision !== "browser";

  if (runHttp) {
    try {
      response = await fetchWithRetry(url, headers, 3, signal);
      if (caches) caches.renderCache.delete(`${uo}:httpBlocked`);
      if (response.status === 304 && cached) return { lastmod: cached.lastmod || null, isIndexable: cached.isIndexable !== false, images: cached.images || [] };
      if (response.status === 200) {
        const ct = (response.headers["content-type"] as string) || "";
        if ((ct.includes("text/html") || ct.includes("application/xhtml+xml")) && !ct.includes("application/json")) {
          root = parse(response.data || ""); pageIndexable = isIndexable(response.headers as any, root); httpSuccess = true;
        }
      }
    } catch {
      if (caches) {
        const f = (caches.renderCache.get(`${upk}:failures`) || 0) + 1;
        caches.renderCache.set(`${upk}:failures`, f);
        if (f >= 5) caches.renderCache.set(upk, "browser");
        const bp = (caches.renderCache.get(`${uo}:httpBlocked`) || 0) + 1;
        caches.renderCache.set(`${uo}:httpBlocked`, bp);
        if (bp >= 6) caches.renderCache.set(`${uo}`, "browser");
      }
    }
  }

  if (httpSuccess && response && root) {
    if (!pageIndexable) {
      const r = { lastmod: null, isIndexable: false, images: [] as string[] };
      if (caches) setCrawlCache(caches, url, { lastmodHeader: response.headers["last-modified"] || null, etag: response.headers.etag || null, ...r });
      return r;
    }
    let lastmod = null; const lm = response.headers["last-modified"] as string;
    if (lm) { const d = new Date(lm); if (!isNaN(d.getTime())) lastmod = d.toISOString(); }

    const images: string[] = [];
    for (const img of root.querySelectorAll("img[src], img[data-src], img[data-lazy-src], img[data-original]")) {
      const src = img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original");
      if (!src) continue;
      try { const n = normalizeUrl(src, url); try { new URL(n); } catch { continue; } if (isValidImageUrl(n)) images.push(n); } catch {}
    }
    const r = { lastmod, isIndexable: true, images: Array.from(new Set(images)) };
    if (caches) setCrawlCache(caches, url, { lastmodHeader: response.headers["last-modified"] || null, etag: response.headers.etag || null, ...r });
    return r;
  }

  if (getBrowser) {
    try {
      const browser = await getBrowser();
      const page = await browser.newPage();
      try {
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        await page.setViewport({ width: 1280, height: 800 });
        await page.setRequestInterception(true);
        page.on("request", req => { if (["image","media","font"].includes(req.resourceType())) req.abort(); else req.continue(); });
        const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
        const hdrs = res?.headers() || {};
        if (hdrs["x-robots-tag"] && /noindex/i.test(hdrs["x-robots-tag"])) return { lastmod: null, isIndexable: false, images: [] };
        if (await page.evaluate(`(()=>{const m=document.querySelector('meta[name="robots" i]');return!!(m&&/noindex/i.test(m.getAttribute("content")||""));})()`)) return { lastmod: null, isIndexable: false, images: [] };
        const canonical = (await page.evaluate(`(()=>{const l=document.querySelector('link[rel="canonical"]');return l?l.getAttribute("href"):null;})()`)) as string|null;
        if (canonical && normalizeUrl(canonical, url) !== normalizeUrl(url, url)) return { lastmod: null, isIndexable: false, images: [] };

        const imgUrls = (await page.evaluate(`(()=>{
          const u=[];
          for(const img of document.querySelectorAll("img[src], img[data-src], img[data-lazy-src], img[data-original]")){
            const s=img.getAttribute("src")||img.getAttribute("data-src")||img.getAttribute("data-lazy-src")||img.getAttribute("data-original");
            if(s) u.push(s);
          }
          return u;
        })()`)) as string[];
        const valid = imgUrls.map(s => { try { return normalizeUrl(s, url); } catch { return null; } }).filter(Boolean) as string[];
        return { lastmod: null, isIndexable: true, images: Array.from(new Set(valid.filter(isValidImageUrl))) };
      } finally { try { await page.close(); } catch {} }
    } catch (e: any) {
      console.error(`[getUrlMetadata] Puppeteer fallback failed for ${url}:`, e.message || e);
      return { lastmod: null, isIndexable: false, images: [] };
    }
  }
  return { lastmod: null, isIndexable: false, images: [] };
}

export async function createSitemap(
  websiteUrl: string, maxPages = 100,
  onProgress?: (url: string, count: number) => void,
  signal?: AbortSignal,
): Promise<{ sitemap: string; stats: any; chunks?: string[] }> {
  const jobCaches = createCrawlCaches();
  const stats = new SitemapStats(websiteUrl);
  const baseUrl = new URL(websiteUrl).origin;

  let puppeteerBrowser: any = null;
  const getBrowser = async () => { if (!puppeteerBrowser) puppeteerBrowser = new RecyclableBrowser(); return puppeteerBrowser as any as Browser; };

  let lastEmitted = 0;
  const throttledProgress = (url: string, count: number) => {
    if (!onProgress) return;
    const now = Date.now();
    const milestone = url.startsWith("Sitemap:") || url.startsWith("Crawling") || url.startsWith("Merging") || url.startsWith("Complete!");
    if (milestone || now - lastEmitted >= 500 || count >= maxPages) { lastEmitted = now; onProgress(url, count); }
  };

  try {
    let robotsRules: RobotsRulesCompiled = { disallowed: [], allowed: [] };
    let robotsContent = "";
    try {
      const rr = await fetchRobotsTxtRules(baseUrl, signal);
      robotsRules = rr.rules; robotsContent = rr.content;
    } catch (e: any) { console.error("Error setting up robots.txt rules:", e.message); }
    stats.setRobotsTxtInfo(robotsRules.disallowed.map(r => r.pattern));

    const sitemapUrlsList = await discoverSitemap(baseUrl, signal, robotsContent, getBrowser);
    let sitemapUrls: string[] = [];

    if (sitemapUrlsList && sitemapUrlsList.length > 0) {
      const results = await Promise.all(sitemapUrlsList.map(url => fetchAndParseSitemap(url, signal, getBrowser)));
      sitemapUrls = Array.from(new Set(results.flat())).filter(u => isValidUrl(u));
      stats.setSitemapPages(sitemapUrls.length);
      throttledProgress(`Sitemap: ${sitemapUrls.length} URLs | Starting crawl...`, 0);
    }

    throttledProgress(`Crawling from homepage...`, Math.min(sitemapUrls.length, maxPages));
    const crawledData = await crawlSite(baseUrl, maxPages, config,
      (url, count) => throttledProgress(url, Math.min(sitemapUrls.length + count, maxPages)),
      robotsRules, stats, getBrowser, jobCaches, signal);

    if (crawledData.size <= 1 && sitemapUrls.length === 0) {
      console.warn(`[createSitemap] ⚠ Crawl found only ${crawledData.size} page(s) — site may be blocking. Try sitemap URLs or different timeout.`);
    }

    const allUrls = new Set([...sitemapUrls, ...Array.from(crawledData.keys())]);
    throttledProgress(`Merging results: ${allUrls.size} unique URLs`, Math.min(allUrls.size, maxPages));

    const finalData = new Map<string, SitemapItem>(crawledData);
    const uncrawled = sitemapUrls.filter(u => !finalData.has(u));
    if (uncrawled.length > 0 && finalData.size < maxPages) {
      const add = await processSitemapUrls(uncrawled, baseUrl, maxPages - finalData.size, config,
        (url, count) => throttledProgress(url, Math.min(finalData.size + count, maxPages)),
        robotsRules, getBrowser, jobCaches, signal);
      for (const [k,v] of add) { if (finalData.size >= maxPages) break; finalData.set(k,v); }
    }

    const overlap = Array.from(new Set(sitemapUrls)).filter(u => crawledData.has(u)).length;
    stats.setPageBreakdown(sitemapUrls.length - overlap, crawledData.size - overlap, overlap);
    stats.setTotalPages(finalData.size);
    throttledProgress(`Complete! ${finalData.size} pages processed`, finalData.size);

    await stats.save(); console.log(stats.getSummary());
    const { xml, chunks } = generateSitemap(finalData, baseUrl);
    return { sitemap: xml, chunks, stats: stats.toJSON() };
  } catch (error: any) {
    console.error("Critical error during createSitemap:", error.message);
    try { await stats.save(); } catch (e: any) { console.error("Could not save partial stats:", e.message); }
    throw error;
  } finally {
    if (puppeteerBrowser) { try { await (puppeteerBrowser as Browser).close(); } catch {} }
  }
}
