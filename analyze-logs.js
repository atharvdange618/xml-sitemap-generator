const fs = require("fs");
const path = require("path");

const LOGS_DIR = path.join(__dirname, ".logs");

function parseDuration(durStr) {
  if (!durStr) return 0;
  const match = durStr.match(/(\d+)s/);
  return match ? parseInt(match[1], 10) : 0;
}

function loadLogs() {
  const files = fs
    .readdirSync(LOGS_DIR)
    .filter(
      (f) =>
        f.endsWith(".json") && f !== "latest.json" && f !== "crawl_cache.json",
    );
  const logs = [];
  for (const file of files) {
    try {
      const content = JSON.parse(
        fs.readFileSync(path.join(LOGS_DIR, file), "utf-8"),
      );
      logs.push({ file, ...content });
    } catch (e) {
      console.error(`Failed to parse ${file}:`, e.message);
    }
  }
  return logs;
}

function classifyResult(log) {
  const stats = log.statistics || {};
  const finalTotal = stats.finalSitemapTotal ?? 0;
  const pagesFound = stats.existingSitemap?.pagesFound ?? 0;
  const pagesDiscovered = stats.crawling?.pagesDiscovered ?? 0;
  const errors = log.errors?.count ?? 0;
  const duration = parseDuration(log.duration);

  if (finalTotal === 0 && pagesFound === 0 && pagesDiscovered === 0) {
    return "COMPLETE_FAILURE";
  }
  if (finalTotal === 0 && (pagesFound > 0 || pagesDiscovered > 0)) {
    return "DROPPED_ALL";
  }
  if (finalTotal > 0 && finalTotal < Math.max(pagesFound, pagesDiscovered, 1)) {
    return "PARTIAL";
  }
  if (finalTotal > 0 && errors > 0) {
    return "PARTIAL_WITH_ERRORS";
  }
  if (finalTotal > 0) {
    return "SUCCESS";
  }
  return "UNKNOWN";
}

