import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { Response } from "express";
import type { Problem } from "@helpo/shared";
import { ProblemException } from "./problem";
import { AiError } from "../ai/errors";
import { captureError } from "../observability/sentry";

const TITLES: Record<number, string> = {
  400: "Bad request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not found",
  409: "Conflict",
  413: "Payload too large",
  422: "Unprocessable content",
  429: "Too many requests",
  500: "Internal server error",
  502: "Bad gateway",
  503: "Service unavailable",
};

const typeUri = (status: number) => `https://nibras.app/problems/${status}`;

/** Builds the RFC 9457 body for any thrown value. Exported for unit tests. */
export function toProblem(exception: unknown): Problem {
  if (exception instanceof ProblemException) {
    return {
      title: exception.title,
      status: exception.getStatus(),
      detail: exception.detail,
      errors: exception.errors,
      ...Object.fromEntries(Object.entries(exception.extensions ?? {}).filter(([k]) => k !== "retryAfter")),
      // an extension `type` is a bare slug such as "checks-open"
      type: typeof exception.extensions?.type === "string" ? `https://nibras.app/problems/${exception.extensions.type}` : typeUri(exception.getStatus()),
    };
  }
  if (exception instanceof AiError) {
    return { type: `https://nibras.app/problems/${exception.code}`, title: exception.title, status: exception.status, detail: exception.message };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const body = exception.getResponse();
    const detail = typeof body === "string" ? body : (body as { message?: string | string[] }).message;
    return {
      type: typeUri(status),
      title: TITLES[status] ?? "Error",
      status,
      detail: Array.isArray(detail) ? detail.join("; ") : detail,
    };
  }
  return { type: typeUri(500), title: TITLES[500], status: 500, detail: "Something went wrong on the Nibras side. Please try again." };
}

/** Seconds for the `Retry-After` header of a 429 (RFC 6585); a `retryAfter` extension is header-only, not a body member. */
export function retryAfterSeconds(exception: unknown): number {
  const v = exception instanceof ProblemException ? exception.extensions?.retryAfter : undefined;
  return typeof v === "number" && v > 0 ? v : 60;
}

@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger("ProblemFilter");

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const problem: Problem & { requestId?: string } = toProblem(exception);
    const requestId = (res.req as { requestId?: string } | undefined)?.requestId;
    if (requestId) problem.requestId = requestId;
    if (problem.status >= 500) captureError(exception);
    if (problem.status >= 500) this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    if (problem.status === 429) res.setHeader("Retry-After", String(retryAfterSeconds(exception)));
    res.status(problem.status).type("application/problem+json").send(problem);
  }
}
