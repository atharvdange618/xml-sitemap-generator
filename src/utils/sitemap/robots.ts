import { fetchRobotsTxtWithTimeout } from "./httpClient";
import { config } from "./config";

export interface CompiledRule { pattern: string; regex: RegExp; }
export interface RobotsRulesCompiled { disallowed: CompiledRule[]; allowed: CompiledRule[]; }

export function parseRobotsTxt(content: string, userAgent = "XmlSitemapGenerator"): RobotsRulesCompiled {
  const rules: RobotsRulesCompiled = { disallowed: [], allowed: [] };
  const currentAgents: string[] = [];
  const lines = content.split(/\r?\n/);

  function compilePattern(pattern: string): RegExp {
    let hasEnd = false;
    let w = pattern;
    if (w.endsWith("$")) { hasEnd = true; w = w.slice(0, -1); }
    const esc = w.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    return new RegExp("^" + esc.replace(/\*/g, ".*") + (hasEnd ? "$" : ""));
  }

  let inUA = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const ci = t.indexOf(":");
    if (ci === -1) continue;
    const key = t.slice(0, ci).trim().toLowerCase();
    const val = t.slice(ci + 1).trim();

    if (key === "user-agent") {
      if (!inUA) { currentAgents.length = 0; inUA = true; }
      currentAgents.push(val.toLowerCase());
    } else if (key === "disallow" || key === "allow") {
      inUA = false;
      const matches = currentAgents.some(a => {
        const u = userAgent.toLowerCase();
        return a === "*" || a === u || u.includes(a) || a.includes(u);
      });
      if (matches && val) {
        const c = { pattern: val, regex: compilePattern(val) };
        if (key === "disallow") rules.disallowed.push(c);
        else rules.allowed.push(c);
      }
    }
  }
  return rules;
}

export function isPathAllowed(path: string, rules: RobotsRulesCompiled): boolean {
  let md: CompiledRule|null = null, ma: CompiledRule|null = null;
  for (const r of rules.disallowed) {
    if (r.regex.test(path) && (!md || r.pattern.length > md.pattern.length)) md = r;
  }
  for (const r of rules.allowed) {
    if (r.regex.test(path) && (!ma || r.pattern.length > ma.pattern.length)) ma = r;
  }
  if (md && ma) return ma.pattern.length >= md.pattern.length;
  if (md) return false;
  return true;
}

export async function fetchRobotsTxtRules(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<{ rules: RobotsRulesCompiled; content: string }> {
  let content = "";
  try {
    console.log(`[Robots] Fetching robots.txt from ${baseUrl}...`);
    const res = await fetchRobotsTxtWithTimeout(baseUrl, config.robotsTxtTimeout, signal);
    content = res.data;
    console.log(`[Robots] robots.txt fetched successfully (${content.length} bytes)`);
  } catch (e: any) {
    if (e?.name === "AbortError") console.warn(`[Robots] robots.txt fetch aborted for ${baseUrl}`);
    else console.warn(`[Robots] HTTP failed to fetch robots.txt (${e.message}).`);
  }
  return { rules: parseRobotsTxt(content), content };
}
