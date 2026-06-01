import { NextRequest } from "next/server";
import { createSitemap } from "@/utils/sitemapGenerator";
import zlib from "zlib";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    const maxPages = searchParams.get("maxPages");

    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const onProgress = (crawledUrl: string, count: number) => {
          const progressData = { type: "progress", url: crawledUrl, count };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(progressData)}\n\n`),
          );
        };

        try {
          const { sitemap, stats } = await createSitemap(
            url,
            parseInt(maxPages || "100", 10) || 100,
            onProgress,
          );
          const gzipSitemap = zlib
            .gzipSync(Buffer.from(sitemap))
            .toString("base64");
          const doneData = { type: "done", sitemap, gzipSitemap, stats };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(doneData)}\n\n`),
          );
        } catch (error: any) {
          console.error("Error during sitemap generation:", error);
          const errorData = { type: "error", message: error.message };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error in generate-sitemap route:", error);
    const errorData = {
      type: "error",
      message: "Failed to start sitemap generation",
    };
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`),
        );
        controller.close();
      },
    });
    return new Response(stream, {
      status: 500,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }
}
