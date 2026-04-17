import axios from "axios";
import puppeteer from "puppeteer";
import { parse } from "node-html-parser";

async function fetchAndParseSitemap(sitemapUrl) {
  try {
    const response = await axios.get(sitemapUrl, {
      headers: {
        Accept: "application/xml, text/xml, */*",
        "Accept-Encoding": "gzip, deflate, br",
      },
      timeout: 30000,
    });

    const xml = response.data;

    if (xml.includes("<sitemapindex")) {
      return await parseSitemapIndex(xml);
    }

    return parseSitemap(xml);
  } catch (error) {
    console.error(`Error fetching sitemap from ${sitemapUrl}:`, error.message);
    return [];
  }
}

function parseSitemap(xml) {
  const urls = [];
  const locMatches = xml.match(/<loc>(.*?)<\/loc>/g) || [];

  for (const match of locMatches) {
    const url = match.replace(/<\/?loc>/g, "").trim();
    if (url && isValidUrl(url)) {
      urls.push(url);
    }
  }

  return urls;
}

async function parseSitemapIndex(xml) {
  const sitemapUrls = [];
  const locMatches = xml.match(/<loc>(.*?)<\/loc>/g) || [];

  for (const match of locMatches) {
    const url = match.replace(/<\/?loc>/g, "").trim();
    if (url) {
      sitemapUrls.push(url);
    }
  }

  const allUrls = [];
  for (const sitemapUrl of sitemapUrls) {
    const urls = await fetchAndParseSitemap(sitemapUrl);
    allUrls.push(...urls);
  }

  return allUrls;
}

async function discoverSitemap(baseUrl) {
  const commonPaths = [
    "/sitemap.xml",
    "/sitemap_index.xml",
    "/sitemap-index.xml",
    "/post-sitemap.xml",
    "/page-sitemap.xml",
  ];

  try {
    const robotsResponse = await axios.get(`${baseUrl}/robots.txt`, {
      timeout: 5000,
    });
    const robotsContent = robotsResponse.data;
    const sitemapMatches =
      robotsContent.match(/Sitemap:\s*(https?:\/\/[^\s]+)/gi) || [];

    for (const match of sitemapMatches) {
      const sitemapUrl = match.replace(/Sitemap:\s*/i, "").trim();
      commonPaths.unshift(new URL(sitemapUrl, baseUrl).pathname);
    }
  } catch (error) {
    // robots.txt not found or error, continue with common paths
  }

  for (const path of commonPaths) {
    try {
      const sitemapUrl = `${baseUrl}${path}`;
      const response = await axios.head(sitemapUrl, { timeout: 5000 });
      if (response.status === 200) {
        return sitemapUrl;
      }
    } catch (error) {
      // Continue to next path
    }
  }

  return null;
}

// Configuration object for thresholds and logging
const config = {
  csr: {
    minimalContentLength: 200, // Minimum HTML length to consider as valid content
    minimalChildNodes: 5, // Minimum number of child nodes in <body>
    scriptCountThreshold: 10, // Threshold for number of <script> tags
    contentScriptRatio: 1000, // Minimum ratio of HTML length per script tag
    rootSelectors: ["#root", "#__next"], // Markers for typical CSR frameworks (React, Next.js)
  },
  puppeteer: {
    waitForSelectorsTimeout: 10000, // Timeout waiting for critical selectors
    gotoTimeout: 60000, // Timeout for page.goto
    waitUntil: "networkidle2", // Wait until network is idle
  },
  logging: {
    verbose: true,
  },
};

const CONCURRENCY = 5;

