export function isValidImageUrl(url) {
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
export function escapeXml(value) {
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
export function normalizeUrl(urlStr, baseUrl) {
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

export function isValidUrl(url) {
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
