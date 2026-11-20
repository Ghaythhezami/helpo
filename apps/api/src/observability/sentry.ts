import * as Sentry from "@sentry/node";

let enabled = false;

/** Optional error reporting: only active when SENTRY_DSN is set. */
export function initSentry(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!env.SENTRY_DSN || enabled) return enabled;
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV ?? "development", tracesSampleRate: Number(env.SENTRY_TRACES_SAMPLE_RATE ?? 0.05) });
  enabled = true;
  return true;
}

export const sentryEnabled = () => enabled;

/** Best effort: never throws, does nothing without a DSN. */
export function captureError(error: unknown): void {
  if (enabled) Sentry.captureException(error);
}
