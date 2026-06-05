const CRAWL_CACHE_MAX_SIZE = 2000;

export interface CrawlCaches {
  renderCache: Map<string, any>;
  crawlCache: Record<string, any>;
}

/**
 * Create fresh per-job caches. Prevents cross-job state pollution (P0.4).
 */
export function createCrawlCaches(): CrawlCaches {
  return {
    renderCache: new Map<string, any>(),
    crawlCache: {},
  };
}

/**
 * Set a crawl cache entry with a size cap. When the cap is reached,
 * oldest entries are evicted using FIFO (Object key order).
 */
export function setCrawlCache(
  caches: CrawlCaches,
  key: string,
  value: any,
  maxSize = CRAWL_CACHE_MAX_SIZE,
): void {
  const cache = caches.crawlCache;
  const keys = Object.keys(cache);
  if (keys.length >= maxSize) {
    const toRemove = Math.ceil(maxSize * 0.2);
    for (let i = 0; i < toRemove && i < keys.length; i++) {
      delete cache[keys[i]];
    }
  }
  cache[key] = value;
}
