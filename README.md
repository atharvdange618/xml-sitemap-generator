# XML Sitemap Generator

**The easiest way to generate perfect XML sitemaps for any website.**

Generate comprehensive, SEO-optimized XML sitemaps for your website with real-time progress tracking and intelligent crawling. This modern web application crawls your website, intelligently detects both SSR and CSR pages, respects robots.txt rules, and outputs a fully compliant XML sitemap ready for Google, Bing, and other search engines.

## ✨ Features

### 🚀 Core Capabilities

- **Intelligent Crawling** - Crawls up to 1000 pages per site (configurable from 10-1000).
- **Hybrid Rendering Support** - Seamlessly handles both Server-Side Rendered (SSR) and Client-Side Rendered (CSR) pages using Puppeteer.
- **Real-time Progress Tracking** - Watch your sitemap being built live with Server-Sent Events (SSE) streaming.
- **Concurrent Processing** - Batch crawling with configurable concurrency for optimal performance.
- **Smart Link Extraction** - Automatically extracts internal links while avoiding non-HTML resources.

### 🤖 Ethical & Compliant

- **robots.txt Compliance** - Automatically fetches and respects disallow rules from your site's robots.txt.
- **Priority-based Sitemap** - Assigns priority values based on page depth (1.0 for homepage, decreasing by 0.1 per level).
- **Standards Compliant** - Generates XML sitemaps fully compliant with the Sitemaps.org protocol.
- **lastmod Support** - Includes last-modified dates from HTTP headers or generation time.

### 🎨 Modern User Experience

- **Beautiful UI** - Sleek, responsive design with gradient backgrounds and smooth animations.
- **Live Feedback** - Real-time progress indicator showing current URL and page count.
- **Interactive Controls** - Slider for max pages with instant visual feedback.
- **Error Handling** - Clear, actionable error messages with visual indicators.
- **One-Click Download** - Instant sitemap.xml download with usage instructions.

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

1. Clone the repository:

   ```sh
   git clone https://github.com/atharvdange618/xml-sitemap-generator.git
   cd xml-sitemap-generator
   ```

2. Install dependencies:

   ```sh
   npm install
   ```

### Running Locally

Start the development server:

```sh
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

### Building for Production

```sh
npm run build
npm start
```

## Usage

### Quick Start

1. **Enter your website's URL** (e.g., `https://example.com`)
2. **Select the maximum number of pages** to crawl using the slider (10-1000)
3. **Click "Generate Sitemap"** and watch the real-time progress
4. **Download** the generated `sitemap.xml` file
5. **Deploy** the sitemap to your website's root directory
6. **Reference** it in your `robots.txt`:

   ```text
   Sitemap: https://example.com/sitemap.xml
   ```

### What You'll See

- **Live Progress**: Real-time updates showing which URL is being crawled
- **Page Count**: Running total of discovered pages
- **Success Message**: Download button with deployment instructions
- **Error Handling**: Clear feedback if something goes wrong

### Example Output

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2025-12-10T12:00:00.000Z</lastmod>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://example.com/about</loc>
    <lastmod>2025-12-10T11:30:00.000Z</lastmod>
    <priority>0.9</priority>
  </url>
  <!-- ... more URLs ... -->
