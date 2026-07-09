import { ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import { QueueError, ErrorCode } from "@/types/errors";
import { logger } from "@/utils/logger";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

let connectionInstance: IORedis | null = null;
let connectingPromise: Promise<IORedis> | null = null;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 5;

/**
 * Get Redis connection options for BullMQ
 */
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
    logger.warn("Invalid REDIS_URL, using defaults", "redis");
    return {
      host: "127.0.0.1",
      port: 6379,
      maxRetriesPerRequest: null,
    };
  }
}

/**
 * Get or create a persistent Redis client connection
 */
export async function getRedisClient(): Promise<IORedis> {
  if (connectionInstance?.status === "ready") {
    return connectionInstance;
  }

  if (connectingPromise) {
    return connectingPromise;
  }

  connectingPromise = createRedisConnection();
  try {
    return await connectingPromise;
  } finally {
    connectingPromise = null;
  }
}

async function createRedisConnection(): Promise<IORedis> {
  connectionAttempts++;

  try {
    const url = new URL(REDIS_URL);

    const client = new IORedis({
      host: url.hostname || "127.0.0.1",
      port: parseInt(url.port || "6379", 10),
      username: url.username || undefined,
      password: url.password || undefined,
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > MAX_CONNECTION_ATTEMPTS) {
          logger.error(
            "Redis connection failed after max attempts",
            undefined,
            "redis",
            { attempts: times },
          );
          return null;
        }

        const delay = Math.min(times * 200, 2000);
        logger.debug("Redis reconnecting", "redis", { attempt: times, delay });
        return delay;
      },
      lazyConnect: true,
    });

    await client.connect();
    connectionAttempts = 0;

    client.on("error", (error) => {
      logger.error("Redis connection error", error as Error, "redis");
    });

    client.on("close", () => {
      logger.warn("Redis connection closed", "redis");
      connectionInstance = null;
    });

    client.on("reconnecting", (delay: number) => {
      logger.debug("Redis reconnecting", "redis", { delay });
    });

    connectionInstance = client;
    logger.info("Redis connected successfully", "redis");
    return client;
  } catch (error) {
    throw new QueueError(
      "Failed to connect to Redis",
      ErrorCode.REDIS_CONNECTION_FAILED,
      { url: REDIS_URL, attempt: connectionAttempts },
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Check Redis health
 */
export async function checkRedisHealth(): Promise<{
  healthy: boolean;
  latency?: number;
  error?: string;
}> {
  try {
    const client = await getRedisClient();
    const start = performance.now();
    const pong = await client.ping();
    const latency = performance.now() - start;

    return {
      healthy: pong === "PONG",
      latency,
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get Redis info for monitoring
 */
export async function getRedisInfo(): Promise<Record<string, string> | null> {
  try {
    const client = await getRedisClient();
    const info = await client.info();

    const parsed: Record<string, string> = {};
    for (const line of info.split("\r\n")) {
      if (line && !line.startsWith("#")) {
        const [key, value] = line.split(":");
        if (key && value) {
          parsed[key.trim()] = value.trim();
        }
      }
    }

    return parsed;
  } catch (error) {
    logger.error("Failed to get Redis info", error as Error, "redis");
    return null;
  }
}

/**
 * Gracefully disconnect from Redis
 */
export async function disconnectRedis(): Promise<void> {
  if (connectionInstance) {
    await connectionInstance.quit();
    connectionInstance = null;
    logger.info("Redis disconnected", "redis");
  }
}

/**
 * Get connection status for monitoring
 */
export function getConnectionStatus(): {
  connected: boolean;
  connecting: boolean;
  attempts: number;
} {
  return {
    connected: connectionInstance?.status === "ready",
    connecting: !!connectingPromise,
    attempts: connectionAttempts,
  };
}
