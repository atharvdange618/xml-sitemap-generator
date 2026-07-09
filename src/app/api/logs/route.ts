import { NextRequest } from "next/server";
import { getRecentLogs, getLatestLog } from "@/utils/statsLogger";
import {
  createErrorResponse,
  createNotFoundResponse,
  createSuccessResponse,
} from "@/utils/apiResponses";
import { logger } from "@/utils/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const latest = searchParams.get("latest") === "true";

    if (latest) {
      const log = await getLatestLog();
      if (!log) {
        return createNotFoundResponse("Logs");
      }
      return createSuccessResponse(log);
    }

    const logs = await getRecentLogs(limit);
    return createSuccessResponse(logs);
  } catch (error) {
    logger.error("Error fetching logs", error, "api:logs");
    return createErrorResponse(error, undefined, 500);
  }
}
