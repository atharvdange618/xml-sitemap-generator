"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Compass,
  Network,
  Cpu,
  Layers,
  Sliders,
  ShieldAlert,
  Terminal,
  FileText,
  Activity,
  Settings,
  Search,
  Copy,
  Check,
  Globe,
  CheckCircle2,
  ExternalLink,
  Menu,
  X,
  ArrowRight,
  SlidersHorizontal,
  Code2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const SECTIONS = [
  {
    id: "overview",
    label: "Overview",
    icon: Compass,
    keywords: "overview intro concept architecture design sitemap",
  },
  {
    id: "algorithm-flow",
    label: "Algorithm Flow",
    icon: Network,
    keywords:
      "algorithm flow steps stages crawl sitemap discovery queue concurrency generate",
  },
  {
    id: "csr-detection",
    label: "CSR Detection",
    icon: Cpu,
    keywords:
      "csr client side rendering detection criteria html body root next script framework loading",
  },
  {
    id: "crawling-strategy",
    label: "Crawling Strategy",
    icon: Layers,
    keywords:
      "crawling strategy concurrency depth tracking deduplication visited scope hostname robots",
  },
  {
    id: "priority-calculation",
    label: "Priority Calculation",
    icon: Sliders,
    keywords:
      "priority calculation depth scale homepage formula math score weight",
  },
  {
    id: "robots-txt",
    label: "robots.txt Handling",
    icon: ShieldAlert,
    keywords: "robots txt rules disallow user agent sitemap directives ethical",
  },
  {
    id: "puppeteer-fallback",
    label: "Puppeteer Fallback",
    icon: Terminal,
    keywords:
      "puppeteer fallback headless chrome javascript load wait networkidle extraction dom",
  },
  {
    id: "xml-structure",
    label: "XML Structure",
    icon: FileText,
    keywords:
      "xml sitemap structure schema loc lastmod priority urlset protocol format spec",
  },
  {
    id: "performance",
    label: "Performance",
    icon: Activity,
    keywords:
      "performance speed concurrency request puppeteer instance reuse stream sse cheerio",
  },
  {
    id: "configuration",
    label: "Configuration",
    icon: Settings,
    keywords:
      "configuration parameters config options csr minimal child nodes threshold timeout",
  },
];

const ALGORITHM_STEPS = [
  {
    id: 1,
    title: "Sitemap Discovery",
    desc: "Check robots.txt and common paths",
    details:
      "The crawler checks the target site's robots.txt file to parse any Sitemap declarations (e.g. Sitemap: https://example.com/sitemap.xml). It also tests standard paths like /sitemap.xml and /sitemap_index.xml to accelerate index discovery.",
    icon: Globe,
    visualType: "discovery",
  },
  {
    id: 2,
    title: "Initialize Crawl Queue",
    desc: "Seed crawl queue with entry URLs",
    details:
      "The BFS crawl queue is initialized with the target homepage. Any valid links discovered from existing sitemaps during Step 1 are also added to form an accelerated crawling index.",
    icon: Layers,
    visualType: "queue",
  },
  {
    id: 3,
    title: "Concurrent Crawling",
    desc: "Process up to 5 URLs in parallel",
    details:
      "A processing loop pulls URLs from the queue, dispatching requests concurrently (up to 5 threads by default) using a Breadth-First Search strategy to crawl shallower pages first.",
    icon: Network,
    visualType: "concurrent",
  },
  {
    id: 4,
    title: "CSR Detection",
    desc: "Scan HTML structure for Javascript SPA",
    details:
      "Before initiating heavy browser rendering, the crawler runs lightweight regex and DOM structure tests on the raw HTML response to detect if the page is a Client-Side Rendered (CSR) application.",
    icon: Cpu,
    visualType: "detection",
  },
  {
    id: 5,
    title: "Link Extraction",
    desc: "Parse links from DOM or run Puppeteer",
    details:
      "For normal static sites, a rapid HTML parser extracts all absolute and relative internal URLs. If CSR is detected, the URL is passed to Puppeteer to render Javascript before extracting DOM links.",
    icon: FileText,
    visualType: "extraction",
  },
  {
    id: 6,
    title: "Generate Sitemap",
    desc: "Export standards-compliant XML sitemap",
    details:
      "Discovered links are normalized (queries and hash fragments stripped), filtered for scope and robots.txt directives, assigned priorities, and compiled into a valid XML sitemap.",
    icon: CheckCircle2,
    visualType: "sitemap",
  },
];

const CSR_TEMPLATES = [
  {
    name: "React SPA (Client-Side Rendered)",
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <script src="/static/js/main.d435cb.js"></script>
</head>
<body>
  <div id="root"></div>
</body>
</html>`,
    stats: {
      length: 145,
      childCount: 1,
      hasRoot: true,
      scriptCount: 1,
      hasLoadingText: false,
      isCSR: true,
    },
    reason:
      "HTML is very short (145 chars < 200), contains only 1 child node inside <body>, and matches the framework root element `#root`.",
  },
  {
    name: "Next.js SSR App",
    html: `<!DOCTYPE html>
<html>
<head>
  <title>Corporate Home</title>
  <link rel="stylesheet" href="/_next/static/css/styles.css" />
</head>
<body>
  <div id="__next">
    <header>
      <nav><a href="/about">About</a><a href="/pricing">Pricing</a></nav>
    </nav>
    <main>
      <h1>Optimized Enterprise Performance</h1>
      <p>We deliver state of the art solutions tailored to your company needs.</p>
    </main>
    <footer>© 2026 Enterprise Inc.</footer>
  </div>
</body>
</html>`,
    stats: {
      length: 440,
      childCount: 7,
      hasRoot: true,
      scriptCount: 0,
      hasLoadingText: false,
      isCSR: false,
    },
    reason:
      "Although framework elements (#__next) exist, the HTML content is long (440 chars) and contains full server-rendered layout nodes. No JavaScript runtime rendering is required for link parsing.",
  },
  {
    name: "Static HTML Landing Page",
    html: `<!DOCTYPE html>
<html>
<head><title>My Portfolio</title></head>
<body>
  <h1>Hello world!</h1>
  <p>I am a developer who loves writing semantic HTML and clean CSS.</p>
  <ul>
    <li><a href="/projects">Projects</a></li>
    <li><a href="/contact">Get in Touch</a></li>
  </ul>
</body>
</html>`,
    stats: {
      length: 270,
      childCount: 3,
      hasRoot: false,
      scriptCount: 0,
      hasLoadingText: false,
      isCSR: false,
    },
    reason:
      "Meets all criteria for direct static parsing: HTML length > 200, no client-side framework root selectors, and static markup is ready to be parsed.",
  },
  {
    name: "Skeleton/Loading Screen SPA",
    html: `<!DOCTYPE html>
<html>
<body>
  <div class="app-shell">
    <div className="spinner">Loading application dashboard...</div>
  </div>
  <script src="/vendor.js"></script>
  <script src="/app.js"></script>
</body>
</html>`,
    stats: {
      length: 220,
      childCount: 3,
      hasRoot: false,
      scriptCount: 2,
      hasLoadingText: true,
      isCSR: true,
    },
    reason:
      "Contains loading indicators, scripts are present, and initial body nodes represent purely skeleton templates rather than actual site content.",
  },
];

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="absolute top-3 right-3 p-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700/80 border border-neutral-700/80 text-neutral-300 hover:text-neutral-200 transition-all flex items-center gap-1.5 text-sm font-sans select-none"
    >
      {copied ? (
        <>
          <Check size={13} className="text-emerald-400" />
          <span className="text-emerald-400 font-medium">Copied!</span>
        </>
      ) : (
        <>
          <Copy size={13} />
          <span>Copy</span>
        </>
      )}
    </button>
  );
};

