import fs from "fs";
import path from "path";
import { StatsJson, CrawlError } from "../types/sitemap";

const LOGS_DIR = path.join(process.cwd(), ".logs");

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

export class SitemapStats {
  public websiteUrl: string;
  public startTime: Date;
  public endTime: Date | null;
  public sitemapPagesFound: number;
  public pagesCrawled: number;
  public finalSitemapTotal: number;
  public sitemapOnlyPages: number;
  public crawledOnlyPages: number;
  public overlapPages: number;
  public errors: CrawlError[];
  public crawlDepth: {
    maxDepth: number;
    depthDistribution: Record<string, number>;
  };
  public robotsTxtRules: {
    rules: string[];
    hadRobotsTxt: boolean;
  };

  constructor(websiteUrl: string) {
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
      rules: [],
      hadRobotsTxt: false,
    };
  }

  setRobotsTxtInfo(rules: string[]): void {
    this.robotsTxtRules.rules = rules;
    this.robotsTxtRules.hadRobotsTxt = rules.length > 0;
  }

  setSitemapPages(count: number): void {
    this.sitemapPagesFound = count;
  }

  incrementCrawledPages(): void {
    this.pagesCrawled++;
  }

  setTotalPages(count: number): void {
    this.finalSitemapTotal = count;
  }

  setPageBreakdown(sitemapOnly: number, crawledOnly: number, overlap: number): void {
    this.sitemapOnlyPages = sitemapOnly;
    this.crawledOnlyPages = crawledOnly;
    this.overlapPages = overlap;
  }

  addError(url: string, errorMessage: string): void {
    if (this.errors.length >= 500) return;
    this.errors.push({
      url,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });
  }

  updateDepthInfo(depth: number): void {
    if (depth > this.crawlDepth.maxDepth) {
      this.crawlDepth.maxDepth = depth;
    }
    const currentCount = this.crawlDepth.depthDistribution[String(depth)] || 0;
    this.crawlDepth.depthDistribution[String(depth)] = currentCount + 1;
  }

  finish(): void {
    this.endTime = new Date();
  }

  getDuration(): number {
    const end = this.endTime || new Date();
    return Math.round((end.getTime() - this.startTime.getTime()) / 1000);
  }

  toJSON(): StatsJson {
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
        details: this.errors.slice(0, 1000),
      },
    };
  }

  getSummary(): string {
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
║   FINAL GENERATED SITEMAP: ${String(this.finalSitemapTotal).padEnd(34)} ║
║ ══════════════════════════════════════════════════════════════ ║
║                                                                ║
║ CRAWL DEPTH:                                                   ║
║   • Max Depth: ${String(this.crawlDepth.maxDepth).padEnd(49)}  ║
║                                                                ║
║ ROBOTS.TXT:                                                    ║
║   • Found: ${(this.robotsTxtRules.hadRobotsTxt ? "Yes" : "No").padEnd(53)} ║
║   • Rules: ${String(this.robotsTxtRules.rules.length).padEnd(53)} ║
║                                                                ║
║ ERRORS: ${String(this.errors.length).padEnd(56)} ║
╚════════════════════════════════════════════════════════════════╝
    `.trim();
  }

  async save(): Promise<string | null> {
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
      console.log(`\nStats saved to: ${filepath}`);

      const latestPath = path.join(LOGS_DIR, "latest.json");
      await fs.promises.writeFile(
        latestPath,
        JSON.stringify(this.toJSON(), null, 2),
      );

      return filepath;
    } catch (error: any) {
      console.error(`Error saving stats: ${error.message}`);
      return null;
    }
  }
}

export async function getRecentLogs(limit = 10): Promise<StatsJson[]> {
  try {
    const files = await fs.promises.readdir(LOGS_DIR);
    const jsonFiles = files
      .filter((f) => f.endsWith(".json") && f !== "latest.json")
      .sort()
      .reverse()
      .slice(0, limit);

    const logs: StatsJson[] = [];
    for (const file of jsonFiles) {
      const content = await fs.promises.readFile(
        path.join(LOGS_DIR, file),
        "utf-8",
      );
      logs.push(JSON.parse(content));
    }

    return logs;
  } catch (error: any) {
    console.error(`Error reading logs: ${error.message}`);
    return [];
  }
}

export async function getLatestLog(): Promise<StatsJson | null> {
  try {
    const latestPath = path.join(LOGS_DIR, "latest.json");
    const content = await fs.promises.readFile(latestPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
