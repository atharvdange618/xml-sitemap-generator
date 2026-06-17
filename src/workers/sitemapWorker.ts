import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../utils/sitemap/redis";
import { createSitemap } from "../utils/sitemapGenerator";
import { SitemapJobData } from "../utils/sitemap/queue";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { promisify } from "util";

const gzipAsync = promisify(zlib.gzip);
const SITEMAPS_DIR = path.join(process.cwd(), ".logs", "sitemaps");
if (!fs.existsSync(SITEMAPS_DIR)) fs.mkdirSync(SITEMAPS_DIR, { recursive: true });

console.log("Sitemap Background Worker Initializing...");

const JOB_TIMEOUT_MS = 10 * 60 * 1000;
const workerConcurrency = parseInt(process.env.SITEMAP_WORKER_CONCURRENCY || "2", 10);

const worker = new Worker("sitemap-queue",
  async (job: Job<SitemapJobData>) => {
    const { url, maxPages } = job.data;
    const jobId = job.id || "unknown";
    console.log(`[Job ${jobId}] Starting sitemap crawl for: ${url} (cap: ${maxPages})`);

    const onProgress = async (crawledUrl: string, count: number) => {
      await job.updateProgress({ type: "progress", url: crawledUrl, count });
    };

    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), JOB_TIMEOUT_MS);

    try {
      const result = await createSitemap(url, maxPages, onProgress, ac.signal);
      clearTimeout(tid);

      const { sitemap, chunks, stats } = result;
      const jobDir = path.join(SITEMAPS_DIR, jobId);
      fs.mkdirSync(jobDir, { recursive: true });

      fs.writeFileSync(path.join(jobDir, "sitemap.xml"), sitemap, "utf-8");
      fs.writeFileSync(path.join(jobDir, "sitemap.xml.gz"), await gzipAsync(Buffer.from(sitemap)));

      if (chunks?.length) {
        for (let i = 0; i < chunks.length; i++) {
          const name = `sitemap-${i + 1}.xml`;
          fs.writeFileSync(path.join(jobDir, name), chunks[i], "utf-8");
          fs.writeFileSync(path.join(jobDir, `${name}.gz`), await gzipAsync(Buffer.from(chunks[i])));
        }
        console.log(`[Job ${jobId}] Wrote ${chunks.length} split sitemap chunk files`);
      }

      console.log(`[Job ${jobId}] Crawl completed. Discovered ${stats.statistics.crawling.pagesDiscovered} pages. Saved to ${jobDir}`);
      return { success: true, stats };
    } catch (error: any) {
      clearTimeout(tid);
      if (ac.signal.aborted) {
        const msg = `Job timed out after ${JOB_TIMEOUT_MS / 60000} minutes`;
        console.error(`[Job ${jobId}] ${msg}`);
        throw new Error(msg);
      }
      console.error(`[Job ${jobId}] Critical crawler error:`, error.message);
      throw error;
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: workerConcurrency,
    lockDuration: 180000,
    lockRenewTime: 30000,
    stalledInterval: 30000,
  },
);

worker.on("completed", job => console.log(`[Job ${job.id}] Completed successfully!`));
worker.on("failed", (job, err) => console.error(`[Job ${job?.id}] Failed:`, err.message));

process.on("SIGTERM", async () => { console.log("Worker SIGTERM, shutting down..."); await worker.close(); process.exit(0); });
process.on("SIGINT", async () => { console.log("Worker SIGINT, shutting down..."); await worker.close(); process.exit(0); });
