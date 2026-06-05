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

if (!fs.existsSync(SITEMAPS_DIR)) {
  fs.mkdirSync(SITEMAPS_DIR, { recursive: true });
}

console.log("Sitemap Background Worker Initializing...");

const JOB_TIMEOUT_MS = 10 * 60 * 1000;

const worker = new Worker(
  "sitemap-queue",
  async (job: Job<SitemapJobData>) => {
    const { url, maxPages } = job.data;
    const jobId = job.id || "unknown";

    console.log(
      `[Job ${jobId}] Starting sitemap crawl for: ${url} (cap: ${maxPages})`,
    );

    const onProgress = async (crawledUrl: string, count: number) => {
      await job.updateProgress({
        type: "progress",
        url: crawledUrl,
        count,
      });
    };

    try {
      const result = await Promise.race([
        createSitemap(url, maxPages, onProgress),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Job timed out after ${JOB_TIMEOUT_MS / 60000} minutes`,
                ),
              ),
            JOB_TIMEOUT_MS,
          ),
        ),
      ]);

      const { sitemap, chunks, stats } = result;
      const jobDir = path.join(SITEMAPS_DIR, jobId);
      fs.mkdirSync(jobDir, { recursive: true });

      fs.writeFileSync(path.join(jobDir, "sitemap.xml"), sitemap, "utf-8");
      const gzipSitemapBuffer = await gzipAsync(Buffer.from(sitemap));
      fs.writeFileSync(path.join(jobDir, "sitemap.xml.gz"), gzipSitemapBuffer);

      if (chunks && chunks.length > 0) {
        for (let i = 0; i < chunks.length; i++) {
          const chunkName = `sitemap-${i + 1}.xml`;
          fs.writeFileSync(path.join(jobDir, chunkName), chunks[i], "utf-8");
          const gzipChunk = await gzipAsync(Buffer.from(chunks[i]));
          fs.writeFileSync(path.join(jobDir, `${chunkName}.gz`), gzipChunk);
        }
        console.log(
          `[Job ${jobId}] Wrote ${chunks.length} split sitemap chunk files`,
        );
      }

      console.log(
        `[Job ${jobId}] Crawl completed. Discovered ${stats.statistics.crawling.pagesDiscovered} pages. Saved files to ${jobDir}`,
      );

      return {
        success: true,
        stats,
      };
    } catch (error: any) {
      console.error(`[Job ${jobId}] Critical crawler error:`, error.message);
      throw error;
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 1,
    lockDuration: 60000, // 60 seconds (up from 30 seconds default) to tolerate CPU-heavy event loop blocks
    lockRenewTime: 15000, // Renew the lock every 15 seconds
  },
);

worker.on("completed", (job) => {
  console.log(`[Job ${job.id}] Completed successfully!`);
});

worker.on("failed", (job, err) => {
  console.error(`[Job ${job?.id}] Failed with error:`, err.message);
});
