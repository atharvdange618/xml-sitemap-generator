import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import {
  createErrorResponse,
  createNotFoundResponse,
} from "@/utils/apiResponses";
import { logger } from "@/utils/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const format = searchParams.get("format") || "xml";
  const chunk = searchParams.get("chunk");

  if (!jobId) {
    return createErrorResponse(
      { message: "jobId is required", code: "VALIDATION_FAILED" },
      undefined,
      400,
    );
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) {
    return createErrorResponse(
      { message: "Invalid jobId", code: "VALIDATION_FAILED" },
      undefined,
      400,
    );
  }

  const filename = format === "gzip" ? "sitemap.xml.gz" : "sitemap.xml";
  const filePath = path.join(
    process.cwd(),
    ".logs",
    "sitemaps",
    jobId,
    chunk && /^\d+$/.test(chunk)
      ? format === "gzip"
        ? `sitemap-${chunk}.xml.gz`
        : `sitemap-${chunk}.xml`
      : filename,
  );

  if (!fs.existsSync(filePath)) {
    return createNotFoundResponse("Sitemap file");
  }

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const contentType =
      format === "gzip" ? "application/gzip" : "application/xml";

    return new Response(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    logger.error("Failed to read sitemap file", error, "api:download", {
      filePath,
    });
    return createErrorResponse(error, undefined, 500);
  }
}
