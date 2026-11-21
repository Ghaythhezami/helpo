import { Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const REQUEST_ID_HEADER = "x-request-id";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RequestWithId = Request & { requestId?: string };

/** An incoming id is only trusted when it is a valid UUID (it ends up in logs and responses); otherwise a new one is made. */
export function resolveRequestId(incoming: string | string[] | undefined): string {
  const value = Array.isArray(incoming) ? incoming[0] : incoming;
  return value && UUID.test(value) ? value.toLowerCase() : randomUUID();
}

/** The route pattern ("/api/lessons/:id"), never the raw URL: ids, codes and query strings stay out of the logs. */
export function routePattern(req: Pick<Request, "baseUrl" | "route">): string {
  const path = (req.route as { path?: string } | undefined)?.path;
  return path ? `${req.baseUrl ?? ""}${path}` : "unmatched";
}

/** Paths that are polled by load balancers and would drown the access log. */
export const isQuietPath = (url: string | undefined): boolean => (url ?? "").split("?")[0] === "/api/health";

export interface AccessLine {
  method: string;
  route: string;
  status: number;
  ms: number;
  requestId: string;
}

const logger = new Logger("Access");

/**
 * Correlation id plus one structured access line per request: method, route pattern, status, duration and the id.
 * No IP, no body, no query string, no cookies and no student names are ever logged.
 */
export function requestContext(write: (line: AccessLine) => void = (l) => logger.log(JSON.stringify(l))) {
  return (req: RequestWithId, res: Response, next: NextFunction) => {
    const requestId = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    const started = process.hrtime.bigint();
    if (!isQuietPath(req.originalUrl ?? req.url)) {
      res.on("finish", () => {
        write({ method: req.method, route: routePattern(req), status: res.statusCode, ms: Math.round(Number(process.hrtime.bigint() - started) / 1e6), requestId });
      });
    }
    next();
  };
}
