import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../utils/sitemap/redis";
import { createSitemap } from "../utils/sitemapGenerator";
import { SitemapJobData } from "../utils/sitemap/queue";
import { atomicWriteFile, ensureDirectory } from "../utils/fileOps";
import { logger, createJobLogger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { classifyError, isErrorRetryable } from "../utils/errors";
import { AppError, ErrorCode, TimeoutError } from "../types/errors";
import zlib from "zlib";
import { promisify } from "util";
import path from "path";

const gzipAsync = promisify(zlib.gzip);
const SITEMAPS_DIR = path.join(process.cwd(), ".logs", "sitemaps");

const JOB_TIMEOUT_MS = 10 * 60 * 1000;
const workerConcurrency = parseInt(
  process.env.SITEMAP_WORKER_CONCURRENCY || "2",
  10,
);

/**
 * Job context for isolation and logging
 */
interface JobContext {
  jobId: string;
  url: string;
  maxPages: number;
  logger: ReturnType<typeof createJobLogger>;
  abortController: AbortController;
}

/**
 * Create job context for isolated job execution
 */
function createJobContext(job: Job<SitemapJobData>): JobContext {
  const jobId = job.id || "unknown";
  const { url, maxPages } = job.data;

  return {
    jobId,
    url,
    maxPages,
    logger: createJobLogger(jobId),
    abortController: new AbortController(),
  };
}

/**
 * Process a single sitemap job
 */
async function processJob(
  job: Job<SitemapJobData>,
  ctx: JobContext,
): Promise<{ success: boolean; stats: unknown }> {
  const { jobId, url, maxPages, logger: jobLogger } = ctx;

  jobLogger.info("Starting sitemap crawl", "worker", { url, maxPages });
  metrics.increment("crawls.started");

  const startTime = performance.now();

  const onProgress = async (crawledUrl: string, count: number) => {
    await job.updateProgress({ type: "progress", url: crawledUrl, count });
  };

  const tid = setTimeout(() => ctx.abortController.abort(), JOB_TIMEOUT_MS);

  try {
    const result = await createSitemap(
      url,
      maxPages,
      onProgress,
      ctx.abortController.signal,
      ctx.logger,
    );
    clearTimeout(tid);

    const duration = performance.now() - startTime;
    metrics.increment("crawls.completed");
    metrics.recordCrawlDuration(duration);

    const { sitemap, chunks, stats } = result;

    const jobDir = path.join(SITEMAPS_DIR, jobId);
    await ensureDirectory(jobDir);

    await atomicWriteFile(path.join(jobDir, "sitemap.xml"), sitemap);
    await atomicWriteFile(
      path.join(jobDir, "sitemap.xml.gz"),
      await gzipAsync(Buffer.from(sitemap)),
    );

    if (chunks?.length) {
      for (let i = 0; i < chunks.length; i++) {
        const name = `sitemap-${i + 1}.xml`;
        await atomicWriteFile(path.join(jobDir, name), chunks[i]);
        await atomicWriteFile(
          path.join(jobDir, `${name}.gz`),
          await gzipAsync(Buffer.from(chunks[i])),
        );
      }
      jobLogger.info("Wrote split sitemap chunks", "worker", {
        chunkCount: chunks.length,
      });
    }

    jobLogger.info("Crawl completed successfully", "worker", {
      pagesDiscovered: stats.statistics.crawling.pagesDiscovered,
      duration,
      jobDir,
    });

    return { success: true, stats };
  } catch (error) {
    clearTimeout(tid);
    metrics.increment("crawls.failed");

    const classified = classifyError(error);

    if (ctx.abortController.signal.aborted) {
      const timeoutError = new TimeoutError(
        `Job timed out after ${JOB_TIMEOUT_MS / 60000} minutes`,
        "sitemap-crawl",
        JOB_TIMEOUT_MS,
        { jobId, url },
      );
      jobLogger.error("Job timed out", timeoutError, "worker");
      throw timeoutError;
    }

    jobLogger.error("Critical crawler error", classified, "worker");

    throw new AppError(
      classified.message,
      ErrorCode.CRAWL_FAILED,
      "critical",
      isErrorRetryable(classified),
      { jobId, url },
      classified,
    );
  }
}

logger.info("Sitemap Background Worker Initializing...", "worker");

const worker = new Worker(
  "sitemap-queue",
  async (job: Job<SitemapJobData>) => {
    const ctx = createJobContext(job);
    return processJob(job, ctx);
  },
  {
    connection: getRedisConnection(),
    concurrency: workerConcurrency,
    lockDuration: 180000,
    lockRenewTime: 30000,
    stalledInterval: 30000,
  },
);

worker.on("completed", (job) => {
  logger.info("Job completed successfully", "worker", { jobId: job.id });
});

worker.on("failed", (job, err) => {
  const classified = classifyError(err);
  logger.error("Job failed", classified, "worker", { jobId: job?.id });
});

worker.on("stalled", (jobId) => {
  logger.warn("Job stalled", "worker", { jobId });
});

async function shutdown(signal: string) {
  logger.info(`Worker received ${signal}, shutting down...`, "worker");

  try {
    await worker.close();
    logger.info("Worker shut down gracefully", "worker");
    process.exit(0);
  } catch (error) {
    logger.error("Error during worker shutdown", error as Error, "worker");
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
