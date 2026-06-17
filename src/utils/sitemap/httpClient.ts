import axios, { AxiosResponse } from "axios";
import { Browser } from "puppeteer";

const DEFAULT_TIMEOUT = 15000;

export const http = axios.create({
  timeout: DEFAULT_TIMEOUT,
  maxRedirects: 3,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate",
  },
  validateStatus: (status) => status < 500,
});

export async function fetchWithRetry(
  url: string,
  headers: Record<string, string> = {},
  attempts = 3,
  signal?: AbortSignal,
  timeoutMs?: number,
  headOnly = false,
): Promise<AxiosResponse> {
  for (let i = 0; i < attempts; i++) {
    if (signal?.aborted) {
      throw new DOMException("Request aborted by signal", "AbortError");
    }
    try {
      const seenHostPaths = new Set<string>();
      const method = headOnly ? "head" : "get";
      const response = await http[method](url, {
        headers,
        signal,
        timeout: timeoutMs,
        maxRedirects: 5,
        beforeRedirect: (opts: Record<string, any>, resp: { headers: Record<string, string>; statusCode: number }, details: { headers: Record<string, string>; url: string; method: string }) => {
          try {
            if (details.url.includes("__clerk_handshake")) {
              throw new Error(`Clerk auth redirect detected, stopping: ${details.url.split("?")[0]}`);
            }
            const u = new URL(details.url);
            const fingerprint = `${u.hostname}${u.pathname.replace(/\/+$/, "")}`;
            if (seenHostPaths.has(fingerprint)) {
              throw new Error(`Redirect loop detected: ${details.url}`);
            }
            seenHostPaths.add(fingerprint);
          } catch (e: any) {
            if (e.message?.includes("Clerk auth redirect") || e.message?.includes("Redirect loop detected")) throw e;
          }
        },
      });
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`HTTP status ${response.status}`);
      }
      return response;
    } catch (error: any) {
      if (error?.name === "AbortError" || error?.code === "ERR_CANCELED") {
        throw new DOMException("Request aborted by signal", "AbortError");
      }
      if (
        error?.code === "ETIMEDOUT" ||
        error?.code === "ECONNABORTED" ||
        error?.code === "ECONNREFUSED" ||
        error?.code === "ECONNRESET" ||
        error?.code === "ENOTFOUND"
      ) {
        throw error;
      }
      if (i === attempts - 1) throw error;
      const wait = Math.min(30000, 500 * 2 ** i + Math.random() * 500);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error("Failed to fetch after all retries");
}

export async function fetchRobotsTxtWithTimeout(
  baseUrl: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<AxiosResponse> {
  if (signal?.aborted) throw new DOMException("Request aborted by signal", "AbortError");
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), timeoutMs);
  if (signal) signal.addEventListener("abort", () => ac.abort(), { once: true });
  try {
    return await fetchWithRetry(`${baseUrl}/robots.txt`, {}, 1, ac.signal, timeoutMs);
  } finally {
    clearTimeout(tid);
  }
}

export async function fetchUrlWithPuppeteer(
  url: string,
  getBrowser: () => Promise<Browser>,
): Promise<string> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    return await page.content();
  } finally {
    try { await page.close(); } catch {}
  }
}

export async function checkUrlWithPuppeteer(
  url: string,
  getBrowser: () => Promise<Browser>,
): Promise<boolean> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    await page.setViewport({ width: 1280, height: 800 });
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    return !!(res && res.status() === 200);
  } finally {
    try { await page.close(); } catch {}
  }
}
