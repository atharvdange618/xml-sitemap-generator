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
  logging: {
    verbose: true,
  },
  maxDepth: 10,
  concurrency: 5,
};
