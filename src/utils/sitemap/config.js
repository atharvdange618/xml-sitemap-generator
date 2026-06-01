export const config = {
  csr: {
    minimalContentLength: 200, // Minimum HTML length to consider as valid content
    minimalChildNodes: 5, // Minimum number of child nodes in <body>
    scriptCountThreshold: 10, // Threshold for number of <script> tags
    contentScriptRatio: 1000, // Minimum ratio of HTML length per script tag
    rootSelectors: ["#root", "#__next", "#app", "#__nuxt", "[ng-version]"], // Markers for typical CSR frameworks
  },
  puppeteer: {
    waitForSelectorsTimeout: 8000, // Timeout waiting for critical selectors
    gotoTimeout: 15000, // Timeout for page.goto
    waitUntil: "domcontentloaded", // Wait strategy for modern pages
  },
  logging: {
    verbose: true,
  },
  maxDepth: 10, // Configurable crawl depth limit
  concurrency: 5, // Concurrent workers
};
