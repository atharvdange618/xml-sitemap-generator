import { NextResponse } from "next/server";
import { AppError, ErrorCode, HttpFetchError, ValidationError } from "@/types/errors";
import { classifyError, sanitizeErrorMessage } from "@/utils/errors";

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    timestamp: string;
    requestId?: string;
  };
}

export interface ApiSuccessResponse<T> {
  data: T;
  timestamp: string;
}

export function createErrorResponse(
  error: unknown,
  requestId?: string,
  customStatus?: number,
  includeDetails: boolean = process.env.NODE_ENV !== "production",
): NextResponse<ApiErrorResponse> {
  const classified = classifyError(error);

  const response: ApiErrorResponse = {
    error: {
      code: classified.code,
      message: includeDetails
        ? classified.message
        : sanitizeErrorMessage(classified.message),
      timestamp: new Date().toISOString(),
      requestId,
      ...(includeDetails && classified.context
        ? { details: classified.context as Record<string, unknown> }
        : {}),
    },
  };

  const status = customStatus || getHttpStatus(classified);

  return NextResponse.json(response, { status });
}

export function createSuccessResponse<T>(
  data: T,
  status: number = 200,
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      data,
      timestamp: new Date().toISOString(),
    },
    { status },
  );
}

function getHttpStatus(error: AppError): number {
  if (error instanceof HttpFetchError && error.statusCode) {
    return error.statusCode;
  }

  switch (error.code) {
    case ErrorCode.VALIDATION_FAILED:
    case ErrorCode.INVALID_URL:
      return 400;

    case ErrorCode.QUEUE_FULL:
      return 503;

    case ErrorCode.CRAWL_TIMEOUT:
    case ErrorCode.HTTP_TIMEOUT:
    case ErrorCode.PUPPETEER_TIMEOUT:
      return 504;

    case ErrorCode.REDIS_CONNECTION_FAILED:
    case ErrorCode.QUEUE_CONNECTION_FAILED:
      return 503;

    case ErrorCode.STORAGE_READ_FAILED:
      return 404;

    case ErrorCode.STORAGE_WRITE_FAILED:
      return 500;

    case ErrorCode.HTTP_RATE_LIMITED:
      return 429;

    default:
      return 500;
  }
}

export function createValidationError(
  message: string,
  field?: string,
  requestId?: string,
): NextResponse<ApiErrorResponse> {
  return createErrorResponse(
    new ValidationError(message, field, undefined, undefined),
    requestId,
  );
}

export function createNotFoundResponse(
  resource: string,
  requestId?: string,
): NextResponse<ApiErrorResponse> {
  return createErrorResponse(
    new AppError(
      `${resource} not found`,
      ErrorCode.STORAGE_READ_FAILED,
      "low",
      false,
    ),
    requestId,
  );
}

export function createRateLimitedResponse(
  retryAfter: number,
  requestId?: string,
): NextResponse<ApiErrorResponse> {
  const response = createErrorResponse(
    new AppError(
      "Rate limit exceeded",
      ErrorCode.HTTP_RATE_LIMITED,
      "low",
      true,
      { retryAfter },
    ),
    requestId,
  );

  response.headers.set("Retry-After", retryAfter.toString());

  return response;
}

export function createServiceUnavailableResponse(
  reason: string,
  requestId?: string,
): NextResponse<ApiErrorResponse> {
  return createErrorResponse(
    new AppError(reason, ErrorCode.QUEUE_FULL, "high", true),
    requestId,
  );
}

export interface SSEErrorEvent {
  type: "error";
  message: string;
  code: string;
  timestamp: string;
}

export function createSSEErrorEvent(error: unknown): SSEErrorEvent {
  const classified = classifyError(error);

  return {
    type: "error",
    message: classified.message,
    code: classified.code,
    timestamp: new Date().toISOString(),
  };
}