const CodeBlock = ({ code, language }: { code: string; language: string }) => {
  return (
    <div className="relative group bg-neutral-900/80 border border-neutral-800 rounded-lg overflow-hidden font-mono shadow-md backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-2 bg-neutral-950/40 border-b border-neutral-800/80">
        <span className="text-sm text-neutral-400 font-sans tracking-wide uppercase font-semibold">
          {language}
        </span>
        <CopyButton text={code} />
      </div>
      <div className="p-4 overflow-x-auto text-neutral-200 text-sm md:text-sm leading-relaxed max-h-[420px]">
        <pre className="font-mono">{code}</pre>
      </div>
    </div>
  );
};

export default function Docs() {
  const [activeSection, setActiveSection] = useState("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [activeStep, setActiveStep] = useState(1);

  const [selectedTemplateIdx, setSelectedTemplateIdx] = useState(0);
  const selectedTemplate = CSR_TEMPLATES[selectedTemplateIdx];

  const [depthInput, setDepthInput] = useState(0);

  const [configConcurrency, setConfigConcurrency] = useState(5);
  const [configMaxPages, setConfigMaxPages] = useState(100);
  const [configMinLen, setConfigMinLen] = useState(200);
  const [configWaitUntil, setConfigWaitUntil] = useState("networkidle2");
  const configTimeout = 10000;

  const customConfigString = `const config = {
  csr: {
    minimalContentLength: ${configMinLen},     // Min HTML length for CSR check
    minimalChildNodes: 5,           // Min body children for CSR check
    scriptCountThreshold: 10,       // Script tag threshold
    contentScriptRatio: 1000,       // Content/script ratio
    rootSelectors: ["#root", "#__next"]
  },
  puppeteer: {
    waitForSelectorsTimeout: ${configTimeout}, // Wait for page elements (ms)
    gotoTimeout: 60000,             // Max page load timeout (ms)
    waitUntil: "${configWaitUntil}"       // Page idle check strategy
  },
  crawler: {
    concurrency: ${configConcurrency},                 // Concurrent page workers
    maxPages: ${configMaxPages}                   // Hard limit on total URLs
  }
}`;

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: "-20% 0px -60% 0px",
      threshold: 0.1,
    };

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id);
        }
      });
    };

    const observer = new IntersectionObserver(
      observerCallback,
      observerOptions,
    );

    SECTIONS.forEach((section) => {
      const el = document.getElementById(section.id);
      if (el) {
        observer.observe(el);
        sectionRefs.current[section.id] = el;
      }
    });

    return () => observer.disconnect();
  }, []);

  const filteredSections = SECTIONS.filter((section) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      section.label.toLowerCase().includes(query) ||
      section.keywords.includes(query)
    );
  });

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const yOffset = -80;
      const y =
        element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
      setActiveSection(id);
      setMobileMenuOpen(false);
    }
  };

  const renderStepperVisualizer = (step: any) => {
    switch (step.visualType) {
      case "discovery":
        return (
          <div className="flex flex-col h-full justify-between">
            <div className="bg-neutral-950 border border-neutral-800 rounded p-3 font-mono text-sm md:text-sm text-neutral-300 leading-normal space-y-1 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-1 text-[8px] bg-neutral-850/80 text-neutral-300 rounded-bl border-l border-b border-neutral-700">
                robots.txt
              </div>
              <div className="text-neutral-400">
                # Crawl rules for Googlebot
              </div>
              <div>User-agent: *</div>
              <div>Disallow: /admin/</div>
              <div className="text-emerald-400 bg-emerald-950/20 px-1 border-l-2 border-emerald-500 font-semibold animate-pulse">
                Sitemap: https://target.com/sitemap.xml
              </div>
              <div>Disallow: /private/</div>
            </div>
            <div className="mt-3 bg-neutral-950/60 rounded border border-neutral-800 p-2.5 flex items-center justify-between text-sm text-neutral-300">
              <span className="flex items-center gap-1.5">
                <Globe size={13} className="text-emerald-400 animate-spin" />{" "}
                Fetching robots.txt
              </span>
              <span className="text-emerald-400 font-medium">
                1 Sitemap Found
              </span>
            </div>
          </div>
        );
      case "queue":
        return (
          <div className="flex flex-col h-full justify-between gap-3">
            <div className="space-y-1.5">
              <div className="text-sm text-neutral-400 uppercase tracking-wider font-semibold">
                Crawl Queue Stack
              </div>
              <div className="flex flex-col gap-1">
                <div className="bg-lime-950/40 border border-lime-900/60 rounded px-2.5 py-1.5 text-sm text-lime-200 flex justify-between items-center">
                  <span className="truncate font-mono">
                    https://target.com/
                  </span>
                  <span className="text-[9px] bg-lime-500/20 px-1.5 py-0.5 rounded text-lime-400 font-medium">
                    Seed
                  </span>
                </div>
                <div className="bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-sm text-neutral-300 flex justify-between items-center">
                  <span className="truncate font-mono">
                    https://target.com/sitemap.xml
                  </span>
                  <span className="text-[9px] bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-300">
                    XML Site
                  </span>
                </div>
              </div>
            </div>
            <div className="text-center bg-lime-500/10 border border-lime-500/20 rounded p-2 text-sm text-lime-300">
              Queue loaded • 2 initial targets
            </div>
          </div>
        );
      case "concurrent":
        return (
          <div className="space-y-3">
            <div className="text-sm text-neutral-400 uppercase tracking-wider font-semibold">
              5 Concurrent Thread Pools
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5].map((id) => (
                <div
                  key={id}
                  className="flex flex-col items-center p-1.5 bg-neutral-900 border border-neutral-800 rounded"
                >
                  <span className="text-[9px] text-neutral-400 font-mono">
                    #0{id}
                  </span>
                  <div
                    className={`w-2 h-2 rounded-full mt-1.5 ${id <= 3 ? "bg-emerald-500 animate-ping" : id === 4 ? "bg-amber-400" : "bg-neutral-600"}`}
                  />
                  <span className="text-[8px] text-neutral-300 mt-1.5 font-medium">
                    {id <= 3 ? "Active" : id === 4 ? "Wait" : "Idle"}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-sm text-neutral-300 bg-neutral-950/40 p-2 rounded border border-neutral-800 flex justify-between">
              <span>
                Concurrency Active:{" "}
                <strong className="text-emerald-400">3/5</strong>
              </span>
              <span>
                Rate Limit: <strong>None</strong>
              </span>
            </div>
          </div>
        );
      case "detection":
        return (
          <div className="flex flex-col h-full justify-between gap-2.5">
            <div className="bg-neutral-950 border border-neutral-800 rounded p-3 font-mono text-sm text-neutral-300 space-y-1">
              <div>&lt;body&gt;</div>
              <div className="bg-neutral-900/60 px-1.5 py-0.5 border-l border-neutral-700">
                &lt;div id=&quot;root&quot;&gt;&lt;/div&gt;
              </div>
              <div>&lt;script src=&quot;/app.js&quot;&gt;&lt;/script&gt;</div>
              <div>&lt;/body&gt;</div>
            </div>
            <div className="border border-amber-900/30 bg-amber-950/10 rounded p-2 text-sm flex flex-col gap-1">
              <div className="text-amber-400 font-medium flex items-center gap-1.5">
                <Cpu size={12} className="animate-pulse" /> CSR System Flagged
              </div>
              <p className="text-sm text-neutral-300 leading-tight">
                Length &lt; 200, empty body with framework selector root.
                Triggering Puppeteer renderer.
              </p>
            </div>
          </div>
        );
      case "extraction":
        return (
          <div className="flex flex-col h-full justify-between">
            <div className="bg-neutral-950 border border-neutral-800 rounded-md p-2.5 font-mono text-sm text-neutral-300 space-y-1">
              <div className="text-neutral-400">
                {"// Scraped Anchor Nodes"}
              </div>
              <div className="flex justify-between items-center text-emerald-400 bg-emerald-950/15 p-1 rounded">
                <span>&lt;a href=&quot;/features&quot;&gt;</span>
                <span className="text-[8px] bg-emerald-500/20 px-1 rounded text-emerald-300 font-sans">
                  EXTRACTED
                </span>
              </div>
              <div className="flex justify-between items-center text-neutral-300 p-1">
                <span>&lt;a href=&quot;https://google.com&quot;&gt;</span>
                <span className="text-[8px] bg-neutral-800 px-1 rounded text-neutral-400 font-sans">
                  OUT OF SCOPE
                </span>
              </div>
            </div>
            <div className="mt-2 text-sm text-neutral-300 flex items-center gap-1.5">
              <ArrowRight
                size={13}
                className="text-emerald-400 animate-bounce"
              />{" "}
              Total Internal Links Scraped: <strong>+12</strong>
            </div>
          </div>
        );
      case "sitemap":
        return (
          <div className="flex flex-col h-full justify-between">
            <div className="bg-neutral-950 border border-neutral-800 rounded p-2.5 font-mono text-[9px] text-neutral-300 space-y-0.5 overflow-hidden max-h-[85px]">
              <div>&lt;urlset xmlns=&quot;...&quot;&gt;</div>
              <div className="pl-3 text-neutral-300">&lt;url&gt;</div>
              <div className="pl-6">
                &lt;loc&gt;https://site.com/&lt;/loc&gt;
              </div>
              <div className="pl-6">&lt;priority&gt;1.0&lt;/priority&gt;</div>
              <div className="pl-3 text-neutral-300">&lt;/url&gt;</div>
              <div>&lt;/urlset&gt;</div>
            </div>
            <div className="mt-2 bg-emerald-500/10 border border-emerald-500/20 rounded p-2 text-center text-sm text-emerald-400 font-medium">
              Sitemap XML Compiled & Ready
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const getDepthDescription = (depth: string | number) => {
    const d = Number(depth);
    if (d === 0) {
      return {
        priority: "1.0",
        label: "Homepage / Root",
        desc: "The core entry point of your site. This page carries absolute priority, directing search engines to evaluate it as the primary navigation hub.",
      };
    } else if (d === 1) {
      return {
        priority: "0.9",
        label: "Primary Landing / Category Pages",
        desc: "Pages linked directly from the homepage, e.g., main sections (/products, /blog, /pricing, /about). Very high index priority.",
      };
    } else if (d === 2) {
      return {
        priority: "0.8",
        label: "Secondary Pages / Product Categories",
        desc: "Typically index list extensions, detailed categories, or individual blog articles connected directly to primary landing sections.",
      };
    } else if (d >= 3 && d <= 5) {
      return {
        priority: (1.0 - d * 0.1).toFixed(1),
        label: "Deep Site Content / Single Articles",
        desc: "Regular content pages, specific product details, or deep pagination structures. Standard priority, crawled regularly.",
      };
    } else {
      return {
        priority: "0.1",
        label: "Archived & Low Utility Pages",
        desc: "Deeply nested pages (depth 9+). Assigned the minimum baseline priority (0.1) to signal to search engines that they are secondary archive items.",
      };
    }
  };

  const depthInfo = getDepthDescription(depthInput);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-300 relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-200px] right-[-200px] w-[500px] h-[500px] rounded-full bg-emerald-500/5 blur-[130px]" />
        <div className="absolute bottom-[200px] left-[-300px] w-[600px] h-[600px] rounded-full bg-emerald-500/3 blur-[150px]" />
      </div>

      <header className="sticky top-0 z-40 w-full border-b border-neutral-900 bg-neutral-950/70 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-linear-to-tr from-emerald-600 to-lime-600 flex items-center justify-center shadow-lg shadow-emerald-950/30 group-hover:scale-105 transition-all">
              <Network size={16} className="text-neutral-950" />
            </div>
            <span className="text-lg font-medium text-white tracking-tight group-hover:text-emerald-400 transition-colors">
              Sitemap Generator
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="/"
              className="text-sm text-neutral-300 hover:text-neutral-200 transition-colors"
            >
              Generator
            </Link>
            <Link
              href="/docs"
              className="text-sm font-medium text-white bg-neutral-900 border border-neutral-800/80 px-3 py-1.5 rounded-lg"
            >
              Documentation
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-neutral-300 hover:text-neutral-200 transition-colors flex items-center gap-1.5"
            >
              GitHub <ExternalLink size={12} />
            </a>
          </nav>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 rounded-md hover:bg-neutral-900 border border-neutral-800/40 text-neutral-300 hover:text-white"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed inset-x-0 top-[65px] z-30 p-4 bg-neutral-950/95 border-b border-neutral-800 shadow-xl backdrop-blur-lg flex flex-col gap-4 md:hidden"
          >
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search documentation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-neutral-900/60 border border-neutral-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500/80 transition-colors"
              />
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-1">
              {filteredSections.map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2.5 transition-colors ${
                    activeSection === item.id
                      ? "bg-emerald-500/10 text-emerald-400 font-medium border-l-2 border-emerald-500"
                      : "text-neutral-300 hover:bg-neutral-900/40 hover:text-neutral-200"
                  }`}
                >
                  <item.icon size={15} />
                  <span>{item.label}</span>
                </button>
              ))}
              {filteredSections.length === 0 && (
                <p className="text-center text-sm text-neutral-400 py-4">
                  No sections matched your search
                </p>
              )}
            </div>

            <div className="h-px bg-neutral-800/80 my-1" />

            <div className="flex justify-between items-center px-3 text-sm text-neutral-300">
              <Link href="/" className="hover:text-white transition-colors">
                Generator Homepage
              </Link>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors flex items-center gap-1"
              >
                GitHub <ExternalLink size={10} />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-8 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
        <aside className="hidden lg:block sticky top-24 self-start max-h-[calc(100vh-120px)] flex flex-col gap-6 pr-2 border-r border-neutral-900">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search documentation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-900/40 hover:bg-neutral-900/80 border border-neutral-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-600 focus:bg-neutral-900 transition-colors"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
            <div className="text-sm font-semibold text-neutral-400 uppercase tracking-widest px-3 mb-2 select-none">
              Documentation Chapters
            </div>
            {filteredSections.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2.5 transition-all relative ${
                  activeSection === item.id
                    ? "text-emerald-400 font-semibold"
                    : "text-neutral-300 hover:text-neutral-200 hover:bg-neutral-900/30"
                }`}
              >
                {activeSection === item.id && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute inset-0 bg-emerald-500/10 border-l-2 border-emerald-500 rounded-md"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <item.icon size={14} className="relative z-10" />
                <span className="relative z-10">{item.label}</span>
              </button>
            ))}
            {filteredSections.length === 0 && (
              <div className="text-center text-sm text-neutral-400 py-6 border border-dashed border-neutral-800/40 rounded-lg">
                No matching topics.
              </div>
            )}
          </div>

          <div className="border-t border-neutral-900 pt-4 flex flex-col gap-2">
            <Link
              href="/"
              className="text-sm text-neutral-400 hover:text-neutral-300 transition-colors flex items-center gap-1.5"
            >
              <ArrowRight size={12} className="rotate-180" /> Back to generator
            </Link>
          </div>
        </aside>

        <main className="min-w-0 pb-20">
          <div className="mb-12 border-b border-neutral-800/60 pb-8">
            <h1 className="text-4xl md:text-5xl  tracking-tight text-white mb-3">
              Developer Documentation
            </h1>
            <p className="text-base md:text-lg text-neutral-300 max-w-2xl ">
              Under-the-hood analysis of sitemap crawling mechanics, client-side
              rendering heuristics, priorities, and code flows.
            </p>
          </div>

          <div className="space-y-20">
            <section id="overview" className="scroll-mt-24">
              <div className="flex items-center gap-2.5 mb-4 group">
                <div className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg text-emerald-400 group-hover:text-emerald-300 transition-colors">
                  <Compass size={18} />
                </div>
                <h2 className="text-2xl font-semibold text-white">Overview</h2>
              </div>

              <div className="prose-gray max-w-none text-neutral-300 leading-relaxed space-y-4">
                <p>
                  This sitemap generator intelligently crawls websites to
                  discover all accessible pages and generates a
                  standards-compliant XML sitemap. It is designed to handle
                  both traditional server-side rendered (SSR) pages and modern
                  client-side rendered (CSR) applications like React, Vue, and
                  Angular.
                </p>
                <p>
                  It utilizes an asynchronous task processing architecture powered by BullMQ
                  and Redis. Crawl requests are placed into a queue on submission and
                  processed by a dedicated sitemap background worker. This handles long-running crawls
                  without blocking the web server and streams progress updates using Server-Sent Events (SSE).
                </p>
                <p>
                  The generator uses a hybrid approach: it first attempts to
                  extract links using simple HTTP requests and HTML parsing. If
                  it detects a CSR application, it automatically falls back to
                  Puppeteer for JavaScript rendering.
                </p>
              </div>
            </section>

            <section id="algorithm-flow" className="scroll-mt-24">
              <div className="flex items-center gap-2.5 mb-4 group">
                <div className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg text-emerald-400">
                  <Network size={18} />
                </div>
                <h2 className="text-2xl font-semibold text-white">
                  Algorithm Flow
                </h2>
              </div>

              <p className="text-neutral-300 text-sm mb-6 leading-relaxed">
                The crawling algorithm proceeds through six distinct stages.
                Select a stage in the interactive stepper below to inspect its
                internal logic and live visual state representation:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-neutral-900/30 border border-neutral-800 rounded-xl p-5 md:p-6 backdrop-blur-sm">
                <div className="md:col-span-5 flex flex-col gap-2">
                  {ALGORITHM_STEPS.map((step) => {
                    const isActive = activeStep === step.id;
                    return (
                      <button
                        key={step.id}
                        onClick={() => setActiveStep(step.id)}
                        className={`flex items-start text-left p-3 rounded-lg border transition-all ${
                          isActive
                            ? "bg-emerald-600/10 border-emerald-500/80 shadow-md shadow-emerald-950/20"
                            : "bg-neutral-900/60 border-neutral-800/80 hover:bg-neutral-900 hover:border-neutral-700/60"
                        }`}
                      >
                        <div
                          className={`shrink-0 rounded-full w-6 h-6 flex items-center justify-center text-sm font-semibold mr-3 transition-colors ${
                            isActive
                              ? "bg-emerald-500 text-neutral-950"
                              : "bg-neutral-800 text-neutral-300"
                          }`}
                        >
                          {step.id}
                        </div>
                        <div className="min-w-0">
                          <h4
                            className={`text-sm font-medium ${isActive ? "text-emerald-300" : "text-neutral-200"}`}
                          >
                            {step.title}
                          </h4>
                          <p className="text-sm text-neutral-400 line-clamp-1 mt-0.5">
                            {step.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="md:col-span-7 bg-neutral-900/90 border border-neutral-800/80 rounded-xl p-5 flex flex-col justify-between min-h-[300px] shadow-inner relative">
                  <AnimatePresence mode="wait">
                    {ALGORITHM_STEPS.map((step) => {
                      if (step.id !== activeStep) return null;
                      return (
                        <motion.div
                          key={step.id}
                          initial={{ opacity: 0, x: 15 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -15 }}
                          transition={{ duration: 0.18 }}
                          className="flex flex-col h-full justify-between"
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-emerald-400 font-semibold tracking-wider uppercase bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900/50">
                                Stage 0{step.id} Visualizer
                              </span>
                              <step.icon
                                size={16}
                                className="text-neutral-400"
                              />
                            </div>

                            <h3 className="text-base font-semibold text-neutral-100">
                              {step.title}
                            </h3>
                            <p className="text-sm text-neutral-300 leading-relaxed ">
                              {step.details}
                            </p>
                          </div>

                          <div className="mt-6 pt-5 border-t border-neutral-800/80 flex-1 flex flex-col justify-end">
                            {renderStepperVisualizer(step)}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
            </section>

            <section id="csr-detection" className="scroll-mt-24">
              <div className="flex items-center gap-2.5 mb-4 group">
                <div className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg text-emerald-400">
                  <Cpu size={18} />
                </div>
                <h2 className="text-2xl font-semibold text-white">
                  Client-Side Rendering Detection
                </h2>
              </div>

              <div className="prose-gray text-neutral-300 leading-relaxed mb-6 space-y-4">
                <p>
                  The CSR detection algorithm analyzes several signals to
                  determine if a page requires JavaScript execution to render
                  its content:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 my-6">
                  <div className="p-4 bg-neutral-900/40 border border-neutral-800/60 rounded-xl space-y-1.5 hover:border-neutral-800 transition-colors">
                    <span className="text-sm text-emerald-400 font-semibold uppercase tracking-wider">
                      01. Short HTML
                    </span>
                    <p className="text-sm text-neutral-300 leading-snug">
                      HTML source length less than 200 characters indicates
                      minimal initial content.
                    </p>
                  </div>
                  <div className="p-4 bg-neutral-900/40 border border-neutral-800/60 rounded-xl space-y-1.5 hover:border-neutral-800 transition-colors">
                    <span className="text-sm text-emerald-400 font-semibold uppercase tracking-wider">
                      02. Empty Body
                    </span>
                    <p className="text-sm text-neutral-300 leading-snug">
                      Less than 5 direct child nodes inside the body tag
                      indicates skeleton layouts.
                    </p>
                  </div>
                  <div className="p-4 bg-neutral-900/40 border border-neutral-800/60 rounded-xl space-y-1.5 hover:border-neutral-800 transition-colors">
                    <span className="text-sm text-emerald-400 font-semibold uppercase tracking-wider">
                      03. App Markers
                    </span>
                    <p className="text-sm text-neutral-300 leading-snug">
                      Presence of React/Next IDs like <code>#root</code> or{" "}
                      <code>#__next</code>.
                    </p>
                  </div>
                  <div className="p-4 bg-neutral-900/40 border border-neutral-800/60 rounded-xl space-y-1.5 hover:border-neutral-800 transition-colors">
                    <span className="text-sm text-emerald-400 font-semibold uppercase tracking-wider">
                      04. Script Heavy
                    </span>
                    <p className="text-sm text-neutral-300 leading-snug">
                      Over 10 script tags coupled with low text-to-code ratio
                      parameters.
                    </p>
                  </div>
                  <div className="p-4 bg-neutral-900/40 border border-neutral-800/60 rounded-xl space-y-1.5 hover:border-neutral-800 transition-colors">
                    <span className="text-sm text-emerald-400 font-semibold uppercase tracking-wider">
                      05. Loading Terms
                    </span>
                    <p className="text-sm text-neutral-300 leading-snug">
                      Terms like &quot;loading&quot;, &quot;spinner&quot; or
                      &quot;loading-screen&quot; in the raw source.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-6 border border-neutral-800 bg-neutral-900/20 rounded-xl p-5 md:p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal
                      size={14}
                      className="text-emerald-400 animate-pulse"
                    />
                    <span className="text-sm font-semibold text-neutral-200">
                      Interactive CSR Detection Simulator
                    </span>
                  </div>
                  <span className="text-sm text-neutral-400 font-mono">
                    Simulate Crawl Checks
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  <div className="lg:col-span-5 flex flex-col gap-2">
                    <div className="text-sm text-neutral-400 uppercase tracking-widest font-semibold px-1 mb-1">
                      Select Preset HTML Template
                    </div>
                    {CSR_TEMPLATES.map((template, idx) => (
                      <button
                        key={template.name}
                        onClick={() => setSelectedTemplateIdx(idx)}
                        className={`text-left p-3 rounded-lg border text-sm transition-all ${
                          selectedTemplateIdx === idx
                            ? "bg-neutral-900 border-emerald-500/80 text-white font-medium shadow-inner shadow-black/40"
                            : "bg-neutral-900/40 border-neutral-800/60 hover:bg-neutral-900 hover:text-white text-neutral-300"
                        }`}
                      >
                        {template.name}
                      </button>
                    ))}
                  </div>

                  <div className="lg:col-span-7 bg-neutral-950/80 border border-neutral-800 rounded-lg p-4 font-mono text-sm leading-relaxed flex flex-col justify-between min-h-[220px]">
                    <div className="space-y-2">
                      <div className="text-neutral-400 border-b border-neutral-900 pb-1.5 flex justify-between font-sans text-sm">
                        <span>SIMULATED SOURCE CODE</span>
                        <span className="text-neutral-600">HTML Source</span>
                      </div>
                      <pre className="text-neutral-300 select-all overflow-x-auto max-h-[110px] pb-2 font-mono scrollbar-thin">
                        {selectedTemplate.html}
                      </pre>
                    </div>

                    <div className="mt-4 pt-3 border-t border-neutral-900 space-y-2 font-sans">
                      <div className="flex justify-between items-center text-sm text-neutral-400 font-mono font-semibold">
                        <span>CRITERIA EVALUATION</span>
                        <span>CHECK VALUE</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-1.5">
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${selectedTemplate.stats.length < 200 ? "bg-amber-400" : "bg-neutral-700"}`}
                          />
                          <span className="text-neutral-300">
                            Short HTML ({selectedTemplate.stats.length} ch)
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 justify-end">
                          {selectedTemplate.stats.length < 200 ? (
                            <span className="text-amber-400 font-medium text-sm bg-amber-500/10 px-1 rounded border border-amber-500/20">
                              FLAGGED
                            </span>
                          ) : (
                            <span className="text-neutral-400 text-sm">
                              PASS
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${selectedTemplate.stats.childCount < 5 ? "bg-amber-400" : "bg-neutral-700"}`}
                          />
                          <span className="text-neutral-300">
                            Empty Body ({selectedTemplate.stats.childCount}{" "}
                            nodes)
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 justify-end">
                          {selectedTemplate.stats.childCount < 5 ? (
                            <span className="text-amber-400 font-medium text-sm bg-amber-500/10 px-1 rounded border border-amber-500/20">
                              FLAGGED
                            </span>
                          ) : (
                            <span className="text-neutral-400 text-sm">
                              PASS
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${selectedTemplate.stats.hasRoot ? "bg-amber-400" : "bg-neutral-700"}`}
                          />
                          <span className="text-neutral-300">
                            Framework Selector (#root/#__next)
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 justify-end">
                          {selectedTemplate.stats.hasRoot ? (
                            <span className="text-amber-400 font-medium text-sm bg-amber-500/10 px-1 rounded border border-amber-500/20">
                              FLAGGED
                            </span>
                          ) : (
                            <span className="text-neutral-400 text-sm">
                              ABSENT
                            </span>
                          )}
                        </div>
                      </div>

                      <div
                        className={`mt-3 p-3 rounded-lg border flex flex-col gap-1 transition-all ${
                          selectedTemplate.stats.isCSR
                            ? "bg-amber-500/5 border-amber-500/20"
                            : "bg-emerald-500/5 border-emerald-500/20"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-neutral-300 font-semibold tracking-wider uppercase font-mono">
                            DETERMINED CRAWL ENGINE
                          </span>
                          {selectedTemplate.stats.isCSR ? (
                            <span className="text-sm text-amber-400 font-semibold flex items-center gap-1">
                              <Terminal size={12} className="animate-pulse" />{" "}
                              PUPPETEER FALLBACK
                            </span>
                          ) : (
                            <span className="text-sm text-emerald-400 font-semibold flex items-center gap-1">
                              <Code2 size={12} /> CHEERIO FAST PARSER
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-neutral-300 mt-1 leading-normal ">
                          <strong>Rationale:</strong> {selectedTemplate.reason}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <CodeBlock
                language="javascript"
                code={`function detectCSR(html, root) {
  let score = 0;

  // 1. Strong negatives - server-rendered with hydration data
  if (
    html.includes("__NEXT_DATA__") ||
    html.includes("self.__next_f") ||
    html.includes("window.__NUXT__") ||
    html.includes("__remixContext") ||
    html.includes("__remixManifest") ||
    html.includes("astro-island") ||
    html.includes("data-sveltekit-hydrate") ||
    html.includes("__sveltekit_")
  ) {
    return false; // SSR/hydrated - HTTP is sufficient
  }

  // 2. Strong positive - dev-confirmed CSR
  if (/<noscript>[^<]*(enable javascript|requires javascript)/i.test(html)) {
    return true;
  }

  // 3. Visible text after script/style strip
  const body = root.querySelector("body");
  if (!body) return true;

  const bodyClone = parse(body.outerHTML);
  bodyClone.querySelectorAll("script, style, template, noscript").forEach((el) => el.remove());
  const visibleTextLen = bodyClone.text.replace(/\\s+/g, " ").trim().length;

  if (visibleTextLen < 200) score += 3;
  else if (visibleTextLen < 800) score += 1;

  // 4. Framework root selectors
  const roots = ["#root", "#__next", "#app", "#__nuxt", "[ng-version]"];
  const hasRoot = roots.some((s) => root.querySelector(s));
  const rootIsEmpty = roots.some((s) => {
    const el = root.querySelector(s);
    return el && el.childNodes.length === 0;
  });

  if (hasRoot && rootIsEmpty) score += 4;
  else if (hasRoot && visibleTextLen < 500) score += 2;

  // 5. True splash screen (only loading/spinner classes inside body)
  const splash = body.querySelector('[class*="loading" i], [class*="spinner" i]');
  if (splash && bodyClone.childNodes.length <= 3) {
    score += 2;
  }

  return score >= 3;
}`}
              />
            </section>

            <section id="crawling-strategy" className="scroll-mt-24">
              <div className="flex items-center gap-2.5 mb-4 group">
                <div className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg text-emerald-400">
                  <Layers size={18} />
                </div>
                <h2 className="text-2xl font-semibold text-white">
                  Crawling Strategy
                </h2>
              </div>

              <p className="text-neutral-300 leading-relaxed mb-6">
                The crawler uses a breadth-first search (BFS) algorithm with
                concurrent processing to efficiently discover pages:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-neutral-900/30 border border-neutral-800/80 rounded-xl p-5 hover:border-neutral-700/60 transition-all hover:-translate-y-px space-y-2 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <h3 className="text-sm font-semibold text-neutral-100">
                      Concurrency Management
                    </h3>
                  </div>
                  <p className="text-sm text-neutral-300 leading-relaxed ">
                    Processes up to 5 URLs simultaneously to maximize crawling
                    performance and throughput, while preserving target server
                    bandwidth.
                  </p>
                </div>

                <div className="bg-neutral-900/30 border border-neutral-800/80 rounded-xl p-5 hover:border-neutral-700/60 transition-all hover:-translate-y-px space-y-2 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <h3 className="text-sm font-semibold text-neutral-100">
                      Depth Tracking Heuristics
                    </h3>
                  </div>
                  <p className="text-sm text-neutral-300 leading-relaxed ">
                    Tracks depth layers from the entry homepage. This maps
                    internal linkage hierarchies to configure appropriate index
                    weights and priorities.
                  </p>
                </div>

                <div className="bg-neutral-900/30 border border-neutral-800/80 rounded-xl p-5 hover:border-neutral-700/60 transition-all hover:-translate-y-px space-y-2 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <h3 className="text-sm font-semibold text-neutral-100">
                      URL Deduplication
                    </h3>
                  </div>
                  <p className="text-sm text-neutral-300 leading-relaxed ">
                    Keeps track of visited targets inside a unique `Set`. Query
                    string parameters and hash fragments are stripped to avoid
                    crawling redundant loops.
                  </p>
                </div>

                <div className="bg-neutral-900/30 border border-neutral-800/80 rounded-xl p-5 hover:border-neutral-700/60 transition-all hover:-translate-y-px space-y-2 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <h3 className="text-sm font-semibold text-neutral-100">
                      Domain Scope Restriction
                    </h3>
                  </div>
                  <p className="text-sm text-neutral-300 leading-relaxed ">
                    Prevents crawler leaking onto external websites. Restricts
                    queue pushes strictly to matching hostnames, in compliance
                    with robots.txt rules.
                  </p>
                </div>
              </div>
            </section>

            <section id="priority-calculation" className="scroll-mt-24">
              <div className="flex items-center gap-2.5 mb-4 group">
                <div className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg text-emerald-400">
                  <Sliders size={18} />
                </div>
                <h2 className="text-2xl font-semibold text-white">
                  Priority Calculation
                </h2>
              </div>

              <p className="text-neutral-300 leading-relaxed mb-6">
                Each URL in the sitemap is assigned a priority value between 0.1
                and 1.0 based on its depth from the homepage. Explore the
                interactive priority scale below:
              </p>

              <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-5 md:p-6 space-y-5">
                <div className="flex justify-between items-center border-b border-neutral-800/80 pb-3">
                  <span className="text-sm font-semibold text-neutral-200">
                    Interactive Priority Calculator
                  </span>
                  <code className="text-sm font-mono text-emerald-400">
                    Math.max(0.1, 1.0 - depth * 0.1)
                  </code>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                  <div className="md:col-span-6 space-y-4">
                    <div className="flex justify-between text-sm text-neutral-300">
                      <span>Crawl Level Depth</span>
                      <span>
                        Depth:{" "}
                        <strong className="text-emerald-400 font-mono text-sm">
                          {depthInput}
                        </strong>
                      </span>
                    </div>

                    <div className="relative pt-1 flex items-center">
                      <input
                        type="range"
                        min="0"
                        max="10"
                        value={depthInput}
                        onChange={(e) => setDepthInput(Number(e.target.value))}
                        className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 outline-none"
                      />
                    </div>

                    <div className="flex justify-between text-sm text-neutral-400 font-mono">
                      <span>0 (Homepage)</span>
                      <span>5 (Deep content)</span>
                      <span>10+ (Archived)</span>
                    </div>
                  </div>

                  <div className="md:col-span-6 bg-neutral-950/80 border border-neutral-800/80 rounded-xl p-5 flex items-center gap-5 shadow-sm">
                    <div className="relative flex items-center justify-center w-24 h-24 rounded-full border border-emerald-500/20 bg-emerald-600/5 shadow-inner">
                      <div className="text-center">
                        <span className="text-2xl font-mono font-bold text-white tracking-tight leading-none">
                          {depthInfo.priority}
                        </span>
                        <div className="text-[8px] uppercase tracking-wider text-neutral-400 mt-1 font-semibold">
                          Priority
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <span className="text-sm uppercase font-mono font-bold text-emerald-400 tracking-wider">
                        {depthInfo.label}
                      </span>
                      <p className="text-sm text-neutral-300 mt-1.5 leading-relaxed ">
                        {depthInfo.desc}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section id="robots-txt" className="scroll-mt-24">
              <div className="flex items-center gap-2.5 mb-4 group">
                <div className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg text-emerald-400">
                  <ShieldAlert size={18} />
                </div>
                <h2 className="text-2xl font-semibold text-white">
                  robots.txt Handling
                </h2>
              </div>

              <p className="text-neutral-300 leading-relaxed mb-6">
                The generator respects robots.txt directives to ensure ethical
                crawling:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Globe size={15} className="text-emerald-400" />
                    <h3 className="text-sm font-semibold text-neutral-100">
                      Sitemap Auto-Discovery
                    </h3>
                  </div>
                  <p className="text-sm text-neutral-300 leading-relaxed ">
                    Reads robots.txt declarations to fetch pre-existing sitemap
                    URLs, prioritizing them during crawl setup.
                  </p>
                  <div className="bg-neutral-950 border border-neutral-800 p-2.5 rounded font-mono text-sm text-neutral-300">
                    Sitemap: https://example.com/sitemap.xml
                  </div>
                </div>

                <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldAlert size={15} className="text-emerald-400" />
                    <h3 className="text-sm font-semibold text-neutral-100">
                      Disallow Enforcement
                    </h3>
                  </div>
                  <p className="text-sm text-neutral-300 leading-relaxed ">
                    Validates each URL pattern against disallowed paths prior to
                    executing worker queues.
                  </p>
                  <div className="bg-neutral-950 border border-neutral-800 p-2.5 rounded font-mono text-sm text-neutral-300 leading-normal">
                    Disallow: /admin/
                    <br />
                    Disallow: /private/
                  </div>
                </div>
              </div>
            </section>

            <section id="puppeteer-fallback" className="scroll-mt-24">
              <div className="flex items-center gap-2.5 mb-4 group">
                <div className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg text-emerald-400">
                  <Terminal size={18} />
                </div>
                <h2 className="text-2xl font-semibold text-white">
                  Puppeteer Fallback
                </h2>
              </div>

              <p className="text-neutral-300 leading-relaxed mb-6">
                When CSR is detected, the generator spins up a headless Chrome
                instance to execute script assets and extract anchor elements
                from the fully rendered DOM layout:
              </p>

              <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-6 mb-6 space-y-4">
                {[
                  {
                    step: "1",
                    title: "Shared Browser Instance",
                    desc: "Initiates a singular background headless Chromium container, sharing context resources to mitigate server memory bottlenecks.",
                  },
                  {
                    step: "2",
                    title: "Navigate & Wait For Connection Idle",
                    desc: "Instructs page viewport to load the target link and blocks execution until network traffic is idle (networkidle2).",
                  },
                  {
                    step: "3",
                    title: "Explicit Selector Timeouts",
                    desc: "Halts script thread for up to 10 seconds checking for standard container markers (such as body anchors or div root layouts).",
                  },
                  {
                    step: "4",
                    title: "Evaluate DOM Link Array",
                    desc: "Queries viewport DOM directly utilizing document interfaces to fetch all valid anchor elements, metadata hreflangs, and canon links.",
                  },
                  {
                    step: "5",
                    title: "Resource Context Disposal",
                    desc: "Instructs browser tab workspace to close immediately to recycle system RAM, leaving the main container engine listening for incoming targets.",
                  },
                ].map((item) => (
                  <div key={item.step} className="flex gap-4">
                    <div className="shrink-0 w-6 h-6 rounded-full bg-neutral-800 border border-neutral-700/80 flex items-center justify-center text-sm font-semibold text-emerald-400">
                      {item.step}
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-neutral-200">
                        {item.title}
                      </h4>
                      <p className="text-sm text-neutral-300 leading-relaxed ">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section id="xml-structure" className="scroll-mt-24">
              <div className="flex items-center gap-2.5 mb-4 group">
                <div className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg text-emerald-400">
                  <FileText size={18} />
                </div>
                <h2 className="text-2xl font-semibold text-white">
                  XML Sitemap Generation
                </h2>
              </div>

              <p className="text-neutral-300 leading-relaxed mb-6">
                The sitemap generation compiles collected data in compliance
                with the{" "}
                <a
                  href="https://www.sitemaps.org/protocol.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 underline inline-flex items-center gap-0.5"
                >
                  sitemaps.org protocol <ExternalLink size={12} />
                </a>{" "}
                specification:
              </p>

              <CodeBlock
                language="xml"
                code={`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2026-05-31T18:42:14.000Z</lastmod>
    <priority>1.0</priority>
    <xhtml:link rel="alternate" hreflang="es" href="https://example.com/es/"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="https://example.com/"/>
    <image:image>
      <image:loc>https://example.com/images/hero-banner.webp</image:loc>
    </image:image>
  </url>
  <url>
    <loc>https://example.com/about</loc>
    <lastmod>2026-05-31T18:04:35.000Z</lastmod>
    <priority>0.9</priority>
    <image:image>
      <image:loc>https://example.com/images/about-team.png</image:loc>
    </image:image>
  </url>
  <!-- Additional URLs... -->
</urlset>`}
              />
            </section>

            <section id="performance" className="scroll-mt-24">
              <div className="flex items-center gap-2.5 mb-4 group">
                <div className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg text-emerald-400">
                  <Activity size={18} />
                </div>
                <h2 className="text-2xl font-semibold text-white">
                  Performance Considerations
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 bg-neutral-900/30 border border-neutral-800 rounded-xl space-y-2 hover:border-neutral-700/60 transition-all shadow-sm">
                  <h3 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-450" />
                    Asynchronous Redis Queue & Worker Pool
                  </h3>
                  <p className="text-sm text-neutral-300 leading-relaxed ">
                    Dispatches crawl tasks to a background worker queue (BullMQ & Redis), 
                    using a concurrency cap of 5 page crawl threads to crawl sites efficiently 
                    without blocking the Next.js API server event loop.
                  </p>
                </div>
                <div className="p-5 bg-neutral-900/30 border border-neutral-800 rounded-xl space-y-2 hover:border-neutral-700/60 transition-all shadow-sm">
                  <h3 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-450" />
                    Recyclable Browser Pooling
                  </h3>
                  <p className="text-sm text-neutral-300 leading-relaxed ">
                    Maintains Chromium instances through an asynchronous manager that automatically 
                    recycles the browser after 50 page loads, force-killing old processes to prevent 
                    Windows Control Flow Guard (CFG) crashes and resource/handle leaks.
                  </p>
                </div>
                <div className="p-5 bg-neutral-900/30 border border-neutral-800 rounded-xl space-y-2 hover:border-neutral-700/60 transition-all shadow-sm">
                  <h3 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-450" />
                    Incremental Request Cache
                  </h3>
                  <p className="text-sm text-neutral-300 leading-relaxed ">
                    Stores ETags and Last-Modified times to send
                    If-None-Match/If-Modified-Since headers, skipping rendering
                    and parsing for unchanged pages (304 Fast Path).
                  </p>
                </div>
                <div className="p-5 bg-neutral-900/30 border border-neutral-800 rounded-xl space-y-2 hover:border-neutral-700/60 transition-all shadow-sm">
                  <h3 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-450" />
                    Lightweight HTML-Parser First
                  </h3>
                  <p className="text-sm text-neutral-300 leading-relaxed ">
                    Evaluates page text density and hydration indicators
                    dynamically, resorting to Chromium only when JS execution is
                    flagged.
                  </p>
                </div>
                <div className="p-5 bg-neutral-900/30 border border-neutral-800 rounded-xl space-y-2 hover:border-neutral-700/60 transition-all shadow-sm">
                  <h3 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-450" />
                    Resource Request Interception
                  </h3>
                  <p className="text-sm text-neutral-300 leading-relaxed ">
                    Aborts fonts, CSS, media, and image loading inside
                    Puppeteer, reducing JS rendering cost by 60-80% while
                    retaining DOM traversal targets.
                  </p>
                </div>
                <div className="p-5 bg-neutral-900/30 border border-neutral-800 rounded-xl space-y-2 hover:border-neutral-700/60 transition-all shadow-sm">
                  <h3 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-450" />
                    Server-Sent Events Stream
                  </h3>
                  <p className="text-sm text-neutral-300 leading-relaxed ">
                    Streams live indexing statistics back to client wrappers in
                    real-time, removing REST polling routines.
                  </p>
                </div>
              </div>
            </section>

            <section id="configuration" className="scroll-mt-24">
              <div className="flex items-center gap-2.5 mb-4 group">
                <div className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg text-emerald-400">
                  <Settings size={18} />
                </div>
                <h2 className="text-2xl font-semibold text-white">
                  Configuration
                </h2>
              </div>

              <p className="text-neutral-300 leading-relaxed mb-6">
                You can configure crawling parameters using the visual knobs
                below. Customize the concurrency, page caps, and thresholds to
                instantly update the configuration module:
              </p>

              <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-5 md:p-6 space-y-6 mb-6">
                <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
                  <Settings size={14} className="text-emerald-400" />
                  <span className="text-sm font-semibold text-neutral-200">
                    Interactive Config Customizer
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-neutral-300">
                          Max Concurrency Limits
                        </span>
                        <span className="text-emerald-400 font-mono font-medium">
                          {configConcurrency} workers
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="20"
                        value={configConcurrency}
                        onChange={(e) =>
                          setConfigConcurrency(Number(e.target.value))
                        }
                        className="w-full h-1 bg-neutral-800 rounded-md appearance-none accent-emerald-500 outline-none"
                      />
                      <p className="text-sm text-neutral-400">
                        Limits concurrent page download operations.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-neutral-300">
                          Crawl Page Thresholds
                        </span>
                        <span className="text-emerald-400 font-mono font-medium">
                          {configMaxPages} pages
                        </span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="1000"
                        step="10"
                        value={configMaxPages}
                        onChange={(e) =>
                          setConfigMaxPages(Number(e.target.value))
                        }
                        className="w-full h-1 bg-neutral-800 rounded-md appearance-none accent-emerald-500 outline-none"
                      />
                      <p className="text-sm text-neutral-400">
                        Stops crawls when the count of discovered URLs hits this
                        cap limit.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-neutral-300">
                          CSR Min Content Size Check
                        </span>
                        <span className="text-emerald-400 font-mono font-medium">
                          {configMinLen} chars
                        </span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="1000"
                        step="50"
                        value={configMinLen}
                        onChange={(e) =>
                          setConfigMinLen(Number(e.target.value))
                        }
                        className="w-full h-1 bg-neutral-800 rounded-md appearance-none accent-emerald-500 outline-none"
                      />
                      <p className="text-sm text-neutral-400">
                        Heuristic scanner flags HTML below this length for
                        Chromium validation.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm text-neutral-300 font-medium">
                        Puppeteer Event Wait State
                      </label>
                      <select
                        value={configWaitUntil}
                        onChange={(e) => setConfigWaitUntil(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-800 text-sm text-neutral-200 rounded p-2 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="networkidle2">
                          networkidle2 (Recommended)
                        </option>
                        <option value="networkidle0">
                          networkidle0 (Heavy traffic)
                        </option>
                        <option value="load">load event</option>
                        <option value="domcontentloaded">
                          domcontentloaded event
                        </option>
                      </select>
                      <p className="text-sm text-neutral-400">
                        Configures when the browser marks pages ready to extract
                        links.
                      </p>
                    </div>
                  </div>

                  <div className="relative">
                    <CodeBlock
                      language="javascript"
                      code={customConfigString}
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      <footer className="border-t border-neutral-900 bg-neutral-950 mt-auto">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-neutral-400 ">
          <p>Built with Next.js • Open Source Sitemap Generator</p>
          <div className="flex gap-4">
            <Link href="/" className="hover:text-neutral-300 transition-colors">
              Generator
            </Link>
            <Link
              href="/docs"
              className="hover:text-neutral-300 transition-colors font-medium text-neutral-300"
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
