import { Queue } from "bullmq";
import { getRedisConnection } from "./redis";

let sitemapQueueInstance: Queue | null = null;

export function getSitemapQueue(): Queue {
  if (!sitemapQueueInstance) {
    sitemapQueueInstance = new Queue("sitemap-queue", {
      connection: getRedisConnection(),
    });
  }
  return sitemapQueueInstance;
}

export interface SitemapJobData {
  url: string;
  maxPages: number;
}

export async function addSitemapJob(url: string, maxPages: number) {
  const queue = getSitemapQueue();
  return await queue.add(
    "generate-sitemap",
    { url, maxPages } as SitemapJobData,
    {
      removeOnComplete: {
        age: 3600, // keep complete jobs for an hour
        count: 100, // limit maximum completed jobs to 100
      },
      removeOnFail: {
        age: 86400, // keep failed jobs for 24 hours for debugging
      },
    },
  );
}
