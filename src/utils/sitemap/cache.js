import fs from "fs";
import path from "path";

const CACHE_FILE = path.join(process.cwd(), ".logs", "crawl_cache.json");

export const renderCache = new Map(); // origin -> 'http' | 'browser' | 'unknown'
export const crawlCache = {};

export function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("Failed to load crawl cache:", e.message);
  }
  return {};
}

export function saveCache(cache) {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to save crawl cache:", e.message);
  }
}

export function initCrawlCache() {
  const loaded = loadCache();
  for (const key of Object.keys(crawlCache)) {
    delete crawlCache[key];
  }
  Object.assign(crawlCache, loaded);
}
