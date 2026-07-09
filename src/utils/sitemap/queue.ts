import { Queue, QueueEvents } from "bullmq";
import { getRedisConnection, getRedisClient } from "./redis";
import { QueueError, ErrorCode } from "@/types/errors";
import { logger } from "@/utils/logger";

let sitemapQueueInstance: Queue | null = null;
let queueEventsInstance: QueueEvents | null = null;

const MAX_QUEUE_WAITING = 10;

/**
 * Get or create the sitemap queue singleton
 */
export function getSitemapQueue(): Queue {
  if (!sitemapQueueInstance) {
    const connection = getRedisConnection();
    sitemapQueueInstance = new Queue("sitemap-queue", {
      connection,
      defaultJobOptions: {
        removeOnComplete: {
          age: 3600,
          count: 100,
        },
        removeOnFail: {
          age: 86400,
        },
      },
    });

    sitemapQueueInstance.on("error", (error) => {
      logger.error("Queue error", error as Error, "queue");
    });

    logger.info("Sitemap queue initialized", "queue");
  }
  return sitemapQueueInstance;
}

/**
 * Get queue events for monitoring
 */
export function getQueueEvents(): QueueEvents {
  if (!queueEventsInstance) {
    const connection = getRedisConnection();
    queueEventsInstance = new QueueEvents("sitemap-queue", { connection });
  }
  return queueEventsInstance;
}

export interface SitemapJobData {
  url: string;
  maxPages: number;
}

/**
 * Add a sitemap job with atomic backpressure check.
 * Returns null if queue is full.
 */
export async function addSitemapJob(
  url: string,
  maxPages: number,
): Promise<{ jobId: string } | null> {
  const queue = getSitemapQueue();

  try {
    const client = await getRedisClient();

    const results = await client
      .multi()
      .scard("bull:sitemap-queue:waiting")
      .scard("bull:sitemap-queue:active")
      .exec();

    const waitingCount = parseInt(String(results?.[0] || 0), 10);
    const activeCount = parseInt(String(results?.[1] || 0), 10);
    const totalJobs = waitingCount + activeCount;

    logger.debug("Queue backpressure check", "queue", {
      waitingCount,
      activeCount,
      totalJobs,
      maxQueueWaiting: MAX_QUEUE_WAITING,
    });

    if (totalJobs >= MAX_QUEUE_WAITING) {
      logger.warn("Queue backpressure: rejecting job", "queue", {
        waitingCount,
        activeCount,
        url,
      });
      return null;
    }

    const job = await queue.add(
      "generate-sitemap",
      { url, maxPages } as SitemapJobData,
      {
        removeOnComplete: {
          age: 3600,
          count: 100,
        },
        removeOnFail: {
          age: 86400,
        },
      },
    );

    logger.info("Job added to queue", "queue", {
      jobId: job.id,
      url,
      maxPages,
    });

    return { jobId: job.id! };
  } catch (error) {
    if (error instanceof QueueError) {
      throw error;
    }

    throw new QueueError(
      "Failed to add job to queue",
      ErrorCode.QUEUE_CONNECTION_FAILED,
      { url, maxPages },
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Get job status with error handling
 */
export async function getJobStatus(
  jobId: string,
): Promise<{ status: string; progress?: unknown; result?: unknown } | null> {
  const queue = getSitemapQueue();

  try {
    const job = await queue.getJob(jobId);

    if (!job) {
      return null;
    }

    const state = await job.getState();

    return {
      status: state,
      progress: job.progress,
      result: job.returnvalue,
    };
  } catch (error) {
    logger.error("Failed to get job status", error as Error, "queue", {
      jobId,
    });
    return null;
  }
}

/**
 * Get queue metrics for monitoring
 */
export async function getQueueMetrics(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = getSitemapQueue();

  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  } catch (error) {
    logger.error("Failed to get queue metrics", error as Error, "queue");
    return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
  }
}

/**
 * Gracefully close the queue
 */
export async function closeQueue(): Promise<void> {
  if (sitemapQueueInstance) {
    await sitemapQueueInstance.close();
    sitemapQueueInstance = null;
    logger.info("Queue closed", "queue");
  }

  if (queueEventsInstance) {
    await queueEventsInstance.close();
    queueEventsInstance = null;
  }
}
