export interface CsrConfig {
  minimalContentLength: number;
  minimalChildNodes: number;
  scriptCountThreshold: number;
  contentScriptRatio: number;
  rootSelectors: string[];
}

export interface PuppeteerConfig {
  waitForSelectorsTimeout: number;
  gotoTimeout: number;
  waitUntil: "load" | "domcontentloaded" | "networkidle0" | "networkidle2";
}

export interface LoggingConfig {
  verbose: boolean;
}

export interface CrawlerConfig {
  csr: CsrConfig;
  puppeteer: PuppeteerConfig;
  logging: LoggingConfig;
  maxDepth: number;
  concurrency: number;
  defaultTimeout: number;
  robotsTxtTimeout: number;
  timeoutOverrides: Record<string, number>;
  pathExcludePatterns: string[];
}

function parseTimeoutOverrides(): Record<string, number> {
  try {
    const raw = process.env.SITEMAP_TIMEOUT_OVERRIDES;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v !== "number" || v < 1000) delete (parsed as any)[k];
        }
        return parsed as Record<string, number>;
      }
    }
  } catch {}
  return {};
}

function parsePathExcludePatterns(): string[] {
  const defaults = [
    "/tag/", "/tags/", "/category/", "/categories/", "/archive/",
    "/topic/", "/topics/", "/label/", "/labels/", "/author/", "/authors/",
    "/page/", "/type/",
    "?tag=", "?category=", "?topic=", "?label=", "?author=", "?page=",
  ];
  const env = process.env.SITEMAP_EXCLUDE_PATTERNS;
  if (env) {
    const custom = env.split(",").map(p => p.trim()).filter(Boolean);
    if (custom.length > 0) return custom;
  }
  return defaults;
}

export const config: CrawlerConfig = {
  csr: {
    minimalContentLength: 200,
    minimalChildNodes: 5,
    scriptCountThreshold: 10,
    contentScriptRatio: 1000,
    rootSelectors: ["#root", "#__next", "#app", "#__nuxt", "[ng-version]"],
  },
  puppeteer: {
    waitForSelectorsTimeout: 8000,
    gotoTimeout: 15000,
    waitUntil: "domcontentloaded",
  },
  logging: { verbose: true },
  maxDepth: 10,
  concurrency: 5,
  defaultTimeout: 15000,
  robotsTxtTimeout: 30000,
  timeoutOverrides: parseTimeoutOverrides(),
  pathExcludePatterns: parsePathExcludePatterns(),
};
