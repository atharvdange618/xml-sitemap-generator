/* eslint-disable react/no-unescaped-entities */
"use client";

import { useState, useEffect, useRef } from "react";

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
        url
      )}&maxPages=${maxPages}`
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
                "An unknown error occurred during sitemap generation."
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 text-gray-800">
      {/* Hero Section */}
      <section className="relative py-20 md:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-100 to-indigo-100 opacity-50"></div>
        <div className="container mx-auto px-4 relative z-10 text-center">
          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-4 text-gray-900">
            The Easiest Way to Generate Perfect XML Sitemaps
          </h1>
          <p className="text-lg md:text-xl text-gray-700 max-w-3xl mx-auto mb-10">
            Boost your SEO by helping Google, Bing, and other search engines
            discover and index every page on your site even complex, dynamic
            ones.
          </p>

          <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 max-w-2xl mx-auto">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="website-url"
                  className="block text-left text-lg font-semibold text-gray-700 mb-2"
                >
                  Your Website URL
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-6 w-6 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101"
                      />
                    </svg>
                  </div>
                  <input
                    type="url"
                    id="website-url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                    className="w-full pl-12 pr-4 py-3 md:py-4 text-lg text-gray-800 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm transition"
                    placeholder="https://yourwebsite.com"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="max-pages"
                  className="block text-left text-lg font-semibold text-gray-700 mb-2"
                >
                  Max Pages to Crawl:{" "}
                  <span className="text-indigo-600">{maxPages}</span>
                </label>
                <input
                  type="range"
                  id="max-pages"
                  value={maxPages}
                  onChange={(e) => setMaxPages(Number(e.target.value))}
                  min="10"
                  max="1000"
                  step="10"
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 transition"
                />
                <p className="text-sm text-gray-500 mt-2 text-left">
                  Higher values will take longer but provide more complete
                  results.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 md:py-4 px-6 rounded-xl shadow-lg disabled:bg-indigo-400 transition transform hover:-translate-y-1 flex justify-center items-center text-lg"
              >
                {loading ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-3 h-6 w-6 text-white"
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
                    Generating Sitemap...
                  </>
                ) : (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-6 w-6 mr-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Generate Sitemap
                  </>
                )}
              </button>
            </form>

            {loading && (
              <div className="mt-8 p-4 border border-indigo-200 bg-indigo-50 rounded-lg shadow-inner">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm md:text-base font-semibold text-indigo-700">
                    Crawling in Progress...
                  </span>
                  <span className="text-sm md:text-base font-bold text-indigo-800">
                    {progress.count} Pages Found
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                  <div
                    className="bg-indigo-600 h-2.5 rounded-full animate-pulse"
                    style={{ width: "100%" }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600 truncate">
                  <span className="font-medium">Current URL:</span>{" "}
                  {progress.url}
                </p>
              </div>
            )}

            {error && (
              <div className="mt-8 bg-red-50 border-l-4 border-red-500 p-4 rounded-md shadow-md">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-6 w-6 text-red-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-base font-medium text-red-800">
                      Error
                    </h3>
                    <p className="text-sm text-red-700 mt-1">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {sitemapUrl && (
              <div className="mt-8 bg-green-50 rounded-lg p-6 shadow-md">
                <div className="flex items-center mb-4">
                  <div className="bg-green-500 rounded-full p-2 mr-3">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-6 w-6 text-white"
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
                  </div>
                  <h2 className="text-xl font-bold text-green-800">
                    Sitemap Generated Successfully!
                  </h2>
                </div>

                <div className="bg-white rounded-lg border border-green-200 p-4 mb-4 text-left">
                  <p className="text-gray-700 mb-2">
                    Your sitemap is ready to download. Place it in your
                    website's root directory and reference it in your{" "}
                    <code>robots.txt</code> file:
                  </p>
                  <div className="bg-gray-50 p-3 rounded font-mono text-sm text-gray-700 break-all">
                    Sitemap: {url.replace(/\/$/, "")}/sitemap.xml
                  </div>
                </div>

                <div className="flex justify-center">
                  <a
                    href={sitemapUrl}
                    download="sitemap.xml"
                    className="bg-green-600 hover:bg-green-700 text-white font-medium px-6 py-3 rounded-lg shadow-md inline-flex items-center transition transform hover:-translate-y-1"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 mr-2"
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
                    Download Sitemap XML
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-12 text-gray-900">
            Why Choose Our Sitemap Generator?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            <div className="flex flex-col items-center p-6 bg-blue-50 rounded-xl shadow-md transform hover:scale-105 transition-transform duration-300">
              <div className="bg-blue-200 rounded-full p-4 mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-10 w-10 text-blue-700"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3 text-gray-900">
                Full Compliance
              </h3>
              <p className="text-gray-700">
                Generates XML sitemaps fully compliant with Google's protocol,
                including <code>lastmod</code> and <code>priority</code>.
              </p>
            </div>

            <div className="flex flex-col items-center p-6 bg-purple-50 rounded-xl shadow-md transform hover:scale-105 transition-transform duration-300">
              <div className="bg-purple-200 rounded-full p-4 mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-10 w-10 text-purple-700"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3 text-gray-900">
                Handles Modern Sites
              </h3>
              <p className="text-gray-700">
                Intelligently detects and crawls both Server-Side Rendered (SSR)
                and Client-Side Rendered (CSR) pages using advanced techniques.
              </p>
            </div>

            <div className="flex flex-col items-center p-6 bg-green-50 rounded-xl shadow-md transform hover:scale-105 transition-transform duration-300">
              <div className="bg-green-200 rounded-full p-4 mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-10 w-10 text-green-700"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3 text-gray-900">
                Respects <code>robots.txt</code>
              </h3>
              <p className="text-gray-700">
                Be a good netizen. Our crawler automatically fetches and
                respects <code>robots.txt</code> rules, ensuring ethical
                crawling.
              </p>
            </div>

            <div className="flex flex-col items-center p-6 bg-yellow-50 rounded-xl shadow-md transform hover:scale-105 transition-transform duration-300">
              <div className="bg-yellow-200 rounded-full p-4 mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-10 w-10 text-yellow-700"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3 text-gray-900">
                Blazing Fast
              </h3>
              <p className="text-gray-700">
                Utilizes concurrent crawling to quickly discover pages, saving
                you valuable time.
              </p>
            </div>

            <div className="flex flex-col items-center p-6 bg-red-50 rounded-xl shadow-md transform hover:scale-105 transition-transform duration-300">
              <div className="bg-red-200 rounded-full p-4 mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-10 w-10 text-red-700"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3 text-gray-900">
                Real-time Feedback
              </h3>
              <p className="text-gray-700">
                Watch your sitemap being built live with real-time progress
                updates directly in your browser.
              </p>
            </div>

            <div className="flex flex-col items-center p-6 bg-indigo-50 rounded-xl shadow-md transform hover:scale-105 transition-transform duration-300">
              <div className="bg-indigo-200 rounded-full p-4 mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-10 w-10 text-indigo-700"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c1.657 0 3 .895 3 2s-1.343 2-3 2-3-.895-3-2 1.343-2 3-2zM12 21c-1.657 0-3-.895-3-2s1.343-2 3-2 3 .895 3 2-1.343 2-3 2zM12 3c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2-1.343-2-3-2zM12 15c-1.657 0-3-.895-3-2s1.343-2 3-2 3 .895 3 2-1.343 2-3 2z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3 text-gray-900">
                Easy to Use
              </h3>
              <p className="text-gray-700">
                A simple, intuitive interface makes generating complex sitemaps
                a breeze for anyone.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 md:py-24 bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-12 text-gray-900">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <div className="flex flex-col items-center p-6 bg-white rounded-xl shadow-md transform hover:scale-105 transition-transform duration-300">
              <div className="bg-indigo-100 rounded-full p-4 mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-10 w-10 text-indigo-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3 text-gray-900">
                1. Enter Your URL
              </h3>
              <p className="text-gray-700">
                Simply paste your website's address into the field above.
              </p>
            </div>
            <div className="flex flex-col items-center p-6 bg-white rounded-xl shadow-md transform hover:scale-105 transition-transform duration-300">
              <div className="bg-indigo-100 rounded-full p-4 mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-10 w-10 text-indigo-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3 text-gray-900">
                2. Our Smart Crawler Works
              </h3>
              <p className="text-gray-700">
                Our intelligent engine explores your site, respecting{" "}
                <code>robots.txt</code> and handling dynamic content.
              </p>
            </div>
            <div className="flex flex-col items-center p-6 bg-white rounded-xl shadow-md transform hover:scale-105 transition-transform duration-300">
              <div className="bg-indigo-100 rounded-full p-4 mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-10 w-10 text-indigo-600"
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
              </div>
              <h3 className="text-xl font-semibold mb-3 text-gray-900">
                3. Download Your Sitemap
              </h3>
              <p className="text-gray-700">
                Get your comprehensive XML sitemap ready for search engines.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm">
            &copy; {new Date().getFullYear()} XML Sitemap Generator. All rights
            reserved.
          </p>
          <p className="text-sm mt-2">
            Built with ❤️ by Atharv Dange. View on{" "}
            <a
              href="https://github.com/atharvdange618/xml-sitemap-generator"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 transition"
            >
              GitHub
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
