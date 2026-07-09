import { AppError, ErrorCode } from "@/types/errors";

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4,
}

/**
 * Structured log entry
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  levelName: string;
  message: string;
  context?: string;
  jobId?: string;
  url?: string;
  duration?: number;
  error?: {
    name: string;
    code: string;
    message: string;
    severity: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
  enableJson: boolean;
  prefix?: string;
}

/**
 * Structured logger with child logger support
 */
export class Logger {
  private static instance: Logger;
  private config: LoggerConfig;
  private parentContext?: string;
  private parentMetadata?: Record<string, unknown>;

  constructor(
    config?: Partial<LoggerConfig>,
    parentContext?: string,
    parentMetadata?: Record<string, unknown>,
  ) {
    this.config = {
      minLevel: process.env.LOG_LEVEL
        ? parseInt(process.env.LOG_LEVEL, 10)
        : LogLevel.INFO,
      enableConsole: true,
      enableJson: process.env.NODE_ENV === "production",
      ...config,
    };
    this.parentContext = parentContext;
    this.parentMetadata = parentMetadata;
  }

  /**
   * Get singleton logger instance
   */
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Create a child logger with persistent context
   */
  child(context: string, metadata?: Record<string, unknown>): Logger {
    return new Logger(
      this.config,
      this.parentContext ? `${this.parentContext}:${context}` : context,
      { ...this.parentMetadata, ...metadata },
    );
  }

  /**
   * Log debug message
   */
  debug(
    message: string,
    context?: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.log(LogLevel.DEBUG, message, context, undefined, metadata);
  }

  /**
   * Log info message
   */
  info(
    message: string,
    context?: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.log(LogLevel.INFO, message, context, undefined, metadata);
  }

  /**
   * Log warning message
   */
  warn(
    message: string,
    context?: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.log(LogLevel.WARN, message, context, undefined, metadata);
  }

  /**
   * Log error message
   */
  error(
    message: string,
    error?: AppError | Error | unknown,
    context?: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.log(LogLevel.ERROR, message, context, error, metadata);
  }

  /**
   * Log critical error message
   */
  critical(
    message: string,
    error?: AppError | Error | unknown,
    context?: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.log(LogLevel.CRITICAL, message, context, error, metadata);
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    context?: string,
    error?: AppError | Error | unknown,
    metadata?: Record<string, unknown>,
  ): void {
    if (level < this.config.minLevel) {
      return;
    }

    const entry = this.createLogEntry(level, message, context, error, metadata);

    if (this.config.enableConsole) {
      this.writeToConsole(entry);
    }

    if (this.config.enableJson) {
      this.writeToJson(entry);
    }
  }

  /**
   * Create structured log entry
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: string,
    error?: AppError | Error | unknown,
    metadata?: Record<string, unknown>,
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      levelName: LogLevel[level],
      message,
      context: this.getContext(context),
      metadata: this.getMetadata(metadata),
    };

    if (error) {
      entry.error = this.formatError(error);
    }

    return entry;
  }

  /**
   * Build context string with parent context
   */
  private getContext(context?: string): string | undefined {
    const parts: string[] = [];

    if (this.config.prefix) {
      parts.push(this.config.prefix);
    }

    if (this.parentContext) {
      parts.push(this.parentContext);
    }

    if (context) {
      parts.push(context);
    }

    return parts.length > 0 ? parts.join(":") : undefined;
  }

  /**
   * Merge parent metadata with entry metadata
   */
  private getMetadata(
    metadata?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!this.parentMetadata && !metadata) {
      return undefined;
    }
    return { ...this.parentMetadata, ...metadata };
  }

  /**
   * Format error for log entry
   */
  private formatError(error: AppError | Error | unknown): LogEntry["error"] {
    if (error instanceof AppError) {
      return {
        name: error.name,
        code: error.code,
        message: error.message,
        severity: error.severity,
        stack: error.stack,
      };
    }

    if (error instanceof Error) {
      return {
        name: error.name,
        code: ErrorCode.UNKNOWN,
        message: error.message,
        severity: "medium",
        stack: error.stack,
      };
    }

    return {
      name: "Unknown",
      code: ErrorCode.UNKNOWN,
      message: String(error),
      severity: "medium",
    };
  }

  /**
   * Write log entry to console
   */
  private writeToConsole(entry: LogEntry): void {
    const contextStr = entry.context ? `[${entry.context}]` : "";
    const prefix = `${entry.timestamp} ${entry.levelName} ${contextStr}`;
    const message = `${prefix} ${entry.message}`;

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(message, entry.metadata || "");
        break;
      case LogLevel.INFO:
        console.log(message, entry.metadata || "");
        break;
      case LogLevel.WARN:
        console.warn(message, entry.metadata || "");
        break;
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        console.error(message, entry.error || "", entry.metadata || "");
        break;
    }
  }

  /**
   * Write log entry as JSON (for production)
   */
  private writeToJson(entry: LogEntry): void {
    const json = JSON.stringify(entry);

    switch (entry.level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        process.stdout.write(json + "\n");
        break;
      case LogLevel.WARN:
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        process.stderr.write(json + "\n");
        break;
    }
  }

  /**
   * Timer utility for measuring operation duration
   */
  timer(label: string): () => number {
    const start = performance.now();

    return () => {
      const duration = performance.now() - start;
      this.debug(`Timer ${label}`, undefined, { duration });
      return duration;
    };
  }
}

/**
 * Create a job-scoped logger
 */
export function createJobLogger(jobId: string): Logger {
  return Logger.getInstance().child("job", { jobId });
}

/**
 * Create a crawler-scoped logger
 */
export function createCrawlerLogger(url?: string): Logger {
  return Logger.getInstance().child("crawler", url ? { url } : undefined);
}

// Export singleton instance
export const logger = Logger.getInstance();
