import { NextRequest } from "next/server";
import { getSitemapQueue } from "@/utils/sitemap/queue";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return new Response(JSON.stringify({ error: "jobId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sitemapQueue = getSitemapQueue();
  const encoder = new TextEncoder();
  let isClosed = false;
  let timerId: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const job = await sitemapQueue.getJob(jobId);
      if (!job) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: "Job not found" })}\n\n`)
        );
        controller.close();
        return;
      }

      let lastProgressCount = -1;
      let lastProgressUrl = "";

      const checkJob = async () => {
        if (isClosed) return;

        try {
          const currentJob = await sitemapQueue.getJob(jobId);
          if (!currentJob) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "error", message: "Job data lost" })}\n\n`)
            );
            controller.close();
            isClosed = true;
            return;
          }

          const state = await currentJob.getState();
          const progress = currentJob.progress;

          if (progress && typeof progress === "object") {
            const pObj = progress as any;
            if (pObj.count !== lastProgressCount || pObj.url !== lastProgressUrl) {
              lastProgressCount = pObj.count;
              lastProgressUrl = pObj.url;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "progress", url: pObj.url, count: pObj.count })}\n\n`)
              );
            }
          }

          if (state === "completed") {
            const result = currentJob.returnvalue;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "done", stats: result?.stats })}\n\n`)
            );
            controller.close();
            isClosed = true;
            return;
          }

          if (state === "failed") {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  message: currentJob.failedReason || "Background crawl failed",
                })}\n\n`
              )
            );
            controller.close();
            isClosed = true;
            return;
          }

          timerId = setTimeout(checkJob, 500);
        } catch (error: any) {
          console.error("Error checking job progress in SSE:", error);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`)
          );
          controller.close();
          isClosed = true;
        }
      };

      checkJob();
    },
    cancel() {
      isClosed = true;
      if (timerId) {
        clearTimeout(timerId);
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
}
