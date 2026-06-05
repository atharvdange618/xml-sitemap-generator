import { http, fetchWithRetry } from "./httpClient";
import { isValidUrl, escapeXml } from "./urlUtils";
import { SitemapItem } from "../../types/sitemap";

export async function fetchAndParseSitemap(
  sitemapUrl: string,
): Promise<string[]> {
  try {
    const response = await fetchWithRetry(sitemapUrl);
    const xml = response.data;

    if (typeof xml !== "string") {
      return [];
    }

    if (xml.includes("<sitemapindex")) {
      return await parseSitemapIndex(xml);
    }

    return parseSitemap(xml);
  } catch (error: any) {
    console.error(`Error fetching sitemap from ${sitemapUrl}:`, error.message);
    return [];
  }
}

export function parseSitemap(xml: string): string[] {
  const urls: string[] = [];
  const locMatches = xml.match(/<loc>(.*?)<\/loc>/g) || [];

  for (const match of locMatches) {
    let url = match.replace(/<\/?loc>/g, "").trim();
    if (url.startsWith("<![CDATA[") && url.endsWith("]]>")) {
      url = url.substring(9, url.length - 3).trim();
    }
    if (url && isValidUrl(url)) {
      urls.push(url);
    }
  }

  return urls;
}

export async function parseSitemapIndex(xml: string): Promise<string[]> {
  const sitemapUrls: string[] = [];
  const locMatches = xml.match(/<loc>(.*?)<\/loc>/g) || [];

  for (const match of locMatches) {
    let url = match.replace(/<\/?loc>/g, "").trim();
    if (url.startsWith("<![CDATA[") && url.endsWith("]]>")) {
      url = url.substring(9, url.length - 3).trim();
    }
    if (url) {
      sitemapUrls.push(url);
    }
  }

  const allUrls: string[] = [];
  const concurrency = 5;
  for (let i = 0; i < sitemapUrls.length; i += concurrency) {
    const batch = sitemapUrls.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((sitemapUrl) =>
        fetchAndParseSitemap(sitemapUrl).catch(() => []),
      ),
    );
    for (const urls of batchResults) {
      allUrls.push(...urls);
    }
  }

  return allUrls;
}

export async function discoverSitemap(baseUrl: string): Promise<string[]> {
  const commonPaths = [
    "/sitemap.xml",
    "/sitemap_index.xml",
    "/sitemap-index.xml",
    "/post-sitemap.xml",
    "/page-sitemap.xml",
  ];

  try {
    const robotsResponse = await http.get(`${baseUrl}/robots.txt`);
    const robotsContent = robotsResponse.data;

    const sitemapMatches =
      robotsContent.match(/Sitemap:\s*(https?:\/\/[^\s]+)/gi) || [];

    for (const match of sitemapMatches) {
      const sitemapUrl = match.replace(/Sitemap:\s*/i, "").trim();
      try {
        const parsed = new URL(sitemapUrl, baseUrl);
        commonPaths.unshift(parsed.href);
      } catch {
        commonPaths.unshift(new URL(sitemapUrl, baseUrl).pathname);
      }
    }
  } catch (error) {
    // robots.txt not found or error, continue with common paths
  }

  const uniquePaths = [...new Set(commonPaths)];
  const activeSitemaps: string[] = [];

  for (const candidate of uniquePaths) {
    try {
      const sitemapUrl = candidate.startsWith("http")
        ? candidate
        : `${baseUrl}${candidate}`;
      const response = await http.get(sitemapUrl, { timeout: 5000 });
      if (response.status === 200) {
        activeSitemaps.push(sitemapUrl);
      }
    } catch (error) {
      // Continue to next path
    }
  }

  const indexSitemap = activeSitemaps.find((url) => url.includes("index"));
  if (indexSitemap) return [indexSitemap];

  return activeSitemaps;
}

function buildUrlset(entries: [string, SitemapItem][]): string {
  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>\n');
  parts.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n');
  parts.push('        xmlns:xhtml="http://www.w3.org/1999/xhtml"\n');
  parts.push(
    '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n',
  );

  for (const [url, { lastmod, priority, alternates, images }] of entries) {
    parts.push("  <url>\n");
    parts.push(`    <loc>${escapeXml(url)}</loc>\n`);
    if (lastmod) {
      try {
        parts.push(
          `    <lastmod>${new Date(lastmod).toISOString()}</lastmod>\n`,
        );
      } catch (e) {
        // Skip lastmod if invalid
      }
    }
    parts.push(`    <priority>${priority}</priority>\n`);

    if (alternates && alternates.length > 0) {
      for (const alt of alternates) {
        parts.push(
          `    <xhtml:link rel="alternate" hreflang="${escapeXml(alt.hreflang)}" href="${escapeXml(alt.href)}"/>\n`,
        );
      }
    }

    if (images && images.length > 0) {
      const uniqueImages = [...new Set(images)].slice(0, 1000);
      for (const imgUrl of uniqueImages) {
        parts.push("    <image:image>\n");
        parts.push(
          `      <image:loc>${escapeXml(typeof imgUrl === "string" ? imgUrl : (imgUrl as any).loc)}</image:loc>\n`,
        );
        parts.push("    </image:image>\n");
      }
    }

    parts.push("  </url>\n");
  }

  parts.push("</urlset>");
  return parts.join("");
}

export function generateSitemap(
  sitemapData: Map<string, SitemapItem>,
  baseUrl?: string,
): { xml: string; chunks?: string[] } {
  const entries = Array.from(sitemapData.entries());

  if (entries.length > 50000) {
    const chunksCount = Math.ceil(entries.length / 50000);
    const chunks: string[] = [];
    const base = baseUrl ? baseUrl.replace(/\/$/, "") : "";

    for (let i = 0; i < chunksCount; i++) {
      const chunkEntries = entries.slice(i * 50000, (i + 1) * 50000);
      chunks.push(buildUrlset(chunkEntries));
    }

    const parts: string[] = [];
    parts.push('<?xml version="1.0" encoding="UTF-8"?>\n');
    parts.push(
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n',
    );

    for (let i = 0; i < chunksCount; i++) {
      const filename = `sitemap-${i + 1}.xml`;
      const loc = base ? `${base}/${filename}` : filename;
      parts.push("  <sitemap>\n");
      parts.push(`    <loc>${escapeXml(loc)}</loc>\n`);
      parts.push(`    <lastmod>${new Date().toISOString()}</lastmod>\n`);
      parts.push("  </sitemap>\n");
    }
    parts.push("</sitemapindex>");

    return { xml: parts.join(""), chunks };
  }

  return { xml: buildUrlset(entries) };
}
