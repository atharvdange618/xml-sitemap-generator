# XML Sitemap Generator

**The easiest way to generate perfect, SEO-optimized XML sitemaps for any website.**

Generate comprehensive, SEO-optimized XML sitemaps for your website with real-time progress tracking, intelligent crawling, and automatic sitemap discovery. This modern web application crawls your website, intelligently detects both SSR and CSR pages, respects robots.txt rules, and merges results from existing sitemaps to ensure 100% coverage.

---

## Features

### Core Capabilities

- **Intelligent Crawling** - Crawls up to 1000 pages per site (configurable from 10-1000).
- **Sitemap Discovery** - Automatically finds and parses existing sitemaps from `robots.txt` or common paths to ensure no page is missed.
- **Hybrid Rendering Support** - Seamlessly handles both Server-Side Rendered (SSR) and Client-Side Rendered (CSR) pages using sophisticated heuristic detection and Puppeteer fallback.
- **Real-time Progress Tracking** - Watch your sitemap being built live with Server-Sent Events (SSE) streaming.
- **Concurrent Processing** - Batch crawling with high-performance concurrency (5 concurrent pages by default).
- **Smart Link Extraction** - Extracts internal links, canonicals, and alternate links while avoiding non-HTML resources.

### Ethical & Compliant

- **robots.txt Compliance** - Automatically fetches and rigorously respects disallow rules from your site's robots.txt based on RFC 9309 standards.
- **Priority-based Sitemap** - Assigns priority values based on page depth (1.0 for homepage, decreasing by 0.1 per level).
- **Standards Compliant** - Generates XML sitemaps fully compliant with the Sitemaps.org protocol.
- **lastmod Support** - Includes last-modified dates from HTTP headers or page generation time.

### Insights & Crawl History

- **Detailed Statistics** - Provides a comprehensive breakdown of discovered pages, crawl depth, and errors.
- **Crawl History Dashboard** - View details of your recent crawls directly in the UI dashboard, fetching logs dynamically.
- **JSON Logs** - Automatically saves generation stats to the `.logs/` directory for every run, including a `latest.json` for quick access.
- **Visual Summary** - Beautiful CLI-style box summary showing the health and outcome of every sitemap generation.

### Modern User Experience

- **Minimalist UI** - Sleek, dark-themed design built with Next.js and Tailwind CSS.
- **Live Feedback** - Real-time progress indicator showing current URL and running page count.
- **One-Click Download** - Instant sitemap.xml and compressed sitemap.xml.gz download with robots.txt deployment instructions.

---

## Technology Stack

- **[Next.js](https://nextjs.org/)** `16.x` - Web framework (App Router)
- **[TypeScript](https://www.typescriptlang.org/)** `6.x` - Type safety
- **[Puppeteer](https://pptr.dev/)** - Headless Chrome for CSR execution
- **[Axios](https://axios-http.com/)** - High-speed HTTP client with retry logic
- **[node-html-parser](https://github.com/taoqf/node-html-parser)** - Fast HTML DOM parsing
- **[Tailwind CSS](https://tailwindcss.com/)** `4.x` - Modern component styling
- **[Framer Motion](https://www.framer.com/motion/)** - Fluent animations & transitions

---

## Getting Started

### Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io/) (recommended)

### Installation

1. Clone the repository:

   ```sh
   git clone https://github.com/atharvdange618/xml-sitemap-generator.git
   cd xml-sitemap-generator
   ```

2. Install dependencies:

   ```sh
   pnpm install
   ```

### Running Locally

Start the development server:

```sh
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

### Building for Production

Compile and run type checks:

```sh
pnpm build
pnpm start
```

---

## How It Works

This application uses a multi-stage **discovery and crawling engine**:

1. **Sitemap Discovery**: The engine first checks `robots.txt` for existing sitemaps and common locations. Found URLs are added to the initial set.
2. **Intelligent Crawling**:
   - **HTTP Phase**: First attempts a fast HTTP request to fetch content and extract links.
   - **CSR Detection**: Analyzes the HTML using heuristics (content-to-script ratio, presence of framework markers like `#root`, `#app`, etc.) to determine if it's a Client-Side Rendered SPA.
   - **Puppeteer Phase**: If CSR is detected, it renders the page in a headless browser to extract dynamically generated links.
3. **Merging & Metadata**: Combines URLs from existing sitemaps and the fresh crawl, fetching `lastmod` and calculating `priority` for every unique page.
4. **Streaming**: Progress is streamed via Server-Sent Events (SSE) to provide instant feedback in the UI.

---

## Configuration

Fine-tune how the engine detects CSR apps and runs Puppeteer in [`src/utils/sitemap/config.ts`](src/utils/sitemap/config.ts):

```typescript
export const config: CrawlerConfig = {
  csr: {
    minimalContentLength: 200,
    minimalChildNodes: 5,
    scriptCountThreshold: 10,
    contentScriptRatio: 1000,
    rootSelectors: ["#root", "#__next", "#app", "#__nuxt", "[ng-version]"],
  },
  puppeteer: {
    waitForSelectorsTimeout: 8000,
    gotoTimeout: 15000,
    waitUntil: "domcontentloaded",
  },
  logging: {
    verbose: true,
  },
  maxDepth: 10,
  concurrency: 5,
};
```

---

## Project Structure

```text
xml-sitemap-generator/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── generate-sitemap/
│   │   │   │   └── route.ts       # SSE streaming endpoint (TS)
│   │   │   └── logs/
│   │   │       └── route.ts       # Stats retrieval endpoint (TS)
│   │   ├── layout.tsx             # Root layout (TSX)
│   │   ├── page.tsx               # Main UI & history log panel (TSX)
│   │   └── docs/
│   │       └── page.tsx           # App documentation page (TSX)
│   ├── types/
│   │   ├── declarations.d.ts      # Global types (CSS, modules)
│   │   └── sitemap.ts             # Shared sitemap/crawling interfaces
│   └── utils/
│       ├── sitemap/               # Crawler engine details (TS)
│       │   ├── cache.ts
│       │   ├── config.ts
│       │   ├── crawler.ts
│       │   ├── httpClient.ts
│       │   ├── index.ts
│       │   ├── parser.ts
│       │   ├── robots.ts
│       │   └── urlUtils.ts
│       ├── sitemapGenerator.ts    # Crawler entry point wrapper (TS)
│       └── statsLogger.ts         # Run logging & stats compiler (TS)
├── .logs/                         # Auto-generated JSON crawl logs
├── tsconfig.json                  # TS compiler config
└── README.md
```

---

## License

MIT