function analyzeLogs() {
  const logs = loadLogs();

  const totalLogs = logs.length;
  const results = {
    COMPLETE_FAILURE: [],
    DROPPED_ALL: [],
    PARTIAL: [],
    PARTIAL_WITH_ERRORS: [],
    SUCCESS: [],
    UNKNOWN: [],
  };

  let totalDuration = 0;
  let totalPagesCrawled = 0;
  let totalFinalSitemap = 0;
  let totalErrors = 0;

  for (const log of logs) {
    const classification = classifyResult(log);
    results[classification].push(log);

    totalDuration += parseDuration(log.duration);
    totalPagesCrawled += log.statistics?.crawling?.pagesDiscovered ?? 0;
    totalFinalSitemap += log.statistics?.finalSitemapTotal ?? 0;
    totalErrors += log.errors?.count ?? 0;
  }

  const report = [];
  report.push(
    "╔══════════════════════════════════════════════════════════════════╗",
  );
  report.push(
    "║           PRODUCTION LOGS ANALYSIS REPORT                        ║",
  );
  report.push(
    "╚══════════════════════════════════════════════════════════════════╝",
  );
  report.push("");

  report.push("📊 OVERALL STATISTICS");
  report.push(
    "─────────────────────────────────────────────────────────────────",
  );
  report.push(`  Total crawls analyzed:     ${totalLogs}`);
  report.push(
    `  Total duration:            ${totalDuration}s (avg ${(totalDuration / totalLogs).toFixed(1)}s)`,
  );
  report.push(`  Total pages discovered:    ${totalPagesCrawled}`);
  report.push(`  Total pages in sitemaps:   ${totalFinalSitemap}`);
  report.push(`  Total errors logged:       ${totalErrors}`);
  report.push("");

  report.push("📈 RESULT BREAKDOWN");
  report.push(
    "─────────────────────────────────────────────────────────────────",
  );
  report.push(`  ✅ SUCCESS:              ${results.SUCCESS.length} sites`);
  report.push(
    `  ⚠️  PARTIAL:               ${results.PARTIAL.length + results.PARTIAL_WITH_ERRORS.length} sites`,
  );
  report.push(
    `  ❌ COMPLETE FAILURE:      ${results.COMPLETE_FAILURE.length} sites`,
  );
  report.push(
    `  🚫 DROPPED ALL:           ${results.DROPPED_ALL.length} sites`,
  );
  report.push("");

  report.push(
    "═══════════════════════════════════════════════════════════════════",
  );
  report.push("❌ COMPLETE FAILURES (0 pages found, 0 discovered, 0 final)");
  report.push(
    "═══════════════════════════════════════════════════════════════════",
  );
  if (results.COMPLETE_FAILURE.length === 0) {
    report.push("  None");
  } else {
    for (const log of results.COMPLETE_FAILURE) {
      report.push(`  • ${log.websiteUrl}`);
      report.push(`    File: ${log.file}`);
      report.push(
        `    Duration: ${log.duration}, Errors: ${log.errors?.count ?? 0}, MaxDepth: ${log.crawlDepth?.maxDepth ?? 0}`,
      );
      report.push(
        `    robots.txt found: ${log.robotsTxt?.hadRobotsTxt ? "Yes" : "No"}`,
      );
      report.push("");
    }
  }

  report.push(
    "═══════════════════════════════════════════════════════════════════",
  );
  report.push("🚫 DROPPED ALL (pages found/discovered but final sitemap = 0)");
  report.push(
    "═══════════════════════════════════════════════════════════════════",
  );
  if (results.DROPPED_ALL.length === 0) {
    report.push("  None");
  } else {
    for (const log of results.DROPPED_ALL) {
      const stats = log.statistics || {};
      report.push(`  • ${log.websiteUrl}`);
      report.push(`    File: ${log.file}`);
      report.push(
        `    Pages in existing sitemap: ${stats.existingSitemap?.pagesFound ?? 0}`,
      );
      report.push(
        `    Pages discovered crawling: ${stats.crawling?.pagesDiscovered ?? 0}`,
      );
      report.push(
        `    Duration: ${log.duration}, Errors: ${log.errors?.count ?? 0}`,
      );
      report.push("");
    }
  }

  report.push(
    "═══════════════════════════════════════════════════════════════════",
  );
  report.push("⚠️ PARTIAL RESULTS (some pages made it to final sitemap)");
  report.push(
    "═══════════════════════════════════════════════════════════════════",
  );
  const partials = [...results.PARTIAL, ...results.PARTIAL_WITH_ERRORS];
  if (partials.length === 0) {
    report.push("  None");
  } else {
    for (const log of partials) {
      const stats = log.statistics || {};
      report.push(`  • ${log.websiteUrl}`);
      report.push(`    File: ${log.file}`);
      report.push(
        `    Existing sitemap: ${stats.existingSitemap?.pagesFound ?? 0} (onlyInSitemap: ${stats.existingSitemap?.onlyInSitemap ?? 0})`,
      );
      report.push(
        `    Discovered crawling: ${stats.crawling?.pagesDiscovered ?? 0} (onlyFromCrawling: ${stats.crawling?.onlyFromCrawling ?? 0})`,
      );
      report.push(
        `    Overlap: ${stats.overlap ?? 0}, Final total: ${stats.finalSitemapTotal ?? 0}`,
      );
      report.push(
        `    Duration: ${log.duration}, Errors: ${log.errors?.count ?? 0}, MaxDepth: ${log.crawlDepth?.maxDepth ?? 0}`,
      );
      report.push("");
    }
  }

  report.push(
    "═══════════════════════════════════════════════════════════════════",
  );
  report.push("✅ SUCCESSES");
  report.push(
    "═══════════════════════════════════════════════════════════════════",
  );
  if (results.SUCCESS.length === 0) {
    report.push("  None");
  } else {
    for (const log of results.SUCCESS) {
      const stats = log.statistics || {};
      report.push(`  • ${log.websiteUrl}`);
      report.push(`    File: ${log.file}`);
      report.push(
        `    Existing sitemap: ${stats.existingSitemap?.pagesFound ?? 0}, Discovered: ${stats.crawling?.pagesDiscovered ?? 0}, Final: ${stats.finalSitemapTotal ?? 0}`,
      );
      report.push(
        `    Duration: ${log.duration}, MaxDepth: ${log.crawlDepth?.maxDepth ?? 0}`,
      );
      report.push("");
    }
  }

  // Failure analysis
  report.push(
    "═══════════════════════════════════════════════════════════════════",
  );
  report.push("🔍 FAILURE PATTERN ANALYSIS");
  report.push(
    "═══════════════════════════════════════════════════════════════════",
  );

  const failures = [...results.COMPLETE_FAILURE, ...results.DROPPED_ALL];
  const durations = failures.map((l) => parseDuration(l.duration));
  const avgFailDuration = durations.length
    ? (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1)
    : 0;

  report.push(`  Average failure duration: ${avgFailDuration}s`);
  report.push(
    `  Failures with maxDepth=0: ${failures.filter((l) => (l.crawlDepth?.maxDepth ?? 0) === 0).length}/${failures.length}`,
  );
  report.push(
    `  Failures with no robots.txt: ${failures.filter((l) => !l.robotsTxt?.hadRobotsTxt).length}/${failures.length}`,
  );
  report.push(
    `  Failures with errors logged: ${failures.filter((l) => (l.errors?.count ?? 0) > 0).length}/${failures.length}`,
  );
  report.push("");

  // Platform guessing based on domain patterns
  report.push("  Platform/hosting guesses from domains:");
  const platformGuesses = {};
  for (const log of failures) {
    const url = log.websiteUrl || "";
    let platform = "Unknown/generic";
    if (url.includes("vercel.app")) platform = "Vercel";
    else if (url.includes("workers.dev")) platform = "Cloudflare Workers";
    else if (url.includes("netlify.app")) platform = "Netlify";
    else if (url.includes("github.io")) platform = "GitHub Pages";
    else if (url.includes("pages.dev")) platform = "Cloudflare Pages";
    else if (url.includes("firebaseapp.com")) platform = "Firebase";
    else if (url.includes("herokuapp.com")) platform = "Heroku";
    else if (url.includes("surge.sh")) platform = "Surge";
    else if (url.includes("render.com")) platform = "Render";
    else if (url.includes("railway.app")) platform = "Railway";
    else if (url.includes("aws")) platform = "AWS";

    if (!platformGuesses[platform]) platformGuesses[platform] = [];
    platformGuesses[platform].push(url);
  }
  for (const [platform, urls] of Object.entries(platformGuesses)) {
    report.push(`    ${platform}: ${urls.length} site(s)`);
    for (const u of urls) report.push(`      - ${u}`);
  }

  report.push("");
  report.push(
    "═══════════════════════════════════════════════════════════════════",
  );
  report.push("👤 PUNYANSH SINGLA ANALYSIS");
  report.push(
    "═══════════════════════════════════════════════════════════════════",
  );

  const punyanshLogs = logs.filter((l) => {
    const url = (l.websiteUrl || "").toLowerCase();
    return url.includes("punyansh") || url.includes("punyanshsingla");
  });

  report.push(
    `  Found ${punyanshLogs.length} log entries for Punyansh's sites:`,
  );
  for (const log of punyanshLogs) {
    const stats = log.statistics || {};
    const cls = classifyResult(log);
    report.push(`  • ${log.websiteUrl} [${cls}]`);
    report.push(`    Timestamp: ${log.timestamp}, Duration: ${log.duration}`);
    report.push(
      `    Pages found: ${stats.existingSitemap?.pagesFound ?? 0}, Discovered: ${stats.crawling?.pagesDiscovered ?? 0}, Final: ${stats.finalSitemapTotal ?? 0}`,
    );
    report.push("");
  }

  // Find logs close in time to Punyansh's attempts
  const punyanshTimestamps = punyanshLogs
    .map((l) => new Date(l.timestamp).getTime())
    .sort((a, b) => a - b);
  if (punyanshTimestamps.length > 0) {
    const lastPunyanshTime = Math.max(...punyanshTimestamps);
    // Look for logs within 1 hour before and after
    const nearbyLogs = logs
      .filter((l) => {
        const t = new Date(l.timestamp).getTime();
        const url = (l.websiteUrl || "").toLowerCase();
        return (
          Math.abs(t - lastPunyanshTime) < 60 * 60 * 1000 &&
          !url.includes("punyansh")
        );
      })
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

    report.push(
      `  Sites tried within 1 hour of Punyansh's last attempt (${new Date(lastPunyanshTime).toISOString()}):`,
    );
    for (const log of nearbyLogs) {
      const cls = classifyResult(log);
      report.push(`    • ${log.websiteUrl} [${cls}] at ${log.timestamp}`);
    }
    report.push("");
  }

  // All failures sorted by timestamp to see clusters
  report.push(
    "═══════════════════════════════════════════════════════════════════",
  );
  report.push("📅 ALL FAILURES CHRONOLOGICALLY");
  report.push(
    "═══════════════════════════════════════════════════════════════════",
  );
  const allFailures = [
    ...results.COMPLETE_FAILURE,
    ...results.DROPPED_ALL,
  ].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  for (const log of allFailures) {
    report.push(
      `  ${log.timestamp}  ${log.websiteUrl.padEnd(45)}  ${log.duration.padStart(5)}  ${(log.statistics?.finalSitemapTotal ?? 0).toString().padStart(3)} pages`,
    );
  }

  report.push("");
  report.push(
    "═══════════════════════════════════════════════════════════════════",
  );
  report.push("💡 ROOT CAUSE HYPOTHESES");
  report.push(
    "═══════════════════════════════════════════════════════════════════",
  );
  report.push("");
  report.push("1. CSR (Client-Side Rendering) Detection Issues");
  report.push(
    "   - Sites with 0 pages discovered may be React/Next.js SPA apps",
  );
  report.push(
    "   - The crawler's detectCSR() might incorrectly classify SSR sites as CSR",
  );
  report.push(
    "   - Or Puppeteer fallback might be failing (timeout, crash, etc.)",
  );
  report.push("");
  report.push("2. robots.txt / Blocking");
  report.push(
    `   - ${failures.filter((l) => !l.robotsTxt?.hadRobotsTxt).length}/${failures.length} failing sites had no robots.txt`,
  );
  report.push(
    "   - Some hosts may block unknown user-agents at the WAF/CDN level",
  );
  report.push("");
  report.push("3. Network/Hosting Platform Blocks");
  report.push(
    "   - Vercel, Cloudflare Workers, and other edge platforms may rate-limit",
  );
  report.push(
    "   - Very short durations (1-4s) suggest immediate failure, not timeout",
  );
  report.push(
    "   - Could be blocked by bot protection (Cloudflare challenges, etc.)",
  );
  report.push("");
  report.push("4. Canonical / Redirect Issues");
  report.push("   - The crawler drops pages when canonical != current URL");
  report.push(
    "   - www vs non-www redirects could cause all pages to be discarded",
  );
  report.push(
    "   - Punyansh's punyanshsingla.com had 18 pages found but final=0",
  );
  report.push(
    "     This suggests all 18 were dropped, likely due to canonical mismatch",
  );
  report.push("");
  report.push("5. Sitemap Discovery vs Crawling Gap");
  report.push(
    "   - Some sites have pages in existing sitemap but crawler finds 0 new ones",
  );
  report.push(
    "   - The merge logic may be discarding sitemap-only pages incorrectly",
  );
  report.push("");

  return report.join("\n");
}

const report = analyzeLogs();
console.log(report);

// Save report
const reportPath = path.join(__dirname, "logs-analysis-report.txt");
fs.writeFileSync(reportPath, report, "utf-8");
console.log(`\n\n📄 Full report saved to: ${reportPath}`);
