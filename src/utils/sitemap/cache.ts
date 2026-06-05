import fs from "fs";
import path from "path";

const CACHE_FILE = path.join(process.cwd(), ".logs", "crawl_cache.json");
const CRAWL_CACHE_MAX_SIZE = 2000;

export interface CrawlCaches {
  renderCache: Map<string, any>;
  crawlCache: Record<string, any>;
}

/**
 * Create fresh per-job caches. Prevents cross-job state pollution (P0.4).
 */
export function createCrawlCaches(preload?: Record<string, any>): CrawlCaches {
  return {
    renderCache: new Map<string, any>(),
    crawlCache: preload ? { ...preload } : {},
  };
}

export function loadCache(): Record<string, any> {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    }
  } catch (e: any) {
    console.error("Failed to load crawl cache:", e.message);
  }
  return {};
}

export function saveCache(cache: Record<string, any>): void {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  } catch (e: any) {
    console.error("Failed to save crawl cache:", e.message);
  }
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
