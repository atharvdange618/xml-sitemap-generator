export function isValidImageUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const allowedExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".svg",
      ".avif",
    ];
    const pathname = urlObj.pathname.toLowerCase();
    return allowedExtensions.some((ext) => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * Escapes special characters for XML compliance.
 */
export function escapeXml(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Normalizes URLs: strips tracking parameters and standardizes trailing slashes.
 */
export function normalizeUrl(urlStr: string, baseUrl?: string): string {
  try {
    const url = new URL(urlStr, baseUrl);
    url.hash = "";

    // Protocol consolidation: enforce the protocol of the base URL for same-host links
    if (baseUrl) {
      try {
        const baseUrlObj = new URL(baseUrl);
        if (url.hostname === baseUrlObj.hostname) {
          url.protocol = baseUrlObj.protocol;
        }
      } catch {}
    }

    // Trailing slash normalization: remove trailing slash from pathname unless it's just "/"
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }

    // Whitelist query parameters (strip tracking ones)
    const blacklist = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "utm_id",
      "fbclid",
      "gclid",
      "dclid",
      "msclkid",
      "jsessionid",
      "phpsessid",
    ];

    const params = new URLSearchParams(url.search);
    for (const key of Array.from(params.keys())) {
      if (blacklist.includes(key.toLowerCase())) {
        params.delete(key);
      }
    }

    const searchStr = params.toString();
    url.search = searchStr ? `?${searchStr}` : "";

    return url.href;
  } catch (e) {
    return urlStr;
  }
}

export function isPrivateIP(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower === "127.0.0.1" || lower === "::1" || lower === "0.0.0.0") {
    return true;
  }

  const ipv4Match = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [a, b, c, d] = ipv4Match.slice(1).map(Number);
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 169 && b === 254) return true; // Link-local
    if (a === 0) return true; // 0.0.0.0/8
    if (a >= 224) return true; // Multicast + reserved
  }

  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) {
    return true;
  }

  return false;
}

export function validateCrawlUrl(url: string): { ok: true; normalized: string } | { ok: false; reason: string } {
  if (!url || typeof url !== "string") {
    return { ok: false, reason: "URL is required" };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "Invalid URL format" };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, reason: "Only HTTP and HTTPS URLs are allowed" };
  }

  if (isPrivateIP(parsed.hostname)) {
    return { ok: false, reason: "Private/internal IP addresses are not allowed" };
  }

  return { ok: true, normalized: parsed.href };
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
  } catch {
    return false;
  }

  const skipExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".pdf",
    ".zip",
    ".css",
    ".js",
    ".webp",
    ".svg",
    ".ico",
    ".mp4",
    ".mp3",
    ".avif",
  ];

  const skipPatterns = ["/wp-json/", "/api/", "/rest/", "?rest_route="];
  const urlLower = url.toLowerCase();

  if (skipExtensions.some((ext) => urlLower.endsWith(ext))) {
    return false;
  }

  if (skipPatterns.some((pattern) => url.includes(pattern))) {
    return false;
  }

  return true;
}
