import axios from "axios";

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

export async function fetchWithRetry(url, headers = {}, attempts = 3) {
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
}

export async function fetchUrlWithPuppeteer(url, getBrowser) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    const text = await page.evaluate(async () => {
      const res = await fetch(window.location.href);
      return res.text();
    });
    return text;
  } finally {
    try {
      await page.close();
    } catch {}
  }
}

export async function checkUrlWithPuppeteer(url, getBrowser) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const res = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    return res && res.status() === 200;
  } finally {
    try {
      await page.close();
    } catch {}
  }
}
