import { config } from "./config";

export function isValidImageUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    const allowedExtensions = [".jpg",".jpeg",".png",".gif",".webp",".svg",".avif"];
    if (allowedExtensions.some(ext => pathname.endsWith(ext))) return true;
    const formatParams = ["format","fm","fmt","type"];
    for (const p of formatParams) {
      const v = urlObj.searchParams.get(p)?.toLowerCase() || "";
      if (["jpg","jpeg","png","gif","webp","svg","avif"].includes(v)) return true;
    }
    const imageSegments = ["/image/","/img/","/photo/","/thumb/","/thumbnail/","/media/"];
    if (imageSegments.some(seg => pathname.includes(seg))) return true;
    return false;
  } catch { return false; }
}

export function escapeXml(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function normalizeUrl(urlStr: string, baseUrl?: string): string {
  try {
    const url = new URL(urlStr, baseUrl);
    url.hash = "";
    if (baseUrl) {
      try {
        const base = new URL(baseUrl);
        if (url.hostname === base.hostname) url.protocol = base.protocol;
      } catch {}
    }
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    const blacklist = [
      "utm_source","utm_medium","utm_campaign","utm_term","utm_content","utm_id",
      "fbclid","gclid","dclid","msclkid","jsessionid","phpsessid",
    ];
    const params = new URLSearchParams(url.search);
    for (const key of Array.from(params.keys())) {
      if (blacklist.includes(key.toLowerCase())) params.delete(key);
    }
    const s = params.toString();
    url.search = s ? `?${s}` : "";
    return url.href;
  } catch { return urlStr; }
}

export function isPrivateIP(hostname: string): boolean {
  const l = hostname.toLowerCase();
  if (l === "localhost" || l === "127.0.0.1" || l === "::1" || l === "0.0.0.0") return true;
  const m = l.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a,b,c,d] = m.slice(1).map(Number);
    if (a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||a===127||(a===169&&b===254)||a===0||a>=224) return true;
  }
  if (l.startsWith("fe80:")||l.startsWith("fc")||l.startsWith("fd")) return true;
  return false;
}

export function validateCrawlUrl(
  url: string,
): { ok: true; normalized: string } | { ok: false; reason: string } {
  if (!url || typeof url !== "string") return { ok: false, reason: "URL is required" };
  let parsed: URL;
  try { parsed = new URL(url); } catch { return { ok: false, reason: "Invalid URL format" }; }
  if (!["http:","https:"].includes(parsed.protocol)) return { ok: false, reason: "Only HTTP and HTTPS URLs are allowed" };
  if (isPrivateIP(parsed.hostname)) return { ok: false, reason: "Private/internal IP addresses are not allowed" };
  return { ok: true, normalized: parsed.href };
}

export function isValidUrl(url: string, fromSitemap = false): boolean {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }

  const skipExtensions = [
    ".jpg",".jpeg",".png",".gif",".pdf",".zip",".css",".js",
    ".webp",".svg",".ico",".mp4",".mp3",".avif",
  ];
  const urlLower = url.toLowerCase();
  if (skipExtensions.some(ext => urlLower.endsWith(ext))) return false;

  const staticSkip = ["/wp-json/","/api/","/rest/","?rest_route="];
  if (staticSkip.some(p => urlLower.includes(p))) return false;

  if (fromSitemap) return true;

  const exclude = config.pathExcludePatterns || [];
  const pathSegments = parsed.pathname.toLowerCase().split("/").filter(Boolean);

  for (const p of exclude) {
    const n = p.toLowerCase();
    if (n.startsWith("?")) {
      const paramName = n.slice(1).split("=")[0];
      if (parsed.searchParams.has(paramName)) return false;
      continue;
    }
    const clean = n.replace(/^\/+|\/+$/g, "");
    if (pathSegments.includes(clean)) return false;
  }

  return true;
}

export function isSameOrWwwDomain(url1: string, url2: string): boolean {
  try {
    const u1 = new URL(url1), u2 = new URL(url2);
    const h1 = u1.hostname.toLowerCase().replace(/^www\./, "");
    const h2 = u2.hostname.toLowerCase().replace(/^www\./, "");
    return h1 === h2;
  } catch { return false; }
}
