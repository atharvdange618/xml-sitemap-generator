import { http, fetchUrlWithPuppeteer } from "./httpClient";
import { Browser } from "puppeteer";

export interface CompiledRule {
  pattern: string;
  regex: RegExp;
}

export interface RobotsRulesCompiled {
  disallowed: CompiledRule[];
  allowed: CompiledRule[];
}

export function parseRobotsTxt(content: string, userAgent = "XmlSitemapGenerator"): RobotsRulesCompiled {
  const rules: RobotsRulesCompiled = {
    disallowed: [],
    allowed: [],
  };
  const currentAgents: string[] = [];
  const lines = content.split(/\r?\n/);

  function compilePattern(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const regexStr = "^" + escaped.replace(/\*/g, ".*");
    return new RegExp(regexStr);
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const value = trimmed.slice(colonIdx + 1).trim();

    if (key === "user-agent") {
      currentAgents.push(value.toLowerCase());
    } else if (key === "disallow" || key === "allow") {
      const matchesUs = currentAgents.some(
        (agent) =>
          agent === "*" ||
          agent === userAgent.toLowerCase() ||
          userAgent.toLowerCase().includes(agent),
      );
      if (matchesUs && value) {
        const compiled = { pattern: value, regex: compilePattern(value) };
        if (key === "disallow") {
          rules.disallowed.push(compiled);
        } else {
          rules.allowed.push(compiled);
        }
      }
    }
  }

  return rules;
}

export function isPathAllowed(path: string, rules: RobotsRulesCompiled): boolean {
  let matchingDisallow: CompiledRule | null = null;
  let matchingAllow: CompiledRule | null = null;

  for (const rule of rules.disallowed) {
    if (rule.regex.test(path)) {
      if (
        !matchingDisallow ||
        rule.pattern.length > matchingDisallow.pattern.length
      ) {
        matchingDisallow = rule;
      }
    }
  }

  for (const rule of rules.allowed) {
    if (rule.regex.test(path)) {
      if (
        !matchingAllow ||
        rule.pattern.length > matchingAllow.pattern.length
      ) {
        matchingAllow = rule;
      }
    }
  }

  // RFC 9309 rules: longest match wins. If match lengths are equal, allow wins.
  if (matchingDisallow && matchingAllow) {
    if (matchingAllow.pattern.length >= matchingDisallow.pattern.length) {
      return true;
    }
    return false;
  }

  if (matchingDisallow) return false;
  return true;
}

export async function fetchRobotsTxtRules(
  baseUrl: string,
  getBrowser?: () => Promise<Browser>
): Promise<RobotsRulesCompiled> {
  const robotsUrl = `${baseUrl}/robots.txt`;
  let robotsContent = "";
  try {
    const response = await http.get(robotsUrl);
    robotsContent = response.data;
  } catch (error: any) {
    if (getBrowser) {
      console.warn(
        `HTTP failed to fetch robots.txt (${error.message}). Attempting Puppeteer fallback.`,
      );
      robotsContent = await fetchUrlWithPuppeteer(
        robotsUrl,
        getBrowser,
      ).catch(() => "");
    }
  }
  return parseRobotsTxt(robotsContent);
}