async function crawlSite(
  baseUrl,
  maxPages = 100,
  cfg = config,
  onProgress,
  disallowedPaths = [],
) {
  const sitemapData = new Map();
  const queue = [{ url: baseUrl, depth: 0 }];
  const visited = new Set([baseUrl]);
  let puppeteerBrowser = null;

  const getBrowser = async () => {
    if (!puppeteerBrowser) {
      puppeteerBrowser = await puppeteer.launch({ headless: true });
    }
    return puppeteerBrowser;
  };

  try {
    while (queue.length > 0 && sitemapData.size < maxPages) {
      const batch = queue.splice(0, Math.min(queue.length, CONCURRENCY));

      await Promise.all(
        batch.map(async ({ url, depth }) => {
          if (sitemapData.size >= maxPages) return;

          try {
            if (onProgress) {
              onProgress(url, sitemapData.size + 1);
            }

            const { links, lastmod } = await crawlUrl(
              url,
              baseUrl,
              depth,
              cfg,
              getBrowser,
            );

            const priority = calculatePriority(depth);
            sitemapData.set(url, { lastmod, priority });

            for (const link of links) {
              const isDisallowed = disallowedPaths.some((path) =>
                new URL(link).pathname.startsWith(path),
              );
              if (
                !visited.has(link) &&
                sitemapData.size < maxPages &&
                !isDisallowed
              ) {
                visited.add(link);
                queue.push({ url: link, depth: depth + 1 });
              }
            }
          } catch (error) {
            console.error(`Error crawling ${url}:`, error.message);
          }
        }),
      );
    }
  } finally {
    if (puppeteerBrowser) {
      await puppeteerBrowser.close();
    }
  }

  return sitemapData;
}

async function crawlUrl(currentUrl, baseUrl, depth, cfg, getBrowser) {
  try {
    const { links, isCSR, lastmod } = await getLinksWithHTTP(
      baseUrl,
      currentUrl,
      cfg,
    );

    let finalLinks = links;
    if (isCSR || links.length === 0) {
      const browser = await getBrowser();
      const puppeteerLinks = await getLinksWithPuppeteer(
        browser,
        baseUrl,
        currentUrl,
        cfg,
      );
      finalLinks = [...new Set([...links, ...puppeteerLinks])];
    }

    return { links: finalLinks, lastmod };
  } catch (error) {
    console.error(`Error processing ${currentUrl}:`, error.message);
    return { links: [], lastmod: new Date().toISOString() };
  }
}

function calculatePriority(depth) {
  const priority = 1.0 - depth * 0.1;
  return Math.max(0.1, priority).toFixed(1);
}

async function getLinksWithHTTP(baseUrl, currentUrl, cfg) {
  const response = await axios.get(currentUrl, {
    headers: { "Accept-Encoding": "gzip, deflate, br" },
  });
  const html = response.data;
  const root = parse(html);

  const lastmod = response.headers["last-modified"] || new Date().toISOString();

  const isCSR = detectCSR(html, root, cfg);

  if (!isCSR) {
    const links = extractLinks(root, baseUrl, currentUrl);
    return { links, isCSR: false, lastmod };
  }
  return { links: [], isCSR: true, lastmod };
}

async function getLinksWithPuppeteer(browser, baseUrl, currentUrl, cfg) {
  const page = await browser.newPage();

  try {
    await page.goto(currentUrl, {
      waitUntil: cfg.puppeteer.waitUntil,
      timeout: cfg.puppeteer.gotoTimeout,
    });

    const selectors = "a," + cfg.csr.rootSelectors.join(",");
    try {
      await page.waitForSelector(selectors, {
        timeout: cfg.puppeteer.waitForSelectorsTimeout,
      });
    } catch (e) {
      // Selector timeout - continue anyway
    }

    const links = await page.evaluate((baseUrl) => {
      const urls = [];

      const linkElements = document.querySelectorAll("a[href]");
      for (const element of linkElements) {
        try {
          const href = element.getAttribute("href");
          if (!href) continue;
          const url = new URL(href, window.location.href);
          if (url.origin === baseUrl) {
            url.hash = "";
            url.search = "";
            urls.push(url.href);
          }
        } catch {}
      }

      const linkTags = document.querySelectorAll(
        'link[rel=\"canonical\"], link[rel=\"alternate\"]',
      );
      for (const link of linkTags) {
        try {
          const href = link.getAttribute("href");
          if (!href) continue;
          const url = new URL(href, window.location.href);
          if (url.origin === baseUrl) {
            url.hash = "";
            url.search = "";
            urls.push(url.href);
          }
        } catch {}
      }

      return [...new Set(urls)];
    }, baseUrl);

    return links;
  } finally {
    await page.close();
  }
}

