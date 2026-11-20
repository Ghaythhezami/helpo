import { Logger } from "@nestjs/common";
import { waitUntil } from "@vercel/functions";

const logger = new Logger("Background");

/**
 * Runs work after the response is sent. On Vercel `waitUntil` keeps the function alive (up to maxDuration);
 * elsewhere a detached promise with a catch is enough.
 */
export function runInBackground(work: Promise<unknown>): void {
  const guarded = work.catch((e: unknown) => logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e)));
  if (process.env.VERCEL) waitUntil(guarded);
}
