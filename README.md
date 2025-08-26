# XML Sitemap Generator

Generate a comprehensive XML sitemap for your website to improve search engine visibility. This project crawls your website, detects both SSR and CSR pages, and outputs a fully compliant XML sitemap ready for use with Google and other search engines.

## Features

- **Crawls up to 1000 pages** per site (configurable).
- **Supports SSR and CSR** (Single Page Applications) using Puppeteer and Chromium.
- **Smart link extraction** and duplicate avoidance.
- **Configurable thresholds** for CSR detection.
- **Downloadable XML sitemap** ready for deployment.
- **Progress feedback and error handling** in the UI.

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

1. Enter your website's URL (e.g., `https://example.com`).
2. Select the maximum number of pages to crawl.
3. Click **Generate Sitemap**.
4. Download the generated `sitemap.xml` file and place it in your website's root directory.
5. Reference the sitemap in your `robots.txt`:

   ```text
   Sitemap: https://example.com/sitemap.xml
   ```

## How It Works

- The backend API ([`src/app/api/generate-sitemap/route.js`](src/app/api/generate-sitemap/route.js)) receives the URL and max pages.
- It uses [`createSitemap`](src/utils/sitemapGenerator.js) to crawl the site:
  - Fetches pages using HTTP and, if needed, headless Chromium via Puppeteer.
  - Extracts internal links, avoiding non-HTML resources.
  - Detects CSR/SSR using heuristics.
  - Generates a standards-compliant XML sitemap.
- The frontend ([`src/app/page.js`](src/app/page.js)) provides a user-friendly interface for input and downloading the sitemap.

## Configuration

- **CSR Detection**: Tuned via thresholds in [`sitemapGenerator.js`](src/utils/sitemapGenerator.js).
- **Max Pages**: Adjustable in the UI (default: 100, max: 1000).
- **Logging**: Verbose logging enabled by default for debugging.

## Project Structure

```text
src/
  app/
    api/generate-sitemap/route.js   # API route for sitemap generation
    page.js                         # Main UI page
    layout.js, globals.css          # App layout and styles
  utils/
    sitemapGenerator.js             # Core crawling and sitemap logic
public/                             # Static assets
```

## Dependencies

- [Next.js](https://nextjs.org/)
- [React](https://react.dev/)
- [axios](https://axios-http.com/)
- [puppeteer](https://pptr.dev/)
- [@sparticuz/chromium-min](https://github.com/sparticuz/chromium)
- [node-html-parser](https://github.com/taoqf/node-html-parser)
- [Tailwind CSS](https://tailwindcss.com/)

## License

MIT

---

**Note:** Use responsibly. Crawling large or third-party sites may violate their terms of service or impact their performance.
