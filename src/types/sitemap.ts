export interface AlternateLink {
  hreflang: string;
  href: string;
}

export interface SitemapImage {
  loc: string;
  title?: string;
  caption?: string;
}

export interface SitemapItem {
  lastmod?: string | null;
  priority: string;
  alternates?: AlternateLink[];
  images?: (string | SitemapImage)[];
}

export interface CrawlConfig {
  maxDepth?: number;
  concurrency?: number;
  timeout?: number;
  headers?: Record<string, string>;
  cacheTTL?: number;
}

export interface RobotsRules {
  disallowed: string[];
  allowed: string[];
  hadRobotsTxt?: boolean;
}

export interface CrawlError {
  url: string;
  error: string;
  timestamp: string;
}

export interface StatsJson {
  websiteUrl: string;
  timestamp: string;
  duration: string;
  statistics: {
    existingSitemap: {
      pagesFound: number;
      onlyInSitemap: number;
    };
    crawling: {
      pagesDiscovered: number;
      onlyFromCrawling: number;
    };
    overlap: number;
    finalSitemapTotal: number;
    newPagesAdded: number;
  };
  crawlDepth: {
    maxDepth: number;
    depthDistribution: Record<string, number>;
  };
  robotsTxt: {
    rules: string[];
    hadRobotsTxt: boolean;
  };
  errors: {
    count: number;
    details: CrawlError[];
  };
}
