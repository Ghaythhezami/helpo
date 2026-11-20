import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "./bootstrap";
import { initSentry } from "./observability/sentry";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

/** Bootstrapped once per function instance, then reused (cold start only pays once). */
let cached: Promise<Handler> | undefined;

function boot(): Promise<Handler> {
  cached ??= (async () => {
    initSentry();
    const app = await createApp();
    await app.init();
    return app.getHttpAdapter().getInstance() as Handler;
  })().catch((e: unknown) => {
    cached = undefined; // allow a retry on the next invocation
    throw e;
  });
  return cached;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await boot();
  app(req, res);
}
