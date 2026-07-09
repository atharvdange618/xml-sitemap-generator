import { fetchWithRetry, fetchRobotsTxtWithTimeout } from "./httpClient";
import { config } from "./config";
import { isValidUrl, escapeXml } from "./urlUtils";
import { SitemapItem } from "../../types/sitemap";
import { Browser } from "puppeteer";
import { logger } from "@/utils/logger";

export async function fetchAndParseSitemap(
  sitemapUrl: string,
  signal?: AbortSignal,
  getBrowser?: () => Promise<Browser>,
): Promise<{ url: string; lastmod: string | null }[]> {
  try {
    logger.info(`Fetching sitemap: ${sitemapUrl}`, "parser:fetchSitemap", {
      sitemapUrl,
    });
    const response = await fetchWithRetry(sitemapUrl, {}, 3, signal);
    const xml = response.data;
    if (typeof xml !== "string") {
      logger.warn(
        `Non-string response from ${sitemapUrl}`,
        "parser:fetchSitemap",
        { sitemapUrl },
      );
      return [];
    }
    if (xml.includes("<sitemapindex")) {
      logger.info(
        `Found sitemap index at ${sitemapUrl}, parsing child sitemaps`,
        "parser:fetchSitemap",
        { sitemapUrl },
      );
      return await parseSitemapIndex(xml, signal, getBrowser);
    }
    const urls = parseSitemap(xml);
    logger.info(
      `Parsed ${urls.length} URLs from ${sitemapUrl}`,
      "parser:fetchSitemap",
      { sitemapUrl, count: urls.length },
    );
    return urls;
  } catch (e: any) {
    logger.error(`HTTP failed for ${sitemapUrl}`, e, "parser:fetchSitemap", {
      sitemapUrl,
    });
    if (getBrowser) {
      try {
        logger.info(
          `Trying Puppeteer fallback for ${sitemapUrl}`,
          "parser:fetchSitemap",
          { sitemapUrl },
        );
        const browser = await getBrowser();
        const page = await browser.newPage();
        await page.goto(sitemapUrl, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });
        const xml = await page.evaluate(
          () =>
            document.querySelector("body")?.textContent ||
            document.documentElement.outerHTML,
        );
        await page.close();
        if (xml && (xml.includes("<urlset") || xml.includes("<sitemapindex"))) {
          if (xml.includes("<sitemapindex"))
            return await parseSitemapIndex(xml, signal, getBrowser);
          const urls = parseSitemap(xml);
          logger.info(
            `Puppeteer parsed ${urls.length} URLs from ${sitemapUrl}`,
            "parser:fetchSitemap",
            { sitemapUrl, count: urls.length },
          );
          return urls;
        }
        logger.warn(
          `Puppeteer response not valid XML from ${sitemapUrl}`,
          "parser:fetchSitemap",
          { sitemapUrl },
        );
      } catch (e2: any) {
        logger.warn(
          `Puppeteer fallback failed for ${sitemapUrl}: ${e2.message}`,
          "parser:fetchSitemap",
          { sitemapUrl },
        );
      }
    }
    return [];
  }
}

export function parseSitemap(
  xml: string,
): { url: string; lastmod: string | null }[] {
  const results: { url: string; lastmod: string | null }[] = [];
  const urlBlocks = xml.match(/<url>([\s\S]*?)<\/url>/g) || [];
  for (const block of urlBlocks) {
    const locMatch = block.match(/<loc>([\s\S]*?)<\/loc>/);
    if (!locMatch) continue;
    let url = locMatch[1].replace(/<\/?loc>/g, "").trim();
    if (url.startsWith("<![CDATA[") && url.endsWith("]]>"))
      url = url.substring(9, url.length - 3).trim();
    if (!url || !isValidUrl(url, true)) continue;

    let lastmod: string | null = null;
    const lastmodMatch = block.match(/<lastmod>([\s\S]*?)<\/lastmod>/);
    if (lastmodMatch) {
      const lm = lastmodMatch[1].trim();
      const d = new Date(lm);
      if (!isNaN(d.getTime())) lastmod = d.toISOString();
    }
    results.push({ url, lastmod });
  }
  return results;
}

