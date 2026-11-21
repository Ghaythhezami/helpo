import "dotenv/config";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { createApp } from "./bootstrap";
import { initSentry } from "./observability/sentry";

/**
 * Long-running host (Railway, local): HTTP on PORT. With WORKER_ONLY=true only the queue workers start (no HTTP
 * listener). The Vercel handler lives in vercel.ts.
 */
async function main() {
  initSentry();
  if (process.env.WORKER_ONLY === "true") {
    const app = await NestFactory.createApplicationContext(AppModule);
    app.enableShutdownHooks();
    new Logger("Worker").log("WORKER_ONLY: queue workers started, no HTTP listener");
    return;
  }
  const app = await createApp();
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3001), "0.0.0.0");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