</urlset>
```

## How It Works

### Architecture Overview

This application uses a modern **streaming architecture** with real-time updates:

1. **Frontend** ([`src/app/page.js`](src/app/page.js))

   - Beautiful, responsive UI built with React and Tailwind CSS
   - Establishes Server-Sent Events (SSE) connection for real-time updates
   - Displays live progress as pages are discovered and crawled
   - Handles sitemap download and provides usage instructions

2. **API Route** ([`src/app/api/generate-sitemap/route.js`](src/app/api/generate-sitemap/route.js))

   - Streams progress updates via SSE (text/event-stream)
   - Coordinates the crawling process
   - Returns the complete sitemap XML when finished

3. **Sitemap Generator** ([`src/utils/sitemapGenerator.js`](src/utils/sitemapGenerator.js))
   - **robots.txt Fetching**: Automatically retrieves and parses robots.txt rules
   - **Concurrent Crawling**: Processes multiple pages in parallel (configurable concurrency)
   - **Hybrid Rendering Detection**:
     - First attempts HTTP request with axios
     - Detects CSR using heuristics (script count, content ratio, framework markers)
     - Falls back to Puppeteer for CSR pages or when needed
   - **Smart Link Extraction**:
     - Resolves relative URLs
     - Filters same-domain links only
     - Avoids non-HTML resources (images, PDFs, etc.)
   - **Priority Calculation**: Assigns priority based on depth (1.0 - depth × 0.1)
   - **XML Generation**: Creates standards-compliant sitemap with loc, lastmod, and priority

## Configuration

### CSR Detection Thresholds

Fine-tune CSR detection in [`sitemapGenerator.js`](src/utils/sitemapGenerator.js):

```javascript
const config = {
  csr: {
    minimalContentLength: 200, // Minimum HTML length for valid content
    minimalChildNodes: 5, // Minimum body child nodes
    scriptCountThreshold: 10, // Script tag threshold
    contentScriptRatio: 1000, // HTML length per script ratio
    rootSelectors: ["#root", "#__next"], // CSR framework markers
  },
  puppeteer: {
    waitForSelectorsTimeout: 10000, // Selector wait timeout
    gotoTimeout: 60000, // Page load timeout
    waitUntil: "networkidle2", // Wait condition
  },
  logging: {
    verbose: true, // Enable detailed logs
  },
};
```

### Crawling Parameters

- **Max Pages**: Adjustable in UI (default: 100, range: 10-1000)
- **Concurrency**: Batch size for parallel crawling (default: 2 pages)
- **Depth-based Priority**: Homepage gets 1.0, decreasing by 0.1 per level

### robots.txt Compliance

The crawler automatically:

- Fetches `robots.txt` from the target domain
- Parses `User-agent: *` disallow rules
- Skips crawling disallowed paths
- Logs compliance status (verbose mode)

## Project Structure

```text
xml-sitemap-generator/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── generate-sitemap/
│   │   │       └── route.js          # SSE API endpoint for sitemap generation
│   │   ├── page.js                   # Main UI with real-time progress
│   │   ├── layout.js                 # App layout wrapper
│   │   └── globals.css               # Global styles
│   └── utils/
│       └── sitemapGenerator.js       # Core crawling engine with robots.txt support
├── public/                           # Static assets
├── package.json                      # Dependencies and scripts
├── next.config.mjs                   # Next.js configuration
├── tailwind.config.js                # Tailwind CSS configuration
└── README.md                         # This file
```

### Key Files

- **`route.js`**: Implements Server-Sent Events streaming for real-time updates
- **`page.js`**: React component with EventSource for live progress tracking
- **`sitemapGenerator.js`**: Contains all crawling logic, robots.txt parsing, and XML generation

## Dependencies

### Core Technologies

- **[Next.js](https://nextjs.org/)** `15.2.0` - React framework with App Router
- **[React](https://react.dev/)** `19.0.0` - UI library
- **[Tailwind CSS](https://tailwindcss.com/)** `4.x` - Utility-first CSS framework

### Crawling & Parsing

- **[axios](https://axios-http.com/)** `1.8.1` - HTTP client for fetching pages
- **[puppeteer](https://pptr.dev/)** `24.3.0` - Headless browser for CSR pages
- **[node-html-parser](https://github.com/taoqf/node-html-parser)** `7.0.1` - Fast HTML parsing

### Production Note

The application uses the standard `puppeteer` package which downloads Chromium automatically. For serverless deployments, consider switching to `puppeteer-core` with `@sparticuz/chromium-min`.

## License

MIT

## Acknowledgments

Built with ❤️ by [Atharv Dange](https://github.com/atharvdange618)

## Contributing

Contributions are welcome! Feel free to:

- Report bugs
- Suggest new features
- Submit pull requests
- Improve documentation

---

## Important Notes

### ⚠️ Ethical Use

- **Respect robots.txt**: This tool automatically honors disallow rules
- **Rate limiting**: Be mindful of server load when crawling large sites
- **Terms of Service**: Ensure you have permission to crawl third-party websites
- **Resource usage**: Large crawls may consume significant bandwidth and time

### 🚀 Performance Tips

1. **Start small**: Test with 10-50 pages before scaling up
2. **Monitor progress**: Use the real-time feedback to gauge completion time
3. **Adjust concurrency**: Modify `CONCURRENCY` in `sitemapGenerator.js` if needed
4. **Check logs**: Enable verbose logging for debugging crawling issues

### 🐛 Troubleshooting

**No pages found?**

- Check if the site blocks crawlers
- Verify the URL is accessible
- Look for robots.txt restrictions

**Slow crawling?**

- Reduce max pages for testing
- Check your internet connection
- Some sites may have rate limiting

**Error during generation?**

- Check browser console for details
- Verify the site is online and accessible
- Review server logs for specific errors

---

**Note:** Use responsibly. Crawling large or third-party sites may violate their terms of service or impact their performance. Always ensure you have the right to crawl a website before doing so.
