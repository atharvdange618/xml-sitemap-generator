/* eslint-disable react/no-unescaped-entities */
"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  FileText,
  Clock,
  Compass,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  Globe,
  CheckCircle2,
  History,
  ShieldAlert,
  Network,
  ArrowRight,
  RefreshCw,
  Layers,
  Terminal,
  Activity,
  Settings,
  Check,
  Code,
  Cpu,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { StatsJson } from "@/types/sitemap";

export default function Home() {
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(100);
  const [loading, setLoading] = useState(false);
  const [activeJobId, setActiveJobId] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ url: "", count: 0 });
  const [crawlLogs, setCrawlLogs] = useState<string[]>([]);
  const [stats, setStats] = useState<StatsJson | null>(null);
  const [history, setHistory] = useState<StatsJson[]>([]);
  const [selectedHistoryStats, setSelectedHistoryStats] =
    useState<StatsJson | null>(null);
  const [expandedErrors, setExpandedErrors] = useState(false);
  const [expandedRobots, setExpandedRobots] = useState(false);
  const [expandedDepth, setExpandedDepth] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [crawlLogs]);

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/logs?limit=5");
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error("Failed to fetch crawl history:", err);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setActiveJobId("");
    setStats(null);
    setSelectedHistoryStats(null);
    setProgress({ url: "Initializing...", count: 0 });
    setCrawlLogs([
      "[system] Contacting backend task runner...",
      "[system] Initializing request threads...",
    ]);

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const res = await fetch("/api/generate-sitemap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, maxPages }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to start crawler");
      }

      const { jobId } = await res.json();
      setActiveJobId(jobId);

      const eventSource = new EventSource(
        `/api/generate-sitemap/status?jobId=${encodeURIComponent(jobId)}`,
      );
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case "progress":
              setProgress(data);
              if (data.url) {
                setCrawlLogs((prev) => [
                  ...prev,
                  `[crawled] #${data.count} -> ${data.url}`,
                ]);
              }
              break;
            case "done":
              setStats(data.stats);
              setLoading(false);
              setCrawlLogs((prev) => [
                ...prev,
                `[system] Crawl completed successfully!`,
                `[system] Discovered ${data.stats?.statistics?.crawling?.pagesDiscovered ?? 0} pages.`,
              ]);
              eventSource.close();
              fetchHistory();

              setTimeout(() => {
                const el = document.getElementById("stats-report-container");
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }, 300);
              break;
            case "error":
              setError(
                data.message ||
                  "An unknown error occurred during sitemap generation.",
              );
              setCrawlLogs((prev) => [
                ...prev,
                `[error] Crawl failed: ${data.message || "Unknown error"}`,
              ]);
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
        setCrawlLogs((prev) => [
          ...prev,
          `[error] Lost connection to crawler stream.`,
        ]);
        setLoading(false);
        eventSource.close();
      };
    } catch (err: any) {
      setError(err.message || "An unknown error occurred.");
      setCrawlLogs((prev) => [
        ...prev,
        `[error] Failed to launch crawl job: ${err.message}`,
      ]);
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const renderStatsDashboard = (
    report: StatsJson | null,
    isHistory = false,
  ) => {
    if (!report) return null;

    const finalTotal = report.statistics?.finalSitemapTotal ?? 0;
    const duration = report.duration ?? "0s";
    const crawledPages = report.statistics?.crawling?.pagesDiscovered ?? 0;
    const overlap = report.statistics?.overlap ?? 0;
    const sitemapOnly = report.statistics?.existingSitemap?.onlyInSitemap ?? 0;
    const crawledOnly = report.statistics?.crawling?.onlyFromCrawling ?? 0;
    const maxDepth = report.crawlDepth?.maxDepth ?? 0;
    const depthDistribution = report.crawlDepth?.depthDistribution ?? {};

    const totalSegments = sitemapOnly + overlap + crawledOnly;
    const sitemapOnlyPct =
      totalSegments > 0 ? (sitemapOnly / totalSegments) * 100 : 0;
    const overlapPct = totalSegments > 0 ? (overlap / totalSegments) * 100 : 0;
    const crawledOnlyPct =
      totalSegments > 0 ? (crawledOnly / totalSegments) * 100 : 0;

    const depthData = Object.entries(depthDistribution)
      .map(([depth, count]) => ({ depth: parseInt(depth), count }))
      .sort((a, b) => a.depth - b.depth);
    const maxDepthCount = Math.max(...depthData.map((d) => d.count), 1);

    const disallowedPaths = report.robotsTxt?.rules || [];
    const hadRobotsTxt = report.robotsTxt?.hadRobotsTxt ?? false;
    const errorsCount = report.errors?.count ?? 0;
    const errorDetails = report.errors?.details || [];

    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 15 }}
        transition={{ duration: 0.35 }}
        className="w-full space-y-6"
      >
        <div className="bg-neutral-900/40 border border-neutral-850 rounded-xl p-5 md:p-6 backdrop-blur-md space-y-6 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-neutral-800/80">
            <div>
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm mb-1.5">
                <CheckCircle2 className="w-4 h-4 animate-pulse" />
                <span>Sitemap Report Available</span>
              </div>
              <h3
                className="text-base md:text-lg font-mono font-medium text-white truncate max-w-[280px] md:max-w-xl"
                title={report.websiteUrl}
              >
                {report.websiteUrl}
              </h3>
              <p className="text-sm text-neutral-400 mt-1">
                Scanned on {new Date(report.timestamp).toLocaleString()}
              </p>
            </div>
            {isHistory && (
              <button
                type="button"
                onClick={() => {
                  setUrl(report.websiteUrl);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-350 rounded-lg border border-emerald-500/20 transition-all cursor-pointer select-none"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Re-crawl Target
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 text-center group hover:border-neutral-700/60 transition-all">
              <div className="flex justify-center text-emerald-400 mb-2">
                <FileText className="w-5 h-5" />
              </div>
              <div className="text-2xl font-bold font-mono text-white tracking-tight">
                {finalTotal}
              </div>
              <div className="text-[10px] uppercase font-semibold text-neutral-400 tracking-wider mt-1">
                Total Sitemap URLs
              </div>
            </div>

            <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 text-center group hover:border-neutral-700/60 transition-all">
              <div className="flex justify-center text-amber-500 mb-2">
                <Clock className="w-5 h-5" />
              </div>
              <div className="text-2xl font-bold font-mono text-white tracking-tight">
                {duration}
              </div>
              <div className="text-[10px] uppercase font-semibold text-neutral-400 tracking-wider mt-1">
                Crawl Duration
              </div>
            </div>

            <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 text-center group hover:border-neutral-700/60 transition-all">
              <div className="flex justify-center text-lime-400 mb-2">
                <Compass className="w-5 h-5" />
              </div>
              <div className="text-2xl font-bold font-mono text-white tracking-tight">
                {crawledPages}
              </div>
              <div className="text-[10px] uppercase font-semibold text-neutral-400 tracking-wider mt-1">
                Discovered Pages
              </div>
            </div>

            <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 text-center group hover:border-neutral-700/60 transition-all">
              <div className="flex justify-center text-orange-400 mb-2">
                <Globe className="w-5 h-5" />
              </div>
              <div className="text-2xl font-bold font-mono text-white tracking-tight">
                {hadRobotsTxt ? `${disallowedPaths.length}` : "No"}
              </div>
              <div className="text-[10px] uppercase font-semibold text-neutral-400 tracking-wider mt-1">
                Robots.txt Rules
              </div>
            </div>
          </div>

          <div className="space-y-3.5 border-t border-neutral-800/80 pt-5">
            <div className="flex justify-between items-center text-sm font-semibold">
              <span className="text-neutral-300 flex items-center gap-2">
                <Layers className="w-4 h-4 text-white" />
                URL Sources Segment Breakdown
              </span>
              <span className="text-neutral-400 text-sm font-mono">
                Total Checked: {totalSegments}
              </span>
            </div>

            <div className="w-full bg-neutral-950 h-3.5 rounded-full overflow-hidden flex border border-neutral-800/80 shadow-inner">
              {sitemapOnlyPct > 0 && (
                <div
                  style={{ width: `${sitemapOnlyPct}%` }}
                  className="bg-orange-500 hover:brightness-110 transition-all cursor-help h-full"
                  title={`Sitemap Only: ${sitemapOnly} URLs`}
                />
              )}
              {overlapPct > 0 && (
                <div
                  style={{ width: `${overlapPct}%` }}
                  className="bg-emerald-500 hover:brightness-110 transition-all cursor-help h-full"
                  title={`Found in Both: ${overlap} URLs`}
                />
              )}
              {crawledOnlyPct > 0 && (
                <div
                  style={{ width: `${crawledOnlyPct}%` }}
                  className="bg-lime-500 hover:brightness-110 transition-all cursor-help h-full"
                  title={`Crawled Only: ${crawledOnly} URLs`}
                />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-sm border-t border-neutral-850 pt-4">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-orange-500 shrink-0" />
                <span className="text-neutral-300 font-medium">
                  Sitemap Declarations Only ({sitemapOnly})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-emerald-500 shrink-0" />
                <span className="text-neutral-300 font-medium">
                  Found in Both ({overlap})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-lime-500 shrink-0" />
                <span className="text-neutral-300 font-medium">
                  Crawled Only ({crawledOnly})
                </span>
              </div>
            </div>
          </div>

          {depthData.length > 0 && (
            <div className="border-t border-neutral-800/85 pt-5 space-y-3">
              <button
                type="button"
                onClick={() => setExpandedDepth(!expandedDepth)}
                className="flex items-center justify-between w-full text-sm font-semibold text-neutral-300 hover:text-white transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Network className="w-4 h-4 text-emerald-400" />
                  Crawl Depth Distribution (Maximum Depth: {maxDepth})
                </span>
                {expandedDepth ? (
                  <ChevronUp className="w-4 h-4 text-neutral-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-neutral-400" />
                )}
              </button>

              <AnimatePresence>
                {expandedDepth && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden space-y-2.5 pt-1"
                  >
                    {depthData.map(({ depth, count }) => {
                      const percentage = (count / maxDepthCount) * 100;
                      return (
                        <div
                          key={depth}
                          className="flex items-center gap-3 text-sm font-mono"
                        >
                          <span className="w-20 text-neutral-450 shrink-0 text-left font-sans">
                            {depth === 0 ? "Homepage" : `Depth Level ${depth}`}
                          </span>
                          <div className="grow bg-neutral-950 h-3 rounded-full overflow-hidden border border-neutral-850 shadow-inner">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              transition={{ duration: 0.5, ease: "easeOut" }}
                              className="bg-emerald-500/80 h-full rounded-full transition-all"
                            />
                          </div>
                          <span className="w-16 text-right text-neutral-300 font-mono">
                            {count} pgs
                          </span>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {hadRobotsTxt && disallowedPaths.length > 0 && (
            <div className="border-t border-neutral-800/85 pt-5 space-y-3">
              <button
                type="button"
                onClick={() => setExpandedRobots(!expandedRobots)}
                className="flex items-center justify-between w-full text-sm font-semibold text-neutral-300 hover:text-white transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldAlert className="w-4 h-4 text-orange-400" />
                  Robots.txt Directives Respected ({disallowedPaths.length}{" "}
                  rules)
                </span>
                {expandedRobots ? (
                  <ChevronUp className="w-4 h-4 text-neutral-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-neutral-400" />
                )}
              </button>

              <AnimatePresence>
                {expandedRobots && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden space-y-1.5 pt-1"
                  >
                    <div className="bg-neutral-950 border border-neutral-850 rounded-lg p-3 font-mono text-sm text-white space-y-1 max-h-36 overflow-y-auto custom-scrollbar shadow-inner">
                      {disallowedPaths.map((path, idx) => (
                        <div key={idx} className="flex gap-2">
                          <span className="text-rose-500 font-medium">
                            Disallow:
                          </span>
                          <span className="text-neutral-300">{path}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {errorsCount > 0 && (
            <div className="border-t border-neutral-800/85 pt-5 space-y-3">
              <button
                type="button"
                onClick={() => setExpandedErrors(!expandedErrors)}
                className="flex items-center justify-between w-full text-sm font-semibold text-rose-400 hover:text-rose-350 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle className="w-4 h-4 animate-pulse" />
                  Discovered Crawl Errors & Broken Links ({errorsCount})
                </span>
                {expandedErrors ? (
                  <ChevronUp className="w-4 h-4 text-neutral-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-neutral-400" />
                )}
              </button>

              <AnimatePresence>
                {expandedErrors && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden space-y-2 pt-1"
                  >
                    <div className="bg-neutral-950 border border-neutral-850 rounded-lg overflow-hidden max-h-48 overflow-y-auto custom-scrollbar shadow-inner">
                      {errorDetails.map((err, idx) => (
                        <div
                          key={idx}
                          className="border-b border-neutral-900/60 p-3 text-sm flex flex-col gap-1 last:border-b-0"
                        >
                          <div className="font-mono text-neutral-300 break-all select-all text-[10px]">
                            {err.url}
                          </div>
                          <div className="text-rose-400/90 text-[10px] font-medium flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            {err.error}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {!isHistory && activeJobId && (
            <div className="border-t border-neutral-850 pt-5 flex flex-col gap-4">
              <div className="bg-neutral-950 border border-neutral-850 rounded-lg p-3.5 shadow-inner">
                <p className="text-sm text-white mb-2 font-medium flex items-center gap-1.5">
                  <Code size={13} className="text-neutral-400" /> Add this
                  directive to your <code>robots.txt</code> file:
                </p>
                <div className="bg-neutral-900 p-2.5 rounded font-mono text-sm text-neutral-300 select-all border border-neutral-800 flex justify-between items-center group relative">
                  <span>
                    Sitemap: {report.websiteUrl.replace(/\/$/, "")}/sitemap.xml
                  </span>
                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(
                        `Sitemap: ${report.websiteUrl.replace(/\/$/, "")}/sitemap.xml`,
                      )
                    }
                    className="p-1 rounded bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-white hover:text-white transition-colors"
                    title="Copy Directive"
                  >
                    <Check size={12} />
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full">
                <a
                  href={`/api/generate-sitemap/download?jobId=${activeJobId}&format=xml`}
                  download="sitemap.xml"
                  className="flex-1 inline-flex items-center justify-center bg-linear-to-r from-emerald-600 to-lime-600 hover:from-emerald-500 hover:to-lime-500 text-neutral-950 hover:scale-[1.005] active:scale-[0.995] text-sm font-bold py-3 px-6 rounded-lg transition-all cursor-pointer shadow-lg shadow-emerald-950/20 text-center select-none"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Sitemap XML File
                </a>
                <a
                  href={`/api/generate-sitemap/download?jobId=${activeJobId}&format=gzip`}
                  download="sitemap.xml.gz"
                  className="flex-1 inline-flex items-center justify-center bg-neutral-850 hover:bg-neutral-750 hover:text-white text-neutral-350 hover:scale-[1.005] active:scale-[0.995] text-sm font-bold py-3 px-6 rounded-lg border border-neutral-700/80 transition-all cursor-pointer shadow-lg text-center select-none"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Compressed GZ File (.xml.gz)
                </a>
              </div>
            </div>
          )}

          {isHistory && (
            <div className="border-t border-neutral-800 pt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedHistoryStats(null)}
                className="px-4 py-2 text-sm font-bold bg-neutral-800 hover:bg-neutral-750 text-neutral-350 hover:text-white rounded-lg border border-neutral-700/80 transition-colors cursor-pointer select-none"
              >
                Close Summary Report
              </button>
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-300 relative overflow-hidden">
      <div className="absolute top-[-250px] left-[20%] w-[550px] h-[550px] rounded-full bg-emerald-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[10%] right-[-100px] w-[500px] h-[500px] rounded-full bg-amber-500/3 blur-[140px] pointer-events-none" />

      <nav className="sticky top-0 z-40 border-b border-neutral-900 bg-neutral-950/70 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-600 to-lime-600 flex items-center justify-center shadow-lg shadow-emerald-950/30 group-hover:scale-105 transition-all">
              <Network size={16} className="text-neutral-950" />
            </div>
            <span className="text-lg font-medium text-white tracking-tight group-hover:text-emerald-400 transition-colors">
              Sitemap Generator
            </span>
          </Link>
          <Link
            href="/docs"
            className="text-sm font-semibold text-white hover:text-emerald-400 hover:bg-emerald-500/5 border border-neutral-800/80 hover:border-emerald-500/25 px-3 py-1.5 rounded-lg transition-all"
          >
            Documentation
          </Link>
        </div>
      </nav>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-12 space-y-12">
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <h1 className="text-4xl md:text-5xl text-white tracking-tight leading-tight">
            Generate XML Sitemaps
          </h1>
          <p className="text-sm md:text-base text-white leading-relaxed">
            An intelligent site crawler that respects robots.txt, parses image
            tags, optimizes fetches with conditional HTTP caching, and writes
            compressed sitemaps.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-5xl mx-auto items-stretch">
          <div className="lg:col-span-6 bg-neutral-900/40 border border-neutral-800/80 rounded-xl p-6 md:p-8 flex flex-col justify-between backdrop-blur-sm shadow-xl">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label
                  htmlFor="website-url"
                  className="block text-sm font-semibold text-white uppercase tracking-wider"
                >
                  Target Website URL
                </label>
                <div className="relative">
                  <Globe className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-neutral-400" />
                  <input
                    type="url"
                    id="website-url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                    disabled={loading}
                    className="w-full pl-11 pr-4 py-3 text-sm text-white bg-neutral-950 border border-neutral-800 rounded-lg focus:outline-none focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/25 transition-all placeholder:text-neutral-600 disabled:opacity-50 font-mono"
                    placeholder="https://example.com"
                  />
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex justify-between items-center text-sm">
                  <label
                    htmlFor="max-pages"
                    className="font-semibold text-white uppercase tracking-wider"
                  >
                    Maximum Crawl Cap
                  </label>
                  <span className="text-emerald-400 font-mono font-medium text-sm">
                    {maxPages} pages
                  </span>
                </div>
                <input
                  type="range"
                  id="max-pages"
                  value={maxPages}
                  onChange={(e) => setMaxPages(Number(e.target.value))}
                  min="10"
                  max="1000"
                  step="10"
                  disabled={loading}
                  className="w-full h-1 bg-neutral-850 rounded-lg appearance-none cursor-pointer accent-emerald-500 outline-none disabled:opacity-50"
                />
                <p className="text-[10px] text-neutral-400">
                  Capping crawler stops loops and limits server usage.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-emerald-600 to-lime-600 hover:from-emerald-500 hover:to-lime-500 text-neutral-950 font-bold py-3.5 px-6 rounded-lg disabled:from-neutral-800 disabled:to-neutral-800 disabled:text-neutral-400 transition-all flex justify-center items-center shadow-lg shadow-emerald-950/20 active:scale-[0.99] cursor-pointer select-none text-sm"
              >
                {loading ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-3 h-4 w-4 text-neutral-950"
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
                    Executing Crawl...
                  </>
                ) : (
                  "Start Crawler Service"
                )}
              </button>
            </form>
          </div>

          <div className="lg:col-span-6 bg-neutral-950 border border-neutral-850 rounded-xl p-5 md:p-6 flex flex-col justify-between relative shadow-inner min-h-[300px]">
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div
                  key="crawling-console"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col h-full justify-between"
                >
                  <div className="flex items-center justify-between border-b border-neutral-900 pb-3 mb-3">
                    <span className="text-[10px] text-emerald-400 font-semibold tracking-wider uppercase font-mono flex items-center gap-1.5">
                      <Terminal size={12} className="animate-pulse" /> Crawler
                      Output Log
                    </span>
                    <span className="text-[9px] text-neutral-600 font-mono">
                      Stream Active
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto max-h-[170px] space-y-1.5 font-mono text-[10px] text-white pr-1 custom-scrollbar">
                    {crawlLogs.map((log, index) => (
                      <div key={index} className="leading-relaxed break-all">
                        {log.startsWith("[error]") ? (
                          <span className="text-rose-400">{log}</span>
                        ) : log.startsWith("[system]") ? (
                          <span className="text-emerald-400">{log}</span>
                        ) : (
                          <span>{log}</span>
                        )}
                      </div>
                    ))}
                    <div ref={terminalEndRef} />
                  </div>

                  <div className="mt-4 pt-4 border-t border-neutral-900 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="relative w-6 h-6 flex items-center justify-center">
                        <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
                      </div>
                      <span className="text-sm text-neutral-300 font-medium">
                        Pages Scanned:{" "}
                        <strong className="text-emerald-400 font-mono text-sm">
                          {progress.count}
                        </strong>
                      </span>
                    </div>
                    <span className="text-[10px] text-neutral-400 font-mono bg-neutral-900 border border-neutral-800 px-1.5 py-0.5 rounded">
                      limit: {maxPages}
                    </span>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="standby-diagnostics"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col h-full justify-between gap-5"
                >
                  <div className="flex items-center justify-between border-b border-neutral-900 pb-2">
                    <span className="text-[10px] text-neutral-400 uppercase tracking-widest font-semibold font-mono flex items-center gap-1.5">
                      <Settings size={12} /> System Heuristics Status
                    </span>
                    <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded px-1 font-semibold">
                      Ready
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 rounded bg-emerald-950/20 border border-emerald-500/15 text-emerald-400 shrink-0 mt-0.5">
                        <Activity size={13} />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-neutral-300">
                          Incremental Caching & Gzip
                        </h4>
                        <p className="text-sm text-neutral-400 mt-0.5 leading-snug">
                          Utilizes ETags and Last-Modified times to perform
                          conditional fetches (304 Fast Path), and delivers XML
                          and GZ files.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="p-1.5 rounded bg-amber-950/20 border border-amber-500/15 text-amber-400 shrink-0 mt-0.5">
                        <Cpu size={13} />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-neutral-300">
                          Image & shadow DOM parsing
                        </h4>
                        <p className="text-sm text-neutral-400 mt-0.5 leading-snug">
                          Traverses shadow roots and extracts image elements to
                          build rich Google Image schema sitemaps.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="p-1.5 rounded bg-lime-950/20 border border-lime-500/15 text-lime-400 shrink-0 mt-0.5">
                        <ShieldAlert size={13} />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-neutral-300">
                          Robots.txt & Redirections
                        </h4>
                        <p className="text-sm text-neutral-400 mt-0.5 leading-snug">
                          Ethically handles redirects, consolidates protocols,
                          and parses wildcards and Allow rules using RFC 9309
                          criteria.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="p-1.5 rounded bg-blue-950/20 border border-blue-500/15 text-blue-400 shrink-0 mt-0.5">
                        <Layers size={13} />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-neutral-300">
                          Asynchronous Redis Queue & Stability
                        </h4>
                        <p className="text-sm text-neutral-400 mt-0.5 leading-snug">
                          Crawls run via BullMQ workers with automatic Chromium recycling 
                          and SIGKILL cleanups to mitigate leaks and CFG crashes.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-neutral-900 text-center">
                    <span className="text-[10px] text-neutral-400">
                      Enter URL and click "Start Crawler" above to begin.
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {error && (
          <div className="max-w-2xl mx-auto mt-6 bg-rose-950/15 border border-rose-900/60 p-4 rounded-xl flex items-start gap-3 shadow-lg">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-rose-400">Crawler Error</h4>
              <p className="text-sm text-rose-300/80 mt-0.5 leading-relaxed">
                {error}
              </p>
            </div>
          </div>
        )}

        {history.length > 0 &&
          !loading &&
          process.env.NODE_ENV === "development" && (
            <div className="max-w-3xl mx-auto bg-neutral-900/20 border border-neutral-850 rounded-xl p-6 shadow-xl space-y-4">
              <h3 className="text-base font-semibold text-neutral-200 flex items-center gap-2">
                <History size={16} className="text-emerald-400" />
                Recent Sitemap Crawls
              </h3>
              <div className="divide-y divide-neutral-800/60">
                {history.map((log, idx) => (
                  <div
                    key={idx}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm"
                  >
                    <div className="space-y-1 truncate max-w-[280px] sm:max-w-md">
                      <div
                        className="font-mono text-white truncate font-medium"
                        title={log.websiteUrl}
                      >
                        {log.websiteUrl}
                      </div>
                      <div className="text-neutral-500 text-xs">
                        {new Date(log.timestamp).toLocaleString()} • Duration:{" "}
                        {log.duration}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 border border-emerald-500/10 rounded-sm text-xs">
                        {log.statistics?.finalSitemapTotal ?? 0} URLs
                      </span>
                      <button
                        onClick={() => {
                          setSelectedHistoryStats(log);
                          setTimeout(() => {
                            const el = document.getElementById(
                              "stats-report-container",
                            );
                            if (el) {
                              el.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              });
                            }
                          }, 100);
                        }}
                        className="px-3 py-1 bg-neutral-800 hover:bg-neutral-750 text-neutral-300 hover:text-white rounded border border-neutral-750 text-xs font-semibold cursor-pointer transition-all"
                      >
                        View Report
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        <div
          id="stats-report-container"
          className="max-w-3xl mx-auto scroll-mt-24"
        >
          {stats && renderStatsDashboard(stats, false)}
          {selectedHistoryStats &&
            renderStatsDashboard(selectedHistoryStats, true)}
        </div>
      </main>

      <section className="max-w-5xl mx-auto px-4 py-16 border-t border-neutral-900">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 font-semibold text-white text-sm">
              <Cpu size={16} className="text-emerald-400" />
              <span>Smart SPA Detection</span>
            </div>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Automatically evaluates index source parameters to detect CSR
              apps. Restricts heavy Puppeteer launch threads solely to
              Javascript-rendered frameworks.
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2 font-semibold text-white text-sm">
              <ShieldAlert size={16} className="text-emerald-400" />
              <span>Robots.txt Compliance</span>
            </div>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Maintains strict crawl safety rules. Auto-discovers indexing
              sitemaps and bypasses disallow routes to crawl websites
              respectfully based on RFC 9309 standards.
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2 font-semibold text-white text-sm">
              <Layers size={16} className="text-emerald-400" />
              <span>Queue & Worker Engine</span>
            </div>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Decouples crawling execution from the main API thread. Uses BullMQ 
              and Redis to queue and process long-running jobs reliably with stability guarantees.
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2 font-semibold text-white text-sm">
              <Activity size={16} className="text-emerald-400" />
              <span>SSE Progress Streams</span>
            </div>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Streams download details, crawling counters, and status updates
              back to user client layouts in real-time, removing REST polling
              loops.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-900 bg-neutral-950 mt-auto">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-neutral-400">
          <p>Built with Next.js • Open Source Sitemap Generator</p>
          <div className="flex gap-4">
            <Link
              href="/"
              className="hover:text-neutral-300 transition-colors font-medium text-white"
            >
              Generator
            </Link>
            <Link
              href="/docs"
              className="hover:text-neutral-300 transition-colors"
            >
              Documentation
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-neutral-300 transition-colors"
            >
              GitHub
            </a>
          </div>
          <p>
            © {new Date().getFullYear()} XML Sitemap Crawler. Respecting
            robots.txt
          </p>
        </div>
      </footer>
    </div>
  );
}
