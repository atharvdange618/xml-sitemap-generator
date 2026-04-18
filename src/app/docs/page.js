import Link from "next/link";

export default function Docs() {
  return (
    <div className="min-h-screen bg-neutral-950">
      <nav className="border-b border-neutral-800">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="text-xl font-medium text-neutral-100">
            Sitemap Generator
          </Link>
          <Link href="/docs" className="text-sm text-neutral-100">
            Documentation
          </Link>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-16">
        <div className="prose prose-gray max-w-none">
          <h1 className="text-4xl font-light text-neutral-100 mb-4">
            Documentation
          </h1>
          <p className="text-lg text-neutral-400 mb-12">
            Understanding how the sitemap generator works under the hood
          </p>

          <section className="mb-16">
            <h2 className="text-2xl font-medium text-neutral-100 mb-4 border-b border-neutral-800 pb-2">
              Overview
            </h2>
            <p className="text-neutral-300 leading-relaxed mb-4">
              This sitemap generator intelligently crawls websites to discover
              all accessible pages and generates a standards-compliant XML
              sitemap. It&apos;s designed to handle both traditional server-side
              rendered (SSR) pages and modern client-side rendered (CSR)
              applications like React, Vue, and Angular.
            </p>
            <p className="text-neutral-300 leading-relaxed">
              The generator uses a hybrid approach: it first attempts to extract
              links using simple HTTP requests and HTML parsing. If it detects a
              CSR application, it automatically falls back to Puppeteer for
              JavaScript rendering.
            </p>
          </section>

          <section className="mb-16">
            <h2 className="text-2xl font-medium text-neutral-100 mb-4 border-b border-neutral-800 pb-2">
              Algorithm Flow
            </h2>
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 space-y-4">
              <div className="flex items-start">
                <div className="shrink-0 bg-neutral-100 text-neutral-950 rounded-full w-8 h-8 flex items-center justify-center text-sm font-medium">
                  1
                </div>
                <div className="ml-4">
                  <h3 className="text-sm font-medium text-neutral-100 mb-1">
                    Sitemap Discovery
                  </h3>
                  <p className="text-sm text-neutral-400">
                    Check robots.txt for existing sitemaps and common sitemap
                    paths
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="shrink-0 bg-neutral-100 text-neutral-950 rounded-full w-8 h-8 flex items-center justify-center text-sm font-medium">
                  2
                </div>
                <div className="ml-4">
                  <h3 className="text-sm font-medium text-neutral-100 mb-1">
                    Initialize Crawl Queue
                  </h3>
                  <p className="text-sm text-neutral-400">
                    Start with base URL and any discovered sitemap URLs
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="shrink-0 bg-neutral-100 text-neutral-950 rounded-full w-8 h-8 flex items-center justify-center text-sm font-medium">
                  3
                </div>
                <div className="ml-4">
                  <h3 className="text-sm font-medium text-neutral-100 mb-1">
                    Concurrent Crawling
                  </h3>
                  <p className="text-sm text-neutral-400">
                    Process up to 5 URLs simultaneously using breadth-first
                    search
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="shrink-0 bg-neutral-100 text-neutral-950 rounded-full w-8 h-8 flex items-center justify-center text-sm font-medium">
                  4
                </div>
                <div className="ml-4">
                  <h3 className="text-sm font-medium text-neutral-100 mb-1">
                    CSR Detection
                  </h3>
                  <p className="text-sm text-neutral-400">
                    Analyze HTML structure to determine if page is client-side
                    rendered
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="shrink-0 bg-neutral-100 text-neutral-950 rounded-full w-8 h-8 flex items-center justify-center text-sm font-medium">
                  5
                </div>
                <div className="ml-4">
                  <h3 className="text-sm font-medium text-neutral-100 mb-1">
                    Link Extraction
                  </h3>
                  <p className="text-sm text-neutral-400">
                    Extract links from HTML or use Puppeteer if CSR detected
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="shrink-0 bg-neutral-100 text-neutral-950 rounded-full w-8 h-8 flex items-center justify-center text-sm font-medium">
                  6
                </div>
                <div className="ml-4">
                  <h3 className="text-sm font-medium text-neutral-100 mb-1">
                    Generate Sitemap
                  </h3>
                  <p className="text-sm text-neutral-400">
                    Create XML with URLs, priorities, and last modification
                    dates
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-16">
            <h2 className="text-2xl font-medium text-neutral-100 mb-4 border-b border-neutral-800 pb-2">
              Client-Side Rendering Detection
            </h2>
            <p className="text-neutral-300 leading-relaxed mb-4">
              The CSR detection algorithm analyzes several signals to determine
              if a page requires JavaScript execution to render its content:
            </p>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 mb-4">
              <h3 className="text-sm font-medium text-neutral-100 mb-3">
                Detection Criteria
              </h3>
              <ul className="space-y-2">
                <li className="flex items-start text-sm text-neutral-300">
                  <span className="mr-2">•</span>
                  <span>
                    <strong>Short HTML:</strong> Less than 200 characters
                    suggests minimal initial content
                  </span>
                </li>
                <li className="flex items-start text-sm text-neutral-300">
                  <span className="mr-2">•</span>
                  <span>
                    <strong>Empty Body:</strong> Less than 5 child nodes in the
                    body element
                  </span>
                </li>
                <li className="flex items-start text-sm text-neutral-300">
                  <span className="mr-2">•</span>
                  <span>
                    <strong>Framework Markers:</strong> Presence of #root or
                    #__next elements
                  </span>
                </li>
                <li className="flex items-start text-sm text-neutral-300">
                  <span className="mr-2">•</span>
                  <span>
                    <strong>Script Heavy:</strong> More than 10 script tags with
                    low content-to-script ratio
                  </span>
                </li>
                <li className="flex items-start text-sm text-neutral-300">
                  <span className="mr-2">•</span>
                  <span>
                    <strong>Loading Indicators:</strong> Text like
                    &quot;loading&quot; or &quot;spinner&quot; in the initial
                    HTML
                  </span>
                </li>
              </ul>
            </div>

            <div className="bg-neutral-900 text-neutral-100 rounded-lg p-4 overflow-x-auto">
              <pre className="text-xs font-mono">
                {`function detectCSR(html, root, config) {
  const body = root.querySelector("body");
  const bodyChildCount = body ? body.childNodes.length : 0;

  // Check various CSR indicators
  const isShortHtml = html.length < 200;
  const hasEmptyBody = bodyChildCount < 5;
  const hasRootDiv = ["#root", "#__next"].some(
    (selector) => root.querySelector(selector) !== null
  );
  const hasManyScripts = scriptCount > 10;
  const lowContentRatio = (html.length / scriptCount) < 1000;

  return (
    isShortHtml ||
    (hasRootDiv && hasEmptyBody) ||
    (hasEmptyBody && hasManyScripts) ||
    (lowContentRatio && hasRootDiv)
  );
}`}
              </pre>
            </div>
          </section>

          <section className="mb-16">
            <h2 className="text-2xl font-medium text-neutral-100 mb-4 border-b border-neutral-800 pb-2">
              Crawling Strategy
            </h2>
            <p className="text-neutral-300 leading-relaxed mb-4">
              The crawler uses a breadth-first search (BFS) algorithm with
              concurrent processing to efficiently discover pages:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-neutral-100 mb-2">
                  Concurrency
                </h3>
                <p className="text-sm text-neutral-400">
                  Processes up to 5 URLs simultaneously to maximize throughput
                  while being respectful to the target server.
                </p>
              </div>

              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-neutral-100 mb-2">
                  Depth Tracking
                </h3>
                <p className="text-sm text-neutral-400">
                  Tracks link depth from the homepage to calculate priority
                  scores and understand site structure.
                </p>
              </div>

              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-neutral-100 mb-2">
                  Deduplication
                </h3>
                <p className="text-sm text-neutral-400">
                  Uses a visited set to prevent crawling the same URL multiple
                  times, normalizing URLs by removing query strings and
                  fragments.
                </p>
              </div>

              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-neutral-100 mb-2">
                  Scope Control
                </h3>
                <p className="text-sm text-neutral-400">
                  Only crawls URLs within the same hostname, preventing external
                  link following and respecting robots.txt disallow rules.
                </p>
              </div>
            </div>
          </section>

          <section className="mb-16">
            <h2 className="text-2xl font-medium text-neutral-100 mb-4 border-b border-neutral-800 pb-2">
              Priority Calculation
            </h2>
            <p className="text-neutral-300 leading-relaxed mb-4">
              Each URL in the sitemap is assigned a priority value between 0.1
              and 1.0 based on its depth from the homepage:
            </p>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="flex justify-between items-center py-2 border-b border-neutral-800">
                  <span className="text-sm text-neutral-300">
                    Homepage (depth 0)
                  </span>
                  <code className="text-sm font-mono bg-neutral-900 text-white px-2 py-1 rounded">
                    1.0
                  </code>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-neutral-800">
                  <span className="text-sm text-neutral-300">
                    First level (depth 1)
                  </span>
                  <code className="text-sm font-mono bg-neutral-900 text-white px-2 py-1 rounded">
                    0.9
                  </code>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-neutral-800">
                  <span className="text-sm text-neutral-300">
                    Second level (depth 2)
                  </span>
                  <code className="text-sm font-mono bg-neutral-900 text-white px-2 py-1 rounded">
                    0.8
                  </code>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-neutral-800">
                  <span className="text-sm text-neutral-300">
                    Deep pages (depth 9+)
                  </span>
                  <code className="text-sm font-mono bg-neutral-900 text-white px-2 py-1 rounded">
                    0.1
                  </code>
                </div>
              </div>

              <div className="bg-neutral-900 text-neutral-100 rounded p-3">
                <code className="text-xs font-mono">
                  priority = Math.max(0.1, 1.0 - depth * 0.1)
                </code>
              </div>
            </div>
          </section>

          <section className="mb-16">
            <h2 className="text-2xl font-medium text-neutral-100 mb-4 border-b border-neutral-800 pb-2">
              robots.txt Handling
            </h2>
            <p className="text-neutral-300 leading-relaxed mb-4">
              The generator respects robots.txt directives to ensure ethical
              crawling:
            </p>

            <div className="space-y-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-neutral-100 mb-2">
                  Sitemap Discovery
                </h3>
                <p className="text-sm text-neutral-400 mb-2">
                  Parses robots.txt for existing sitemap declarations and
                  prioritizes them for crawling.
                </p>
                <div className="bg-neutral-900 border border-neutral-800 rounded p-2 font-mono text-xs text-neutral-300">
                  Sitemap: https://example.com/sitemap.xml
                </div>
              </div>

              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-neutral-100 mb-2">
                  Disallow Rules
                </h3>
                <p className="text-sm text-neutral-400 mb-2">
                  Respects Disallow directives by checking URLs against
                  disallowed paths before adding them to the crawl queue.
                </p>
                <div className="bg-neutral-900 border border-neutral-800 rounded p-2 font-mono text-xs text-neutral-300">
                  Disallow: /admin/
                  <br />
                  Disallow: /private/
                </div>
              </div>
            </div>
          </section>

          <section className="mb-16">
            <h2 className="text-2xl font-medium text-neutral-100 mb-4 border-b border-neutral-800 pb-2">
              Puppeteer Fallback
            </h2>
            <p className="text-neutral-300 leading-relaxed mb-4">
              When CSR is detected, the generator uses Puppeteer to render the
              page and extract links from the fully rendered DOM:
            </p>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 space-y-3">
              <div className="flex items-start">
                <span className="text-neutral-100 font-medium text-sm mr-3">
                  1.
                </span>
                <div>
                  <p className="text-sm text-neutral-300">
                    <strong>Launch Browser:</strong> Starts a headless Chrome
                    instance shared across all CSR pages
                  </p>
                </div>
              </div>
              <div className="flex items-start">
                <span className="text-neutral-100 font-medium text-sm mr-3">
                  2.
                </span>
                <div>
                  <p className="text-sm text-neutral-300">
                    <strong>Navigate & Wait:</strong> Loads the page and waits
                    for networkidle2 (all network connections idle)
                  </p>
                </div>
              </div>
              <div className="flex items-start">
                <span className="text-neutral-100 font-medium text-sm mr-3">
                  3.
                </span>
                <div>
                  <p className="text-sm text-neutral-300">
                    <strong>Wait for Selectors:</strong> Waits up to 10 seconds
                    for critical selectors like anchor tags or framework root
                    elements
                  </p>
                </div>
              </div>
              <div className="flex items-start">
                <span className="text-neutral-100 font-medium text-sm mr-3">
                  4.
                </span>
                <div>
                  <p className="text-sm text-neutral-300">
                    <strong>Extract Links:</strong> Uses page.evaluate() to
                    query the DOM for all href attributes and
                    canonical/alternate links
                  </p>
                </div>
              </div>
              <div className="flex items-start">
                <span className="text-neutral-100 font-medium text-sm mr-3">
                  5.
                </span>
                <div>
                  <p className="text-sm text-neutral-300">
                    <strong>Cleanup:</strong> Closes the page context to free
                    resources while keeping the browser instance alive
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-16">
            <h2 className="text-2xl font-medium text-neutral-100 mb-4 border-b border-neutral-800 pb-2">
              XML Sitemap Generation
            </h2>
            <p className="text-neutral-300 leading-relaxed mb-4">
              The final sitemap follows the{" "}
              <a
                href="https://www.sitemaps.org/protocol.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-100 underline"
              >
                sitemaps.org protocol
              </a>{" "}
              specification:
            </p>

            <div className="bg-neutral-900 text-neutral-100 rounded-lg p-4 overflow-x-auto">
              <pre className="text-xs font-mono">
                {`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2026-04-18T12:00:00+00:00</lastmod>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://example.com/about</loc>
    <lastmod>2026-04-15T08:30:00+00:00</lastmod>
    <priority>0.9</priority>
  </url>
  <!-- Additional URLs... -->
</urlset>`}
              </pre>
            </div>
          </section>

          <section className="mb-16">
            <h2 className="text-2xl font-medium text-neutral-100 mb-4 border-b border-neutral-800 pb-2">
              Performance Considerations
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-neutral-100 mb-2">
                  Concurrent Requests
                </h3>
                <p className="text-sm text-neutral-400">
                  Limits concurrency to 5 to balance speed with server load
                </p>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-neutral-100 mb-2">
                  Shared Browser
                </h3>
                <p className="text-sm text-neutral-400">
                  Reuses single Puppeteer instance across all CSR pages
                </p>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-neutral-100 mb-2">
                  HTTP First
                </h3>
                <p className="text-sm text-neutral-400">
                  Attempts lightweight HTTP parsing before expensive Puppeteer
                  rendering
                </p>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-neutral-100 mb-2">
                  Stream Updates
                </h3>
                <p className="text-sm text-neutral-400">
                  Uses Server-Sent Events to provide real-time progress without
                  polling
                </p>
              </div>
            </div>
          </section>

          <section className="mb-16">
            <h2 className="text-2xl font-medium text-neutral-100 mb-4 border-b border-neutral-800 pb-2">
              Configuration
            </h2>
            <p className="text-neutral-300 leading-relaxed mb-4">
              The algorithm can be tuned using these configuration parameters:
            </p>

            <div className="bg-neutral-900 text-neutral-100 rounded-lg p-4 overflow-x-auto">
              <pre className="text-xs font-mono">
                {`const config = {
  csr: {
    minimalContentLength: 200,     // Min HTML length
    minimalChildNodes: 5,           // Min body children
    scriptCountThreshold: 10,       // Script tag threshold
    contentScriptRatio: 1000,       // Content/script ratio
    rootSelectors: ["#root", "#__next"]
  },
  puppeteer: {
    waitForSelectorsTimeout: 10000, // Selector wait time
    gotoTimeout: 60000,             // Page load timeout
    waitUntil: "networkidle2"       // Wait strategy
  },
  crawler: {
    concurrency: 5,                 // Parallel requests
    maxPages: 100                   // Maximum pages
  }
}`}
              </pre>
            </div>
          </section>

          <div className="pt-8 border-t border-neutral-800">
            <Link
              href="/"
              className="inline-flex items-center text-sm text-neutral-400 hover:text-neutral-100 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to generator
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-neutral-800 mt-16">
        <div className="max-w-4xl mx-auto px-4 py-8 text-center">
          <p className="text-sm text-neutral-500">
            Built with Next.js • Open Source • {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
}
