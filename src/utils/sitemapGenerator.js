import axios from "axios";
import puppeteer from "puppeteer";
import { parse } from "node-html-parser";

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

const CONCURRENCY = 2;

// Main crawling function
async function crawlSite(
  baseUrl,
  maxPages = 100,
  cfg = config,
  onProgress,
  disallowedPaths = []
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
              getBrowser
            );

            const priority = calculatePriority(depth);
            sitemapData.set(url, { lastmod, priority });

            for (const link of links) {
              const isDisallowed = disallowedPaths.some((path) =>
                new URL(link).pathname.startsWith(path)
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
        })
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
  if (cfg.logging.verbose)
    console.log(`Crawling: ${currentUrl} (depth: ${depth})`);

  try {
    const { links, isCSR, lastmod } = await getLinksWithHTTP(
      baseUrl,
      currentUrl,
      cfg
    );

    let finalLinks = links;
    if (isCSR || links.length === 0) {
      if (cfg.logging.verbose && !isCSR) {
        console.log(`No links via HTTP; trying Puppeteer for ${currentUrl}`);
      }
      const browser = await getBrowser();
      const puppeteerLinks = await getLinksWithPuppeteer(
        browser,
        baseUrl,
        currentUrl,
        cfg
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

// HTTP request function with enhanced CSR detection
async function getLinksWithHTTP(baseUrl, currentUrl, cfg) {
  const response = await axios.get(currentUrl, {
    headers: { "Accept-Encoding": "gzip, deflate, br" },
  });
  const html = response.data;
  const root = parse(html);

  const lastmod = response.headers["last-modified"] || new Date().toISOString();

  // CSR detection using the provided configuration thresholds
  const isCSR = detectCSR(html, root, cfg);

  if (!isCSR) {
    const links = extractLinks(root, baseUrl, currentUrl);
    return { links, isCSR: false, lastmod };
  }
  return { links: [], isCSR: true, lastmod };
}

// Puppeteer-based link extraction with enhanced wait conditions
async function getLinksWithPuppeteer(browser, baseUrl, currentUrl, cfg) {
  const page = await browser.newPage();

  try {
    await page.goto(currentUrl, {
      waitUntil: cfg.puppeteer.waitUntil,
      timeout: cfg.puppeteer.gotoTimeout,
    });

    // Wait for multiple selectors that indicate the page is loaded:
    // any <a> tag or specific root markers used by CSR frameworks
    const selectors = "a," + cfg.csr.rootSelectors.join(",");
    try {
      await page.waitForSelector(selectors, {
        timeout: cfg.puppeteer.waitForSelectorsTimeout,
      });
    } catch (e) {
      if (cfg.logging.verbose)
        console.log(
          `Timeout waiting for selectors (${selectors}) on ${currentUrl}`
        );
    }

    // Extract all links from the page
    const links = await page.evaluate((baseUrl) => {
      const linkElements = document.querySelectorAll("a[href]");
      const urls = [];
      for (const element of linkElements) {
        try {
          const href = element.getAttribute("href");
          if (!href) continue;
          const url = new URL(href, window.location.href);
          if (url.origin === baseUrl && !url.hash) {
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

// CSR detection with configurable thresholds and additional markers
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

  // Basic checks
  const isShortHtml = html.length < minimalContentLength;
  const hasEmptyBody = bodyChildCount < minimalChildNodes;

  // Count <script> tags and measure ratio
  const scriptElements = root.querySelectorAll("script");
  const scriptMatches = html.match(/<script/g);
  const scriptCount = scriptElements.length;
  const ratio = html.length / (scriptMatches ? scriptMatches.length : 1);
  const hasManyScripts = scriptCount > scriptCountThreshold;
  const lowContentRatio = ratio < contentScriptRatio;

  // Check for specific root selectors (e.g. #root, #__next)
  const hasRootDiv = rootSelectors.some(
    (selector) => root.querySelector(selector) !== null
  );

  // Look for loading/spinner indicators in the raw HTML
  const hasLoadingIndicator =
    html.includes("loading") || html.includes("spinner");

  return (
    isShortHtml ||
    (hasRootDiv && (hasEmptyBody || hasLoadingIndicator)) ||
    (hasEmptyBody && hasManyScripts) ||
    (lowContentRatio && hasRootDiv)
  );
}

// Extract and normalize links from the HTML document
function extractLinks(root, baseUrl, currentUrl) {
  const links = [];
  const currentUrlObj = new URL(currentUrl);
  const baseUrlObj = new URL(baseUrl);
  const anchors = root.querySelectorAll("a");

  for (const anchor of anchors) {
    const href = anchor.getAttribute("href");
    if (!href) continue;

    try {
      // Resolve relative URLs and check for same-domain
      const url = new URL(href, currentUrl);
      if (url.hostname === baseUrlObj.hostname) {
        url.hash = ""; // Remove hash
        if (isValidUrl(url.href) && url.pathname !== currentUrlObj.pathname) {
          links.push(url.href);
        }
      }
    } catch {}
  }

  return [...new Set(links)];
}

// Validate URL based on its extension to avoid non-HTML resources
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

// Fetches and parses the robots.txt file
async function getRobotsTxtRules(baseUrl) {
  const robotsUrl = `${baseUrl}/robots.txt`;
  if (config.logging.verbose)
    console.log(`Fetching robots.txt from: ${robotsUrl}`);

  try {
    const response = await axios.get(robotsUrl);
    const rules = parseRobotsTxt(response.data);
    if (config.logging.verbose)
      console.log(`Found ${rules.disallowed.length} disallowed rules.`);
    return rules.disallowed;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      if (config.logging.verbose)
        console.log("No robots.txt found. Crawling all pages.");
    } else {
      console.error(`Error fetching or parsing robots.txt:`, error.message);
    }
    return [];
  }
}

// Parses the content of a robots.txt file
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

// Generate an XML sitemap from the list of URLs

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

// Main entry point for generating the sitemap
export async function createSitemap(websiteUrl, maxPages = 100, onProgress) {
  const baseUrl = new URL(websiteUrl).origin;
  const disallowedPaths = await getRobotsTxtRules(baseUrl);
  const sitemapData = await crawlSite(
    baseUrl,
    maxPages,
    config,
    onProgress,
    disallowedPaths
  );
  if (config.logging.verbose) console.log(`Crawled ${sitemapData.size} pages`);
  return generateSitemap(sitemapData);
}
