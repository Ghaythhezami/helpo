import type { Server } from "node:http";

/**
 * Slow-client and idle-connection limits (Node's defaults leave `server.timeout` unlimited). A 20 MB upload fits
 * well inside `requestTimeout`; keep-alive stays above the usual 60 s load-balancer idle timeout to avoid 502s.
 */
export const HTTP_TIMEOUTS = { requestTimeout: 120_000, headersTimeout: 65_000, keepAliveTimeout: 61_000 } as const;

export function tuneHttpServer(server: Pick<Server, "requestTimeout" | "headersTimeout" | "keepAliveTimeout">): void {
  server.requestTimeout = HTTP_TIMEOUTS.requestTimeout;
  server.headersTimeout = HTTP_TIMEOUTS.headersTimeout;
  server.keepAliveTimeout = HTTP_TIMEOUTS.keepAliveTimeout;
}

/** TRUST_PROXY_HOPS (1–3, default 1): how many reverse proxies sit in front of the API, so `req.ip` is the client. */
export function trustProxyHops(value = process.env.TRUST_PROXY_HOPS): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isInteger(n) && n >= 1 && n <= 3 ? n : 1;
}
