import axios, { AxiosResponse } from "axios";
import { Browser } from "puppeteer";

// Configured HTTP Client with headers and redirects limit
export const http = axios.create({
  timeout: 15000,
  maxRedirects: 5,
  headers: {
    "User-Agent":
      "XmlSitemapGenerator/1.0 (+https://github.com/atharvdange618/xml-sitemap-generator)",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
  },
  validateStatus: (status) => status < 500, // Surface 4xx without throwing; retry on 5xx
});

export async function fetchWithRetry(
  url: string,
  headers: Record<string, string> = {},
  attempts = 3,
): Promise<AxiosResponse> {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await http.get(url, { headers });
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`HTTP status ${response.status}`);
      }
      return response;
    } catch (error) {
      if (i === attempts - 1) throw error;

      const wait = Math.min(30000, 500 * 2 ** i + Math.random() * 500);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw new Error("Failed to fetch after all retries");
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
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    return await page.content();
  } finally {
    try {
      await page.close();
    } catch {}
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
    const res = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    return !!(res && res.status() === 200);
  } finally {
    try {
      await page.close();
    } catch {}
  }
}
