/**
 * Metrics collector for monitoring and observability
 */

export interface Metrics {
  crawlsStarted: number;
  crawlsCompleted: number;
  crawlsFailed: number;
  crawlsDuration: number[];

  urlsProcessed: number;
  urlsFailed: number;
  urlsRetried: number;

  averageCrawlDuration: number;
  p95CrawlDuration: number;

  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
}

/**
 * Timer utility for measuring operation duration
 */
export class Timer {
  private startTime: number;

  constructor(_label?: string) {
    this.startTime = performance.now();
  }

  stop(): number {
    const duration = performance.now() - this.startTime;
    return duration;
  }
}

/**
 * Metrics collector singleton
 */
export class MetricsCollector {
  private static instance: MetricsCollector;

  private crawlsStarted: number = 0;
  private crawlsCompleted: number = 0;
  private crawlsFailed: number = 0;
  private crawlsDuration: number[] = [];

  private urlsProcessed: number = 0;
  private urlsFailed: number = 0;
  private urlsRetried: number = 0;

  private timers: Map<string, number> = new Map();

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  /**
   * Increment counter
   */
  increment(name: string, value: number = 1): void {
    switch (name) {
      case "crawls.started":
        this.crawlsStarted += value;
        break;
      case "crawls.completed":
        this.crawlsCompleted += value;
        break;
      case "crawls.failed":
        this.crawlsFailed += value;
        break;
      case "urls.processed":
        this.urlsProcessed += value;
        break;
      case "urls.failed":
        this.urlsFailed += value;
        break;
      case "urls.retried":
        this.urlsRetried += value;
        break;
    }
  }

  /**
   * Record crawl duration
   */
  recordCrawlDuration(duration: number): void {
    this.crawlsDuration.push(duration);

    if (this.crawlsDuration.length > 100) {
      this.crawlsDuration.shift();
    }
  }

  /**
   * Start a timer
   */
  startTimer(name: string): void {
    this.timers.set(name, performance.now());
  }

  /**
   * Stop a timer and return duration in ms
   */
  stopTimer(name: string): number {
    const start = this.timers.get(name);
    if (start === undefined) {
      return 0;
    }

    const duration = performance.now() - start;
    this.timers.delete(name);
    return duration;
  }

  /**
   * Calculate percentile
   */
  private percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;

    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get all metrics
   */
  getMetrics(): Metrics {
    const averageCrawlDuration =
      this.crawlsDuration.length > 0
        ? this.crawlsDuration.reduce((a, b) => a + b, 0) /
          this.crawlsDuration.length
        : 0;

    return {
      crawlsStarted: this.crawlsStarted,
      crawlsCompleted: this.crawlsCompleted,
      crawlsFailed: this.crawlsFailed,
      crawlsDuration: this.crawlsDuration,

      urlsProcessed: this.urlsProcessed,
      urlsFailed: this.urlsFailed,
      urlsRetried: this.urlsRetried,

      averageCrawlDuration,
      p95CrawlDuration: this.percentile(this.crawlsDuration, 95),

      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    };
  }

  /**
   * Get formatted metrics summary
   */
  getSummary(): string {
    const metrics = this.getMetrics();

    return [
      `Uptime: ${(metrics.uptime / 60).toFixed(1)} minutes`,
      `Crawls: ${metrics.crawlsStarted} started, ${metrics.crawlsCompleted} completed, ${metrics.crawlsFailed} failed`,
      `URLs: ${metrics.urlsProcessed} processed, ${metrics.urlsFailed} failed, ${metrics.urlsRetried} retried`,
      `Avg Duration: ${(metrics.averageCrawlDuration / 1000).toFixed(2)}s`,
      `P95 Duration: ${(metrics.p95CrawlDuration / 1000).toFixed(2)}s`,
      `Memory: ${(metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(1)}MB used`,
    ].join("\n");
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.crawlsStarted = 0;
    this.crawlsCompleted = 0;
    this.crawlsFailed = 0;
    this.crawlsDuration = [];
    this.urlsProcessed = 0;
    this.urlsFailed = 0;
    this.urlsRetried = 0;
    this.timers.clear();
  }
}

export const metrics = MetricsCollector.getInstance();