function detectCSR(html, root, cfg) {
  const {
    minimalContentLength,
    minimalChildNodes,
    scriptCountThreshold,
    contentScriptRatio,
    rootSelectors,
  } = cfg.csr;

  const body = root.querySelector("body");
  const bodyChildCount = body ? body.childNodes.length : 0;

  const isShortHtml = html.length < minimalContentLength;
  const hasEmptyBody = bodyChildCount < minimalChildNodes;

  const scriptElements = root.querySelectorAll("script");
  const scriptMatches = html.match(/<script/g);
  const scriptCount = scriptElements.length;
  const ratio = html.length / (scriptMatches ? scriptMatches.length : 1);
  const hasManyScripts = scriptCount > scriptCountThreshold;
  const lowContentRatio = ratio < contentScriptRatio;

  const hasRootDiv = rootSelectors.some(
    (selector) => root.querySelector(selector) !== null,
  );

  const hasLoadingIndicator =
    html.includes("loading") || html.includes("spinner");

  return (
    isShortHtml ||
    (hasRootDiv && (hasEmptyBody || hasLoadingIndicator)) ||
    (hasEmptyBody && hasManyScripts) ||
    (lowContentRatio && hasRootDiv)
  );
}

function extractLinks(root, baseUrl, currentUrl) {
  const links = [];
  const currentUrlObj = new URL(currentUrl);
  const baseUrlObj = new URL(baseUrl);

  const anchors = root.querySelectorAll("a");
  for (const anchor of anchors) {
    const href = anchor.getAttribute("href");
    if (!href) continue;

    try {
      const url = new URL(href, currentUrl);
      if (url.hostname === baseUrlObj.hostname) {
        url.hash = "";
        url.search = "";
        if (isValidUrl(url.href) && url.pathname !== currentUrlObj.pathname) {
          links.push(url.href);
        }
      }
    } catch {}
  }

  const linkTags = root.querySelectorAll(
    'link[rel="canonical"], link[rel="alternate"]',
  );
  for (const link of linkTags) {
    const href = link.getAttribute("href");
    if (!href) continue;

    try {
      const url = new URL(href, currentUrl);
      if (url.hostname === baseUrlObj.hostname) {
        url.hash = "";
        url.search = "";
        if (isValidUrl(url.href)) {
          links.push(url.href);
        }
      }
    } catch {}
  }

  return [...new Set(links)];
}

function isValidUrl(url) {
  const skipExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".pdf",
    ".zip",
    ".css",
    ".js",
    ".webp",
    ".svg",
    ".ico",
    ".mp4",
    ".mp3",
    ".avif",
  ];
  return !skipExtensions.some((ext) => url.toLowerCase().endsWith(ext));
}

async function getRobotsTxtRules(baseUrl) {
  const robotsUrl = `${baseUrl}/robots.txt`;

  try {
    const response = await axios.get(robotsUrl);
    const rules = parseRobotsTxt(response.data);
    return rules.disallowed;
  } catch (error) {
    if (error.response && error.response.status !== 404) {
      console.error(`Error fetching or parsing robots.txt:`, error.message);
    }
    return [];
  }
}

function parseRobotsTxt(content) {
  const rules = {
    disallowed: [],
  };
  let isForAllAgents = false;

  content.split(/\r?\n/).forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine.toLowerCase().startsWith("user-agent:")) {
      isForAllAgents = trimmedLine.substring(11).trim() === "*";
    } else if (
      isForAllAgents &&
      trimmedLine.toLowerCase().startsWith("disallow:")
    ) {
      const path = trimmedLine.substring(9).trim();
      if (path) {
        rules.disallowed.push(path);
      }
    }
  });

  return rules;
}

function generateSitemap(sitemapData) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  for (const [url, { lastmod, priority }] of sitemapData.entries()) {
    xml += "  <url>\n";
    xml += `    <loc>${url}</loc>\n`;
    xml += `    <lastmod>${new Date(lastmod).toISOString()}</lastmod>\n`;
    xml += `    <priority>${priority}</priority>\n`;
    xml += "  </url>\n";
  }

  xml += "</urlset>";
  return xml;
}

