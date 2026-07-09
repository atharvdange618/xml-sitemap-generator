import {
  AppError,
  ErrorCode,
  ErrorSeverity,
  TimeoutError,
  AbortError,
  PuppeteerError,
} from "@/types/errors";

/**
 * Classify an unknown error into an AppError
 */
export function classifyError(
  error: unknown,
  context?: Record<string, unknown>,
): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return convertNativeError(error, context);
  }

  if (typeof error === "string") {
    return new AppError(error, ErrorCode.UNKNOWN, "medium", true, context);
  }

  return new AppError(
    `Unknown error: ${String(error)}`,
    ErrorCode.UNKNOWN,
    "medium",
    true,
    { ...context, originalError: error },
  );
}

/**
 * Convert native Error to appropriate AppError subclass
 */
function convertNativeError(
  error: Error,
  context?: Record<string, unknown>,
): AppError {
  const name = error.name.toLowerCase();
  const message = error.message.toLowerCase();

  if (name === "aborterror" || message.includes("abort")) {
    return new AbortError(error.message, context, error);
  }

  if (
    name === "timeouterror" ||
    name === "timeout" ||
    message.includes("timeout")
  ) {
    return new TimeoutError(error.message, "unknown", 0, context, error);
  }

  const networkErrors = [
    "econnrefused",
    "econnreset",
    "econnaborted",
    "enetunreach",
    "etimedout",
    "enotfound",
  ];
  if (networkErrors.some((e) => name.includes(e) || message.includes(e))) {
    return new AppError(
      error.message,
      ErrorCode.HTTP_FETCH_FAILED,
      "medium",
      true,
      context,
      error,
    );
  }

  if (
    name.includes("puppeteer") ||
    message.includes("page") ||
    message.includes("browser")
  ) {
    return new PuppeteerError(error.message, undefined, context, error);
  }

  return new AppError(
    error.message,
    ErrorCode.UNKNOWN,
    "medium",
    true,
    context,
    error,
  );
}

/**
 * Check if an error is retryable
 */
export function isErrorRetryable(error: unknown): boolean {
  const classified = classifyError(error);
  return classified.retryable;
}

/**
 * Get error severity for monitoring/alerting
 */
export function getErrorSeverity(error: unknown): ErrorSeverity {
  const classified = classifyError(error);
  return classified.severity;
}

/**
 * Get error code for programmatic handling
 */
export function getErrorCode(error: unknown): ErrorCode {
  if (error instanceof AppError) {
    return error.code;
  }
  return ErrorCode.UNKNOWN;
}

/**
 * Check if error is operational (expected) vs programming error
 */
export function isOperationalError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Convert AppError to JSON for logging/API responses
 */
export function errorToJSON(error: unknown): Record<string, unknown> {
  const classified = classifyError(error);
  return classified.toJSON();
}

/**
 * Create a safe error message (removes sensitive info)
 */
export function sanitizeErrorMessage(error: unknown): string {
  const classified = classifyError(error);

  let message = classified.message;

  message = message.replace(
    /\/(?:home|usr|var|etc|tmp|opt|root|Users|Documents)[^\s]*/gi,
    "/[PATH]",
  );

  message = message.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, "[IP]");

  message = message.replace(/\/\/[^:]+:[^@]+@/g, "//***:***@");

  return message;
}

/**
 * Group errors by code for summary reporting
 */
export function groupErrorsByCode(errors: unknown[]): Map<ErrorCode, number> {
  const groups = new Map<ErrorCode, number>();

  for (const error of errors) {
    const code = getErrorCode(error);
    groups.set(code, (groups.get(code) || 0) + 1);
  }

  return groups;
}

/**
 * Get critical errors from a list
 */
export function getCriticalErrors(errors: unknown[]): AppError[] {
  return errors
    .map((e) => classifyError(e))
    .filter((e) => e.severity === "critical");
}
