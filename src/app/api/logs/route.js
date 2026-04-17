import { getRecentLogs, getLatestLog } from "@/utils/statsLogger";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const latest = searchParams.get("latest") === "true";

    if (latest) {
      const log = await getLatestLog();
      if (!log) {
        return new Response(JSON.stringify({ error: "No logs found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(log), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const logs = await getRecentLogs(limit);
    return new Response(JSON.stringify(logs), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching logs:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch logs" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
