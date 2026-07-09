/**
 * Error severity levels for monitoring and alerting
 */
export type ErrorSeverity = "low" | "medium" | "high" | "critical";

/**
 * Error codes for programmatic error handling
 */
export enum ErrorCode {
  UNKNOWN = "UNKNOWN",

  HTTP_FETCH_FAILED = "HTTP_FETCH_FAILED",
  HTTP_TIMEOUT = "HTTP_TIMEOUT",
  HTTP_RATE_LIMITED = "HTTP_RATE_LIMITED",
  HTTP_SERVER_ERROR = "HTTP_SERVER_ERROR",
  HTTP_REDIRECT_LOOP = "HTTP_REDIRECT_LOOP",

  CRAWL_FAILED = "CRAWL_FAILED",
  CRAWL_TIMEOUT = "CRAWL_TIMEOUT",
  CRAWL_ABORTED = "CRAWL_ABORTED",
  PUPPETEER_FAILED = "PUPPETEER_FAILED",
  PUPPETEER_TIMEOUT = "PUPPETEER_TIMEOUT",

  VALIDATION_FAILED = "VALIDATION_FAILED",
  INVALID_URL = "INVALID_URL",

  QUEUE_FULL = "QUEUE_FULL",
  QUEUE_TIMEOUT = "QUEUE_TIMEOUT",
  QUEUE_CONNECTION_FAILED = "QUEUE_CONNECTION_FAILED",

  STORAGE_WRITE_FAILED = "STORAGE_WRITE_FAILED",
  STORAGE_READ_FAILED = "STORAGE_READ_FAILED",
  STORAGE_CLEANUP_FAILED = "STORAGE_CLEANUP_FAILED",

  REDIS_CONNECTION_FAILED = "REDIS_CONNECTION_FAILED",
  REDIS_COMMAND_FAILED = "REDIS_COMMAND_FAILED",
}

export class AppError extends Error {
  public readonly timestamp: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly severity: ErrorSeverity,
    public readonly retryable: boolean = false,
    public readonly context?: Record<string, unknown>,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
    this.isOperational = true;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      retryable: this.retryable,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack,
    };
  }
}

export class HttpFetchError extends AppError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly url?: string,
    context?: Record<string, unknown>,
    cause?: Error,
  ) {
    super(
      message,
      HttpFetchError.getErrorCode(statusCode),
      HttpFetchError.getSeverity(statusCode),
      HttpFetchError.isRetryable(statusCode),
      { ...context, statusCode, url },
      cause,
    );
  }

  private static getErrorCode(statusCode?: number): ErrorCode {
    if (!statusCode) return ErrorCode.HTTP_FETCH_FAILED;
    if (statusCode === 429) return ErrorCode.HTTP_RATE_LIMITED;
    if (statusCode >= 500) return ErrorCode.HTTP_SERVER_ERROR;
    return ErrorCode.HTTP_FETCH_FAILED;
  }

  private static getSeverity(statusCode?: number): ErrorSeverity {
    if (!statusCode) return "medium";
    if (statusCode === 429) return "low";
    if (statusCode >= 500) return "high";
    return "medium";
  }

  private static isRetryable(statusCode?: number): boolean {
    if (!statusCode) return true;
    return statusCode === 429 || statusCode >= 500;
  }
}

export class TimeoutError extends AppError {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly timeoutMs: number,
    context?: Record<string, unknown>,
    cause?: Error,
  ) {
    super(
      message,
      ErrorCode.CRAWL_TIMEOUT,
      "high",
      false,
      { ...context, operation, timeoutMs },
      cause,
    );
  }
}

export class AbortError extends AppError {
  constructor(
    message: string = "Operation was aborted",
    context?: Record<string, unknown>,
    cause?: Error,
  ) {
    super(message, ErrorCode.CRAWL_ABORTED, "low", false, context, cause);
  }
}

export class PuppeteerError extends AppError {
  constructor(
    message: string,
    public readonly url?: string,
    context?: Record<string, unknown>,
    cause?: Error,
  ) {
    super(
      message,
      ErrorCode.PUPPETEER_FAILED,
      "high",
      true,
      { ...context, url },
      cause,
    );
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly field?: string,
    context?: Record<string, unknown>,
    cause?: Error,
  ) {
    super(
      message,
      ErrorCode.VALIDATION_FAILED,
      "medium",
      false,
      { ...context, field },
      cause,
    );
  }
}

export class QueueError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.QUEUE_CONNECTION_FAILED,
    context?: Record<string, unknown>,
    cause?: Error,
  ) {
    super(message, code, "critical", true, context, cause);
  }
}

export class StorageError extends AppError {
  constructor(
    message: string,
    public readonly filePath?: string,
    context?: Record<string, unknown>,
    cause?: Error,
  ) {
    super(
      message,
      ErrorCode.STORAGE_WRITE_FAILED,
      "high",
      false,
      { ...context, filePath },
      cause,
    );
  }
}

export class CircuitOpenError extends AppError {
  constructor(
    message: string = "Circuit breaker is open",
    public readonly origin: string,
    context?: Record<string, unknown>,
  ) {
    super(message, ErrorCode.HTTP_FETCH_FAILED, "medium", false, {
      ...context,
      origin,
    });
  }
}
