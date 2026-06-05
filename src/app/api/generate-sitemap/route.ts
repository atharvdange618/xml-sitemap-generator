import { NextRequest, NextResponse } from "next/server";
import { addSitemapJob, getSitemapQueue } from "@/utils/sitemap/queue";
import { validateCrawlUrl } from "@/utils/sitemap/urlUtils";

export const dynamic = "force-dynamic";

const MAX_PAGES_HARD_LIMIT = 500;
const MAX_QUEUE_WAITING = 10;

export async function POST(request: NextRequest): Promise<Response> {
  try {
    let { url, maxPages } = await request.json();

    const validation = validateCrawlUrl(url);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.reason }, { status: 400 });
    }
    url = validation.normalized;

    const parsedMax = Math.min(
      Math.max(1, parseInt(maxPages || "100", 10) || 100),
      MAX_PAGES_HARD_LIMIT
    );

    const queue = getSitemapQueue();
    const waitingCount = await queue.getWaitingCount();
    if (waitingCount >= MAX_QUEUE_WAITING) {
      return NextResponse.json(
        { error: "Queue is full, please try again later" },
        { status: 503 }
      );
    }

    const job = await addSitemapJob(url, parsedMax);

    return NextResponse.json({ success: true, jobId: job.id });
  } catch (error: any) {
    console.error("Error queueing sitemap job:", error);
    return NextResponse.json(
      { error: "Failed to queue sitemap job: " + error.message },
      { status: 500 }
    );
  }
}
