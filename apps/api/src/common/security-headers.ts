import type { NextFunction, Request, Response } from "express";

/**
 * Baseline response headers for a JSON API (the usual Helmet set that applies without a CSP-bearing HTML app).
 * Mounted first so every response, including errors and Better Auth, carries them.
 */
export function securityHeaders(env: NodeJS.ProcessEnv = process.env) {
  const hsts = env.NODE_ENV === "production";
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    if (hsts) res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    next();
  };
}
