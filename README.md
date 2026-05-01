# XML Sitemap Generator

**The easiest way to generate perfect XML sitemaps for any website.**

Generate comprehensive, SEO-optimized XML sitemaps for your website with real-time progress tracking, intelligent crawling, and automatic sitemap discovery. This modern web application crawls your website, intelligently detects both SSR and CSR pages, respects robots.txt rules, and merges results from existing sitemaps to ensure 100% coverage.

## Features

### Core Capabilities

- **Intelligent Crawling** - Crawls up to 1000 pages per site (configurable from 10-1000).
- **Sitemap Discovery** - Automatically finds and parses existing sitemaps from `robots.txt` or common paths to ensure no page is missed.
- **Hybrid Rendering Support** - Seamlessly handles both Server-Side Rendered (SSR) and Client-Side Rendered (CSR) pages using a sophisticated heuristic detection and Puppeteer fallback.
- **Real-time Progress Tracking** - Watch your sitemap being built live with Server-Sent Events (SSE) streaming.
- **Concurrent Processing** - Batch crawling with high-performance concurrency (5 concurrent pages).
- **Smart Link Extraction** - Extracts internal links, canonicals, and alternate links while avoiding non-HTML resources.

### Ethical & Compliant

- **robots.txt Compliance** - Automatically fetches and rigorously respects disallow rules from your site's robots.txt.
- **Priority-based Sitemap** - Assigns priority values based on page depth (1.0 for homepage, decreasing by 0.1 per level).
- **Standards Compliant** - Generates XML sitemaps fully compliant with the Sitemaps.org protocol.
- **lastmod Support** - Includes last-modified dates from HTTP headers or page generation time.

### Insights & Logging

- **Detailed Statistics** - Provides a comprehensive breakdown of discovered pages, crawl depth, and errors.
- **JSON Logs** - Automatically saves generation stats to `public/logs/` for every run, including a `latest.json` for quick access.
- **Visual Summary** - Beautiful CLI-style box summary showing the health and outcome of every sitemap generation.

### Modern User Experience

- **Minimalist UI** - Sleek, dark-themed design built with Next.js and Tailwind CSS.
- **Live Feedback** - Real-time progress indicator showing current URL and running page count.
- **One-Click Download** - Instant sitemap.xml download with deployment instructions.

## Getting Started

### Prerequisites

- Node.js 18+
- [Bun](https://bun.sh/) (recommended) or npm

### Installation

1. Clone the repository:

   ```sh
   git clone https://github.com/atharvdange618/xml-sitemap-generator.git
   cd xml-sitemap-generator
   ```

2. Install dependencies:

   ```sh
   bun install
   # or
   npm install
   ```

### Running Locally

Start the development server:

```sh
bun dev
# or
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

### Building for Production

```sh
bun run build
bun start
```

## Usage

### Quick Start

1. **Enter your website's URL** (e.g., `https://example.com`)
2. **Select the maximum number of pages** to crawl using the slider (10-1000)
3. **Click "Generate Sitemap"** and watch the real-time progress
4. **Download** the generated `sitemap.xml` file
5. **Review Stats**: Check the console for a detailed breakdown or look at `public/logs/latest.json`.

### robots.txt Deployment

After downloading, deploy the sitemap to your website's root directory and reference it in your `robots.txt`:

```text
Sitemap: https://example.com/sitemap.xml
```

## How It Works

### Architecture Overview

This application uses a multi-stage **discovery and crawling engine**:

1. **Sitemap Discovery**: The engine first checks `robots.txt` for existing sitemaps and common locations. Found URLs are added to the initial set.
2. **Intelligent Crawling**:
   - **HTTP Phase**: First attempts a fast HTTP request to fetch content and extract links.
   - **CSR Detection**: Analyzes the HTML using heuristics (content-to-script ratio, presence of framework markers like `#root`, etc.) to determine if it's a CSR app.
   - **Puppeteer Phase**: If CSR is detected, it renders the page in a headless browser to extract dynamically generated links.
3. **Merging & Metadata**: Combines URLs from existing sitemaps and the fresh crawl, fetching `lastmod` and calculating `priority` for every unique page.
4. **Streaming**: Progress is streamed via Server-Sent Events (SSE) to provide instant feedback in the UI.

## Configuration

### CSR Detection Heuristics

Fine-tune how the engine detects CSR apps in [`sitemapGenerator.js`](src/utils/sitemapGenerator.js):

```javascript
const config = {
  csr: {
    minimalContentLength: 200, // Minimum HTML length for valid content
    minimalChildNodes: 5, // Minimum body child nodes
    scriptCountThreshold: 10, // Script tag threshold
    contentScriptRatio: 1000, // HTML length per script ratio
    rootSelectors: ["#root", "#__next"], // Framework markers
  },
  puppeteer: {
    waitForSelectorsTimeout: 10000,
    gotoTimeout: 60000,
    waitUntil: "networkidle2",
  },
};
```

### Stats Logging

Every run generates a JSON log in `public/logs/` containing:
- Duration and timestamp
- Breakdown of Sitemap-only vs. Crawled-only pages
- Depth distribution and max depth
- Error logs with URL and error message

## Project Structure

```text
xml-sitemap-generator/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── generate-sitemap/
│   │   │   │   └── route.js       # SSE streaming endpoint
│   │   │   └── logs/
│   │   │       └── route.js       # Stats retrieval endpoint
│   │   ├── page.js                # Main UI
│   │   └── docs/                  # App documentation
│   └── utils/
│       ├── sitemapGenerator.js    # Core discovery & crawling engine
│       └── statsLogger.js         # Logging & statistics logic
├── public/
│   └── logs/                      # Auto-generated JSON stats
└── README.md
```

## Dependencies

- **[Next.js](https://nextjs.org/)** `15.x` - React framework
- **[Puppeteer](https://pptr.dev/)** - Headless Chrome for CSR
- **[Axios](https://axios-http.com/)** - High-speed HTTP client
- **[node-html-parser](https://github.com/taoqf/node-html-parser)** - Fast HTML DOM parsing

## License

MIT
