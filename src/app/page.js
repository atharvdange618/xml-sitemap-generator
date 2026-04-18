/* eslint-disable react/no-unescaped-entities */
"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

export default function Home() {
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(100);
  const [loading, setLoading] = useState(false);
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ url: "", count: 0 });

  const eventSourceRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSitemapUrl("");
    setProgress({ url: "Initializing...", count: 0 });

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(
      `/api/generate-sitemap?url=${encodeURIComponent(
        url,
      )}&maxPages=${maxPages}`,
    );
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case "progress":
            setProgress(data);
            break;
          case "done":
            const blob = new Blob([data.sitemap], { type: "application/xml" });
            const blobUrl = URL.createObjectURL(blob);
            setSitemapUrl(blobUrl);
            setLoading(false);
            eventSource.close();
            break;
          case "error":
            setError(
              data.message ||
                "An unknown error occurred during sitemap generation.",
            );
            setLoading(false);
            eventSource.close();
            break;
        }
      } catch (e) {
        console.error("Failed to parse message from server:", event.data);
      }
    };

    eventSource.onerror = (err) => {
      console.error("EventSource failed:", err);
      setError("Failed to connect to the server for live updates.");
      setLoading(false);
      eventSource.close();
    };
  };

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950">
      <nav className="border-b border-neutral-800">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="text-xl font-medium text-neutral-100">
            Sitemap Generator
          </Link>
          <Link
            href="/docs"
            className="text-sm text-neutral-400 hover:text-neutral-100 transition-colors"
          >
            Documentation
          </Link>
        </div>
      </nav>

      <section className="max-w-4xl mx-auto px-4 pt-20 pb-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-light text-neutral-100 mb-6 tracking-tight">
            Generate XML Sitemaps
          </h1>
          <p className="text-lg text-neutral-400 max-w-2xl mx-auto leading-relaxed">
            Simple, intelligent sitemap generation for modern websites. Handles
            SSR and CSR with ease.
          </p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-8 max-w-2xl mx-auto">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="website-url"
                className="block text-sm font-medium text-neutral-300 mb-2"
              >
                Website URL
              </label>
              <input
                type="url"
                id="website-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                className="w-full px-4 py-3 text-neutral-100 bg-neutral-950 border border-neutral-700 rounded-md focus:ring-1 focus:ring-neutral-500 focus:border-neutral-500 transition-colors placeholder:text-neutral-500"
                placeholder="https://example.com"
              />
            </div>

            <div>
              <label
                htmlFor="max-pages"
                className="block text-sm font-medium text-neutral-300 mb-2"
              >
                Maximum pages:{" "}
                <span className="text-neutral-100">{maxPages}</span>
              </label>
              <input
                type="range"
                id="max-pages"
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value))}
                min="10"
                max="1000"
                step="10"
                className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-neutral-100"
              />
              <p className="text-xs text-neutral-500 mt-2">
                Adjust based on your site size
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-neutral-100 hover:bg-neutral-200 text-neutral-950 font-medium py-3 px-6 rounded-md disabled:bg-neutral-700 disabled:text-neutral-500 transition-colors flex justify-center items-center"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Generating...
                </>
              ) : (
                "Generate Sitemap"
              )}
            </button>
          </form>

          {loading && (
            <div className="mt-6 p-4 border border-neutral-800 bg-neutral-950 rounded-md">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm text-neutral-400">Crawling</span>
                <span className="text-sm font-medium text-neutral-100">
                  {progress.count} pages
                </span>
              </div>
              <div className="w-full bg-neutral-800 rounded-full h-1 mb-3">
                <div
                  className="bg-neutral-100 h-1 rounded-full transition-all duration-300"
                  style={{ width: "100%" }}
                ></div>
              </div>
              {progress.url && (
                <div className="space-y-1">
                  <p className="text-xs text-neutral-500">
                    Currently crawling:
                  </p>
                  <p className="text-xs text-neutral-300 truncate font-mono">
                    {progress.url}
                  </p>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mt-6 bg-red-950/50 border border-red-900 p-4 rounded-md">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {sitemapUrl && (
            <div className="mt-6 bg-green-950/50 border border-green-900 rounded-md p-6">
              <div className="flex items-center mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-green-400 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <h3 className="text-sm font-medium text-green-400">
                  Sitemap generated successfully
                </h3>
              </div>

              <div className="bg-neutral-950 border border-green-900 rounded p-3 mb-4">
                <p className="text-sm text-neutral-300 mb-2">
                  Add to your{" "}
                  <code className="text-xs bg-neutral-900 px-1 py-0.5 rounded">
                    robots.txt
                  </code>
                  :
                </p>
                <div className="bg-neutral-900 p-2 rounded font-mono text-xs text-neutral-400">
                  Sitemap: {url.replace(/\/$/, "")}/sitemap.xml
                </div>
              </div>

              <a
                href={sitemapUrl}
                download="sitemap.xml"
                className="inline-flex items-center bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
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
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Download sitemap.xml
              </a>
            </div>
          )}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-16 border-t border-neutral-800">
        <div className="mb-12">
          <h2 className="text-3xl font-light text-neutral-100 mb-4">
            robots.txt Handling
          </h2>
          <p className="text-neutral-400 mb-8">
            The generator respects robots.txt directives to ensure ethical
            crawling:
          </p>

          <div className="space-y-8">
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
              <h3 className="text-lg font-medium text-neutral-100 mb-2">
                Sitemap Discovery
              </h3>
              <p className="text-sm text-neutral-400 mb-4 leading-relaxed">
                Parses robots.txt for existing sitemap declarations and
                prioritizes them for crawling.
              </p>
              <div className="bg-neutral-950 border border-neutral-800 rounded p-3">
                <code className="text-xs text-neutral-300 font-mono">
                  Sitemap: https://example.com/sitemap.xml
                </code>
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
              <h3 className="text-lg font-medium text-neutral-100 mb-2">
                Disallow Rules
              </h3>
              <p className="text-sm text-neutral-400 mb-4 leading-relaxed">
                Respects Disallow directives by checking URLs against disallowed
                paths before adding them to the crawl queue.
              </p>
              <div className="bg-neutral-950 border border-neutral-800 rounded p-3">
                <code className="text-xs text-neutral-300 font-mono whitespace-pre">
                  Disallow: /admin/{"\n"}Disallow: /private/
                </code>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-16 border-t border-neutral-800">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-sm font-medium text-neutral-100 mb-2">
              CSR Detection
            </h3>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Automatically detects client-side rendered applications and uses
              Puppeteer when needed.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-neutral-100 mb-2">
              Respects robots.txt
            </h3>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Follows robots.txt rules and existing sitemap references for
              ethical crawling.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-neutral-100 mb-2">
              Real-time Updates
            </h3>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Watch progress as pages are discovered with Server-Sent Events
              streaming.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-800 mt-16">
        <div className="max-w-4xl mx-auto px-4 py-8 text-center">
          <p className="text-sm text-neutral-600">
            Built with Next.js • Open Source • {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
}
