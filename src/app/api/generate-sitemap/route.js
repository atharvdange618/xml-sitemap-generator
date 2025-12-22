import { createSitemap } from "@/utils/sitemapGenerator";

export const dynamic = "force-dynamic";

export async function GET(request) {
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

        const onProgress = (crawledUrl, count) => {
          const progressData = { type: "progress", url: crawledUrl, count };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(progressData)}\n\n`)
          );
        };

        try {
          const sitemap = await createSitemap(
            url,
            parseInt(maxPages, 10) || 100,
            onProgress
          );
          const doneData = { type: "done", sitemap };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(doneData)}\n\n`)
          );
        } catch (error) {
          console.error("Error during sitemap generation:", error);
          const errorData = { type: "error", message: error.message };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`)
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
    const errorData = { type: "error", message: "Failed to start sitemap generation" };
    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
            controller.close();
        }
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