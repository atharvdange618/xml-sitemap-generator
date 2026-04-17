import fs from "fs";
import path from "path";

const LOGS_DIR = path.join(process.cwd(), "public", "logs");

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

export class SitemapStats {
  constructor(websiteUrl) {
    this.websiteUrl = websiteUrl;
    this.startTime = new Date();
    this.endTime = null;
    this.sitemapPagesFound = 0;
    this.pagesCrawled = 0;
    this.finalSitemapTotal = 0;
    this.sitemapOnlyPages = 0;
    this.crawledOnlyPages = 0;
    this.overlapPages = 0;
    this.errors = [];
    this.crawlDepth = {
      maxDepth: 0,
      depthDistribution: {},
    };
    this.robotsTxtRules = {
      disallowedPaths: [],
      hadRobotsTxt: false,
    };
  }

  setRobotsTxtInfo(disallowedPaths) {
    this.robotsTxtRules.disallowedPaths = disallowedPaths;
    this.robotsTxtRules.hadRobotsTxt = disallowedPaths.length > 0;
  }

  setSitemapPages(count) {
    this.sitemapPagesFound = count;
  }

  incrementCrawledPages() {
    this.pagesCrawled++;
  }

  setTotalPages(count) {
    this.finalSitemapTotal = count;
  }

  setPageBreakdown(sitemapOnly, crawledOnly, overlap) {
    this.sitemapOnlyPages = sitemapOnly;
    this.crawledOnlyPages = crawledOnly;
    this.overlapPages = overlap;
  }

  addError(url, errorMessage) {
    this.errors.push({
      url,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });
  }

  updateDepthInfo(depth) {
    if (depth > this.crawlDepth.maxDepth) {
      this.crawlDepth.maxDepth = depth;
    }
    this.crawlDepth.depthDistribution[depth] =
      (this.crawlDepth.depthDistribution[depth] || 0) + 1;
  }

  finish() {
    this.endTime = new Date();
  }

  getDuration() {
    const end = this.endTime || new Date();
    return Math.round((end - this.startTime) / 1000);
  }

  toJSON() {
    return {
      websiteUrl: this.websiteUrl,
      timestamp: this.startTime.toISOString(),
      duration: `${this.getDuration()}s`,
      statistics: {
        existingSitemap: {
          pagesFound: this.sitemapPagesFound,
          onlyInSitemap: this.sitemapOnlyPages,
        },
        crawling: {
          pagesDiscovered: this.pagesCrawled,
          onlyFromCrawling: this.crawledOnlyPages,
        },
        overlap: this.overlapPages,
        finalSitemapTotal: this.finalSitemapTotal,
        newPagesAdded: this.crawledOnlyPages,
      },
      crawlDepth: this.crawlDepth,
      robotsTxt: this.robotsTxtRules,
      errors: {
        count: this.errors.length,
        details: this.errors.slice(0, 20),
      },
    };
  }

  getSummary() {
    const json = this.toJSON();
    return `
╔════════════════════════════════════════════════════════════════╗
║                    SITEMAP GENERATION STATS                    ║
╠════════════════════════════════════════════════════════════════╣
║ Website: ${this.websiteUrl.padEnd(53)} ║
║ Duration: ${json.duration.padEnd(52)}  ║
║                                                                ║
║ EXISTING SITEMAP:                                              ║
║   • Pages Found: ${String(this.sitemapPagesFound).padEnd(47)} ║
║   • Only in Sitemap: ${String(this.sitemapOnlyPages).padEnd(43)} ║
║                                                                ║
║ CRAWLING RESULTS:                                              ║
║   • Pages Discovered: ${String(this.pagesCrawled).padEnd(42)} ║
║   • New Pages (not in sitemap): ${String(this.crawledOnlyPages).padEnd(29)} ║
║   • Overlap (already in sitemap): ${String(this.overlapPages).padEnd(27)} ║
║                                                                ║
║ ══════════════════════════════════════════════════════════════ ║
║ 📄 FINAL GENERATED SITEMAP: ${String(this.finalSitemapTotal).padEnd(33)} ║
║ ══════════════════════════════════════════════════════════════ ║
║                                                                ║
║ CRAWL DEPTH:                                                   ║
║   • Max Depth: ${String(this.crawlDepth.maxDepth).padEnd(49)}  ║
║                                                                ║
║ ROBOTS.TXT:                                                    ║
║   • Found: ${(this.robotsTxtRules.hadRobotsTxt ? "Yes" : "No").padEnd(53)} ║
║   • Disallowed Paths: ${String(this.robotsTxtRules.disallowedPaths.length).padEnd(40)} ║
║                                                                ║
║ ERRORS: ${String(this.errors.length).padEnd(56)} ║
╚════════════════════════════════════════════════════════════════╝
    `.trim();
  }

  async save() {
    this.finish();
    const timestamp = this.startTime.toISOString().replace(/[:.]/g, "-");
    const domain = new URL(this.websiteUrl).hostname.replace(/\./g, "_");
    const filename = `${domain}_${timestamp}.json`;
    const filepath = path.join(LOGS_DIR, filename);

    try {
      await fs.promises.writeFile(
        filepath,
        JSON.stringify(this.toJSON(), null, 2),
      );
      console.log(`\n✅ Stats saved to: ${filepath}`);

      const latestPath = path.join(LOGS_DIR, "latest.json");
      await fs.promises.writeFile(
        latestPath,
        JSON.stringify(this.toJSON(), null, 2),
      );

      return filepath;
    } catch (error) {
      console.error(`Error saving stats: ${error.message}`);
      return null;
    }
  }
}

export async function getRecentLogs(limit = 10) {
  try {
    const files = await fs.promises.readdir(LOGS_DIR);
    const jsonFiles = files
      .filter((f) => f.endsWith(".json") && f !== "latest.json")
      .sort()
      .reverse()
      .slice(0, limit);

    const logs = [];
    for (const file of jsonFiles) {
      const content = await fs.promises.readFile(
        path.join(LOGS_DIR, file),
        "utf-8",
      );
      logs.push(JSON.parse(content));
    }

    return logs;
  } catch (error) {
    console.error(`Error reading logs: ${error.message}`);
    return [];
  }
}

export async function getLatestLog() {
  try {
    const latestPath = path.join(LOGS_DIR, "latest.json");
    const content = await fs.promises.readFile(latestPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}
