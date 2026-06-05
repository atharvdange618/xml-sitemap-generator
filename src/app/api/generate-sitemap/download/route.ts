import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const format = searchParams.get("format") || "xml";

  if (!jobId) {
    return new Response(JSON.stringify({ error: "jobId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) {
    return new Response(JSON.stringify({ error: "Invalid jobId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const filename = format === "gzip" ? "sitemap.xml.gz" : "sitemap.xml";
  const filePath = path.join(
    process.cwd(),
    ".logs",
    "sitemaps",
    jobId,
    filename,
  );

  if (!fs.existsSync(filePath)) {
    return new Response(JSON.stringify({ error: "Sitemap file not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
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
    console.error("Failed to read sitemap file:", error);
    return new Response(
      JSON.stringify({ error: "Failed to read file: " + error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
