import { ConnectionOptions } from "bullmq";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

export function getRedisConnection(): ConnectionOptions {
  try {
    const url = new URL(REDIS_URL);
    return {
      host: url.hostname || "127.0.0.1",
      port: parseInt(url.port || "6379", 10),
      username: url.username || undefined,
      password: url.password || undefined,
      maxRetriesPerRequest: null,
    };
  } catch {
    return {
      host: "127.0.0.1",
      port: 6379,
      maxRetriesPerRequest: null,
    };
  }
}
