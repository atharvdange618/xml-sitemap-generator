import { NextResponse } from "next/server";
import { checkRedisHealth } from "@/utils/sitemap/redis";
import { getQueueMetrics } from "@/utils/sitemap/queue";
import { metrics } from "@/utils/metrics";
import { httpCircuitBreakers } from "@/utils/circuitBreaker";
import { logger } from "@/utils/logger";

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    redis: {
      status: "healthy" | "unhealthy";
      latency?: number;
      error?: string;
    };
    queue: {
      status: "healthy" | "degraded";
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
    memory: {
      status: "healthy" | "degraded";
      heapUsed: number;
      heapTotal: number;
      rss: number;
    };
    circuitBreakers: {
      status: "healthy" | "degraded";
      openCount: number;
      totalBreakers: number;
    };
  };
  metrics: {
    crawlsStarted: number;
    crawlsCompleted: number;
    crawlsFailed: number;
    urlsProcessed: number;
    urlsFailed: number;
  };
}

/**
 * GET /api/health - Health check endpoint
 */
export async function GET() {
  const startTime = performance.now();

  try {
    const [redisHealth, queueMetrics, memoryUsage, circuitBreakerStates] =
      await Promise.all([
        checkRedisHealth(),
        getQueueMetrics(),
        Promise.resolve(process.memoryUsage()),
        Promise.resolve(httpCircuitBreakers.getAllStates()),
      ]);

    const metricsData = metrics.getMetrics();

    const redisStatus = redisHealth.healthy ? "healthy" : "unhealthy";
    const queueStatus = queueMetrics.failed > 10 ? "degraded" : "healthy";
    const memoryStatus =
      memoryUsage.heapUsed > memoryUsage.heapTotal * 0.9
        ? "degraded"
        : "healthy";
    const openCircuitCount = httpCircuitBreakers.getOpenCircuitCount();
    const circuitBreakerStatus = openCircuitCount > 0 ? "degraded" : "healthy";

    let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
    if (redisStatus === "unhealthy") {
      overallStatus = "unhealthy";
    } else if (
      queueStatus === "degraded" ||
      memoryStatus === "degraded" ||
      circuitBreakerStatus === "degraded"
    ) {
      overallStatus = "degraded";
    }

    const response: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || "1.0.0",
      checks: {
        redis: {
          status: redisStatus,
          latency: redisHealth.latency,
          error: redisHealth.error,
        },
        queue: {
          status: queueStatus,
          waiting: queueMetrics.waiting,
          active: queueMetrics.active,
          completed: queueMetrics.completed,
          failed: queueMetrics.failed,
        },
        memory: {
          status: memoryStatus,
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          rss: memoryUsage.rss,
        },
        circuitBreakers: {
          status: circuitBreakerStatus,
          openCount: openCircuitCount,
          totalBreakers: Object.keys(circuitBreakerStates).length,
        },
      },
      metrics: {
        crawlsStarted: metricsData.crawlsStarted,
        crawlsCompleted: metricsData.crawlsCompleted,
        crawlsFailed: metricsData.crawlsFailed,
        urlsProcessed: metricsData.urlsProcessed,
        urlsFailed: metricsData.urlsFailed,
      },
    };

    const duration = performance.now() - startTime;
    logger.debug("Health check completed", "health", {
      status: overallStatus,
      duration,
    });

    const httpStatus =
      overallStatus === "healthy"
        ? 200
        : overallStatus === "degraded"
          ? 207
          : 503;
    return NextResponse.json(response, { status: httpStatus });
  } catch (error) {
    logger.error("Health check failed", error as Error, "health");

    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 },
    );
  }
}
