import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import express from "express";
import { AppModule } from "./app.module";
import { AUTH, loadNodeHandler } from "./auth/auth.factory";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { LOCALE_HEADER } from "@helpo/shared";
import { mountBullBoard } from "./admin/bull-board";
import { BullMqJobQueue } from "./jobs/bullmq.queue";
import { JobQueue, selectDrivers } from "./jobs/job-queue";
import { allowedOrigins } from "./common/origins";
import { trustProxyHops, tuneHttpServer } from "./common/http-server";
import { securityHeaders } from "./common/security-headers";

/**
 * Builds the Nest app (used by main.ts locally and by the Vercel entry).
 * Order matters: Better Auth reads the raw body, so it is mounted BEFORE express.json().
 */
export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, logger: process.env.NODE_ENV === "test" ? false : ["error", "warn", "log"] });
  app.setGlobalPrefix("api");
  const server = app.getHttpAdapter().getInstance() as express.Express;
  // Proxy hops in front of the API: Railway edge (1); browser traffic also passes the Vercel rewrite (2 in production).
  server.set("trust proxy", trustProxyHops());
  server.disable("x-powered-by");
  server.use(securityHeaders());
  tuneHttpServer(app.getHttpServer());
  app.enableCors({
    origin: allowedOrigins(),
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", LOCALE_HEADER],
  });
  if (selectDrivers().realtime === "socket") app.useWebSocketAdapter(new IoAdapter(app)); // Socket.IO on the same port
  server.all("/api/auth/{*path}", await loadNodeHandler(app.get(AUTH)));
  const queue = app.get(JobQueue);
  if (queue instanceof BullMqJobQueue) mountBullBoard(server, queue, app.get(AUTH)); // /admin/queues, ADMIN_EMAILS only
  server.use(express.json({ limit: "1mb" }));
  return app;
}
