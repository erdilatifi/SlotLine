import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { Catch, HttpException, Logger } from "@nestjs/common";
import type { Request, Response } from "express";

export abstract class DomainError extends Error {
  abstract readonly httpStatus: number;
  abstract readonly code: string;
}

export class ValidationError extends DomainError {
  readonly httpStatus = 400;
  readonly code = "VALIDATION_FAILED";
}

export class UnauthenticatedError extends DomainError {
  readonly httpStatus = 401;
  readonly code = "UNAUTHENTICATED";
}

export class NotFoundError extends DomainError {
  readonly httpStatus = 404;
  readonly code = "RESOURCE_NOT_FOUND";
}

export class ForbiddenError extends DomainError {
  readonly httpStatus = 403;
  readonly code = "INSUFFICIENT_ROLE";
}

export class ConflictError extends DomainError {
  readonly httpStatus = 409;
  readonly code = "CONFLICT";
}

/**
 * Postgres reports an exclusion-constraint violation as code 23P01, nested
 * inside Prisma's driver-adapter error wrapper — confirmed by triggering
 * the constraint directly and inspecting the actual error shape, not
 * assumed. Used wherever a table's exclusion constraint (bookings, holds)
 * is the thing enforcing correctness.
 */
export function isExclusionViolation(err: unknown): boolean {
  const cause = (err as { meta?: { driverAdapterError?: { cause?: { code?: string } } } })?.meta
    ?.driverAdapterError?.cause;
  return cause?.code === "23P01";
}

/** Maps a framework HTTP status to a stable machine-readable code. */
const STATUS_CODES: Record<number, string> = {
  400: "VALIDATION_FAILED",
  401: "UNAUTHENTICATED",
  403: "INSUFFICIENT_ROLE",
  404: "RESOURCE_NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED",
};

/** Clients branch on `code`, never on `message`. */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("UnhandledError");

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request & { id?: string }>();

    if (exception instanceof DomainError) {
      response
        .status(exception.httpStatus)
        .json({ code: exception.code, message: exception.message });
      return;
    }

    // Anything Nest itself throws (throttling, unmatched routes, payload
    // limits) already carries the right status — passing it through keeps
    // those from collapsing into an indistinguishable 500.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json({
        code: STATUS_CODES[status] ?? "REQUEST_FAILED",
        message: exception.message,
      });
      return;
    }

    // The only place an unexpected error is seen at all. Logging the stack
    // against the request's correlation id, and handing that id back, is
    // what turns "the site broke" into a line someone can actually find.
    const requestId = request.id ?? "unknown";
    this.logger.error(
      `Unhandled error on request ${requestId}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(500).json({
      code: "INTERNAL_ERROR",
      message: "Something went wrong",
      requestId,
    });
  }
}
