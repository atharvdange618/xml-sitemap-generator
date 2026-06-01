import { http, fetchUrlWithPuppeteer } from "./httpClient.js";

export function parseRobotsTxt(content, userAgent = "XmlSitemapGenerator") {
  const rules = {
    disallowed: [],
    allowed: [],
  };
  let currentAgents = [];
  const lines = content.split(/\r?\n/);

  function compilePattern(pattern) {
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

export function isPathAllowed(path, rules) {
  let matchingDisallow = null;
  let matchingAllow = null;

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

export async function fetchRobotsTxtRules(baseUrl, getBrowser) {
  const robotsUrl = `${baseUrl}/robots.txt`;
  let robotsContent = "";
  try {
    const response = await http.get(robotsUrl);
    robotsContent = response.data;
  } catch (error) {
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