export async function createSitemap(websiteUrl, maxPages = 100, onProgress) {
  const baseUrl = new URL(websiteUrl).origin;
  const disallowedPaths = await getRobotsTxtRules(baseUrl);

  const sitemapUrl = await discoverSitemap(baseUrl);
  let sitemapUrls = [];

  if (sitemapUrl) {
    sitemapUrls = await fetchAndParseSitemap(sitemapUrl);

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
        onProgress(
          `Sitemap: ${sitemapUrls.length} | Crawled: ${count}`,
          sitemapUrls.length + count,
        );
      }
    },
    disallowedPaths,
  );

  const allUrls = new Set([...sitemapUrls, ...Array.from(crawledData.keys())]);

  if (onProgress) {
    onProgress(
      `Merging results: ${allUrls.size} unique URLs found`,
      allUrls.size,
    );
  }

  const finalData = new Map(crawledData);
  const uncrawledUrls = sitemapUrls.filter((url) => !finalData.has(url));

  if (uncrawledUrls.length > 0) {
    const additionalData = await processSitemapUrls(
      uncrawledUrls,
      baseUrl,
      maxPages - finalData.size,
      config,
      (url, count) => {
        if (onProgress) {
          onProgress(
            `Processing sitemap URLs: ${count}/${uncrawledUrls.length}`,
            finalData.size + count,
          );
        }
      },
      disallowedPaths,
    );

    for (const [url, data] of additionalData.entries()) {
      finalData.set(url, data);
    }
  }

  if (onProgress) {
    onProgress(`Complete! ${finalData.size} pages processed`, finalData.size);
  }

  return generateSitemap(finalData);
}

async function processSitemapUrls(
  urls,
  baseUrl,
  maxPages,
  cfg,
  onProgress,
  disallowedPaths,
) {
  const sitemapData = new Map();
  let puppeteerBrowser = null;

  const getBrowser = async () => {
    if (!puppeteerBrowser) {
      puppeteerBrowser = await puppeteer.launch({ headless: true });
    }
    return puppeteerBrowser;
  };

  try {
    const urlsToProcess = urls
      .filter((url) => {
        const urlObj = new URL(url);
        const isDisallowed = disallowedPaths.some((path) =>
          urlObj.pathname.startsWith(path),
        );
        return !isDisallowed && urlObj.origin === baseUrl;
      })
      .slice(0, maxPages);

    for (let i = 0; i < urlsToProcess.length; i += CONCURRENCY) {
      const batch = urlsToProcess.slice(i, i + CONCURRENCY);

      await Promise.all(
        batch.map(async (url) => {
          try {
            if (onProgress) {
              onProgress(url, sitemapData.size + 1);
            }

            const { lastmod } = await getUrlMetadata(url, cfg, getBrowser);
            const depth = new URL(url).pathname
              .split("/")
              .filter(Boolean).length;
            const priority = calculatePriority(depth);

            sitemapData.set(url, { lastmod, priority });
          } catch (error) {
            console.error(`Error processing ${url}:`, error.message);
            sitemapData.set(url, {
              lastmod: new Date().toISOString(),
              priority: "0.5",
            });
          }
        }),
      );
    }
  } finally {
    if (puppeteerBrowser) {
      await puppeteerBrowser.close();
    }
  }

  return sitemapData;
}

async function getUrlMetadata(url) {
  try {
    const response = await axios.head(url, {
      timeout: 5000,
      headers: { "Accept-Encoding": "gzip, deflate, br" },
    });

    const lastmod =
      response.headers["last-modified"] || new Date().toISOString();
    return { lastmod };
  } catch (error) {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: { "Accept-Encoding": "gzip, deflate, br" },
      });
      const lastmod =
        response.headers["last-modified"] || new Date().toISOString();
      return { lastmod };
    } catch (innerError) {
      return { lastmod: new Date().toISOString() };
    }
  }
}
