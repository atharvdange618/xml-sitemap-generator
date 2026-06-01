import {
  http,
  fetchWithRetry,
  fetchUrlWithPuppeteer,
  checkUrlWithPuppeteer,
} from "./httpClient";
import { isValidUrl, escapeXml } from "./urlUtils";
import { Browser } from "puppeteer";
import { SitemapItem } from "../../types/sitemap";

export async function fetchAndParseSitemap(
  sitemapUrl: string,
  getBrowser?: () => Promise<Browser>
): Promise<string[]> {
  try {
    let xml: string | null = null;
    try {
      const response = await fetchWithRetry(sitemapUrl);
      xml = response.data;
    } catch (error: any) {
      if (getBrowser) {
        console.warn(
          `HTTP failed to fetch sitemap from ${sitemapUrl} (${error.message}). Attempting Puppeteer fallback.`,
        );
        xml = await fetchUrlWithPuppeteer(sitemapUrl, getBrowser);
      } else {
        throw error;
      }
    }

    if (typeof xml !== "string") {
      return [];
    }

    if (xml.includes("<sitemapindex")) {
      return await parseSitemapIndex(xml, getBrowser);
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

export async function parseSitemapIndex(
  xml: string,
  getBrowser?: () => Promise<Browser>
): Promise<string[]> {
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
  // Fetch sub-sitemaps in parallel with Promise.all
  const results = await Promise.all(
    sitemapUrls.map((sitemapUrl) =>
      fetchAndParseSitemap(sitemapUrl, getBrowser).catch(() => []),
    ),
  );

  for (const urls of results) {
    allUrls.push(...urls);
  }

  return allUrls;
}

export async function discoverSitemap(
  baseUrl: string,
  getBrowser?: () => Promise<Browser>
): Promise<string[]> {
  const commonPaths = [
    "/sitemap.xml",
    "/sitemap_index.xml",
    "/sitemap-index.xml",
    "/post-sitemap.xml",
    "/page-sitemap.xml",
  ];

  try {
    let robotsContent = "";
    try {
      const robotsResponse = await http.get(`${baseUrl}/robots.txt`);
      robotsContent = robotsResponse.data;
    } catch (error: any) {
      if (getBrowser) {
        console.warn(
          `HTTP failed to fetch robots.txt (${error.message}). Attempting Puppeteer fallback.`,
        );
        robotsContent = await fetchUrlWithPuppeteer(
          `${baseUrl}/robots.txt`,
          getBrowser,
        ).catch(() => "");
      }
    }

    const sitemapMatches =
      robotsContent.match(/Sitemap:\s*(https?:\/\/[^\s]+)/gi) || [];

    for (const match of sitemapMatches) {
      const sitemapUrl = match.replace(/Sitemap:\s*/i, "").trim();
      commonPaths.unshift(new URL(sitemapUrl, baseUrl).pathname);
    }
  } catch (error) {
    // robots.txt not found or error, continue with common paths
  }

  const uniquePaths = [...new Set(commonPaths)];
  const activeSitemaps: string[] = [];

  for (const path of uniquePaths) {
    try {
      const sitemapUrl = `${baseUrl}${path}`;
      let status = 0;
      try {
        const response = await http.get(sitemapUrl, { timeout: 5000 });
        status = response.status;
      } catch (error) {
        if (getBrowser) {
          const exists = await checkUrlWithPuppeteer(
            sitemapUrl,
            getBrowser,
          ).catch(() => false);
          if (exists) {
            status = 200;
          }
        }
      }
      if (status === 200) {
        activeSitemaps.push(sitemapUrl);
      }
    } catch (error) {
      // Continue to next path
    }
  }

  // Prioritize sitemap indexes if multiple sitemaps are found
  const indexSitemap = activeSitemaps.find((url) => url.includes("index"));
  if (indexSitemap) return [indexSitemap];

  return activeSitemaps;
}

export function generateSitemap(sitemapData: Map<string, SitemapItem>): string {
  const entries = Array.from(sitemapData.entries());

  // Enforce 50,000 URL limits by chunking to a index sitemap if exceeded
  if (entries.length > 50000) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml +=
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    const chunksCount = Math.ceil(entries.length / 50000);
    for (let i = 0; i < chunksCount; i++) {
      xml += "  <sitemap>\n";
      xml += `    <loc>sitemap-${i + 1}.xml</loc>\n`;
      xml += `    <lastmod>${new Date().toISOString()}</lastmod>\n`;
      xml += "  </sitemap>\n";
    }
    xml += "</sitemapindex>";
    return xml;
  }

  // Single XML output with hreflang alternate namespaces and Google images
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n';
  xml += '        xmlns:xhtml="http://www.w3.org/1999/xhtml"\n';
  xml +=
    '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n';

  for (const [url, { lastmod, priority, alternates, images }] of entries) {
    xml += "  <url>\n";
    xml += `    <loc>${escapeXml(url)}</loc>\n`;
    if (lastmod) {
      try {
        xml += `    <lastmod>${new Date(lastmod).toISOString()}</lastmod>\n`;
      } catch (e) {
        // Skip lastmod if invalid
      }
    }
    xml += `    <priority>${priority}</priority>\n`;

    if (alternates && alternates.length > 0) {
      for (const alt of alternates) {
        xml += `    <xhtml:link rel="alternate" hreflang="${escapeXml(alt.hreflang)}" href="${escapeXml(alt.href)}"/>\n`;
      }
    }

    if (images && images.length > 0) {
      const uniqueImages = [...new Set(images)].slice(0, 1000);
      for (const imgUrl of uniqueImages) {
        xml += "    <image:image>\n";
        xml += `      <image:loc>${escapeXml(typeof imgUrl === 'string' ? imgUrl : (imgUrl as any).loc)}</image:loc>\n`;
        xml += "    </image:image>\n";
      }
    }

    xml += "  </url>\n";
  }

  xml += "</urlset>";
  return xml;
}
