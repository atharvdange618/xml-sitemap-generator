import { NextRequest, NextResponse } from "next/server";
import { addSitemapJob } from "@/utils/sitemap/queue";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const { url, maxPages } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const job = await addSitemapJob(url, parseInt(maxPages || "100", 10) || 100);

    return NextResponse.json({ success: true, jobId: job.id });
  } catch (error: any) {
    console.error("Error queueing sitemap job:", error);
    return NextResponse.json(
      { error: "Failed to queue sitemap job: " + error.message },
      { status: 500 }
    );
  }
}