export async function parseSitemapIndex(
  xml: string,
  signal?: AbortSignal,
  getBrowser?: () => Promise<Browser>,
): Promise<{ url: string; lastmod: string | null }[]> {
  const urls: string[] = [];
  const locs = xml.match(/<loc>(.*?)<\/loc>/g) || [];
  for (const m of locs) {
    let url = m.replace(/<\/?loc>/g, "").trim();
    if (url.startsWith("<![CDATA[") && url.endsWith("]]>"))
      url = url.substring(9, url.length - 3).trim();
    if (url && !url.endsWith(".gz")) urls.push(url);
  }
  const all: { url: string; lastmod: string | null }[] = [];
  for (let i = 0; i < urls.length; i += 5) {
    const batch = urls.slice(i, i + 5);
    const results = await Promise.all(
      batch.map((u) =>
        fetchAndParseSitemap(u, signal, getBrowser).catch(() => []),
      ),
    );
    for (const r of results) all.push(...r);
  }
  return all;
}

export async function discoverSitemap(
  baseUrl: string,
  signal?: AbortSignal,
  robotsContent?: string,
  getBrowser?: () => Promise<Browser>,
): Promise<string[]> {
  if (signal?.aborted) return [];

  logger.info(`Discovering sitemap for ${baseUrl}`, "parser:discover", {
    baseUrl,
  });

  const commonPaths = [
    "/sitemap.xml",
    "/sitemap_index.xml",
    "/sitemap-index.xml",
    "/post-sitemap.xml",
    "/page-sitemap.xml",
    "/sitemap/sitemap.xml",
    "/sitemap/sitemap.php",
    "/sitemap/sitemap_index.xml",
  ];

  let content: string;
  if (robotsContent !== undefined) {
    content = robotsContent;
  } else {
    try {
      const r = await fetchRobotsTxtWithTimeout(
        baseUrl,
        config.robotsTxtTimeout,
        signal,
      );
      content = r.data;
    } catch {
      content = "";
    }
  }

  const matches = content.match(/Sitemap:\s*(https?:\/\/[^\s]+)/gi) || [];
  for (const m of matches) {
    const u = m.replace(/Sitemap:\s*/i, "").trim();
    try {
      commonPaths.unshift(new URL(u, baseUrl).href);
    } catch {}
  }

  if (matches.length > 0) {
    logger.info(
      `Found ${matches.length} Sitemap directive(s) in robots.txt`,
      "parser:discover",
      { baseUrl, count: matches.length },
    );
  }

  const unique = [...new Set(commonPaths)];
  const found: string[] = [];

  const ac = new AbortController();
  if (signal)
    signal.addEventListener("abort", () => ac.abort(), { once: true });
  const tid = setTimeout(() => ac.abort(), 5000);

  await Promise.allSettled(
    unique.map(async (candidate) => {
      try {
        const url = candidate.startsWith("http")
          ? candidate
          : `${baseUrl}${candidate}`;
        const res = await fetchWithRetry(url, {}, 1, ac.signal, 4000);
        if (res.status === 200) found.push(url);
      } catch (e: any) {
        const url = candidate.startsWith("http")
          ? candidate
          : `${baseUrl}${candidate}`;
        logger.warn(`Probe failed for ${url}`, "parser:discover", { url });
      }
    }),
  );
  clearTimeout(tid);
  if (signal?.aborted) return [];

  if (found.length > 0) {
    const idx = found.find((u) => u.includes("index"));
    const result = idx ? [idx] : found;
    logger.info(
      `Discovered sitemap(s): ${result.join(", ")}`,
      "parser:discover",
      { baseUrl, sitemaps: result },
    );
    return result;
  }

  if (getBrowser) {
    try {
      const probeUrl = `${baseUrl}/sitemap.xml`;
      logger.info(
        `HTTP probes failed, trying Puppeteer for ${probeUrl}`,
        "parser:discover",
        { baseUrl },
      );
      const browser = await getBrowser();
      const page = await browser.newPage();
      const resp = await page.goto(probeUrl, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      if (resp && resp.status() === 200) {
        const text = await page.evaluate(
          () => document.querySelector("body")?.textContent || "",
        );
        await page.close();
        if (text.includes("<urlset") || text.includes("<sitemapindex")) {
          logger.info(
            `Puppeteer found sitemap at ${probeUrl}`,
            "parser:discover",
            { probeUrl },
          );
          return [probeUrl];
        }
        logger.warn(
          `Puppeteer response from ${probeUrl} is not valid sitemap XML`,
          "parser:discover",
          { probeUrl },
        );
      } else {
        await page.close();
        logger.warn(
          `Puppeteer got status ${resp?.status()} from ${probeUrl}`,
          "parser:discover",
          { probeUrl, status: resp?.status() },
        );
      }
    } catch (e: any) {
      logger.warn(`Puppeteer probe failed: ${e.message}`, "parser:discover", {
        baseUrl,
      });
    }
  }

  logger.info(`No sitemap.xml found at ${baseUrl}`, "parser:discover", {
    baseUrl,
  });
  return [];
}

function buildUrlset(entries: [string, SitemapItem][]): string {
  const p: string[] = [];
  p.push('<?xml version="1.0" encoding="UTF-8"?>\n');
  p.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n');
  p.push('        xmlns:xhtml="http://www.w3.org/1999/xhtml"\n');
  p.push(
    '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n',
  );
  for (const [url, { lastmod, priority, alternates, images }] of entries) {
    p.push("  <url>\n");
    p.push(`    <loc>${escapeXml(url)}</loc>\n`);
    if (lastmod) {
      try {
        p.push(`    <lastmod>${new Date(lastmod).toISOString()}</lastmod>\n`);
      } catch {}
    }
    p.push(`    <priority>${priority}</priority>\n`);
    if (alternates?.length) {
      for (const a of alternates)
        p.push(
          `    <xhtml:link rel="alternate" hreflang="${escapeXml(a.hreflang)}" href="${escapeXml(a.href)}"/>\n`,
        );
    }
    if (images?.length) {
      for (const img of [...new Set(images)].slice(0, 1000)) {
        p.push("    <image:image>\n");
        p.push(
          `      <image:loc>${escapeXml(typeof img === "string" ? img : (img as any).loc)}</image:loc>\n`,
        );
        p.push("    </image:image>\n");
      }
    }
    p.push("  </url>\n");
  }
  p.push("</urlset>");
  return p.join("");
}

export function generateSitemap(
  sitemapData: Map<string, SitemapItem>,
  baseUrl?: string,
): { xml: string; chunks?: string[] } {
  const entries = Array.from(sitemapData.entries());
  if (entries.length > 50000) {
    const count = Math.ceil(entries.length / 50000);
    const chunks: string[] = [];
    const base = baseUrl ? baseUrl.replace(/\/$/, "") : "";
    for (let i = 0; i < count; i++)
      chunks.push(buildUrlset(entries.slice(i * 50000, (i + 1) * 50000)));
    const p: string[] = [];
    p.push('<?xml version="1.0" encoding="UTF-8"?>\n');
    p.push(
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n',
    );
    for (let i = 0; i < count; i++) {
      const fn = `sitemap-${i + 1}.xml`;
      p.push("  <sitemap>\n");
      p.push(`    <loc>${escapeXml(base ? `${base}/${fn}` : fn)}</loc>\n`);
      p.push(`    <lastmod>${new Date().toISOString()}</lastmod>\n`);
      p.push("  </sitemap>\n");
    }
    p.push("</sitemapindex>");
    return { xml: p.join(""), chunks };
  }
  return { xml: buildUrlset(entries) };
}
