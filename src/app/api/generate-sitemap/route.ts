import { NextRequest } from "next/server";
import { addSitemapJob } from "@/utils/sitemap/queue";
import { validateCrawlUrl } from "@/utils/sitemap/urlUtils";
import {
  createErrorResponse,
  createSuccessResponse,
} from "@/utils/apiResponses";
import { logger } from "@/utils/logger";

export const dynamic = "force-dynamic";

const MAX_PAGES_HARD_LIMIT = 1000;

export async function POST(request: NextRequest): Promise<Response> {
  const requestId = request.headers.get("x-request-id") || undefined;

  try {
    let { url, maxPages } = await request.json();

    const validation = validateCrawlUrl(url);
    if (!validation.ok) {
      return createErrorResponse(
        { message: validation.reason, code: "VALIDATION_FAILED" },
        requestId,
      );
    }
    url = validation.normalized;

    const parsedMax = Math.min(
      Math.max(1, parseInt(maxPages || "100", 10) || 100),
      MAX_PAGES_HARD_LIMIT,
    );

    const result = await addSitemapJob(url, parsedMax);

    if (!result) {
      return createErrorResponse(
        {
          message: "Queue is full, please try again later",
          code: "QUEUE_FULL",
        },
        requestId,
        503,
      );
    }

    logger.info("Job queued successfully", "api", { jobId: result.jobId, url });

    return createSuccessResponse({ jobId: result.jobId });
  } catch (error) {
    logger.error("Error queueing sitemap job", error as Error, "api");
    return createErrorResponse(error, requestId);
  }
}
