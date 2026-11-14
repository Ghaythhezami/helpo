import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { toNodeHandler } from "better-auth/node";
import express from "express";
import { AppModule } from "./app.module.js";
import { auth, prisma } from "./auth.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.enableCors({ origin: process.env.TEACHER_URL, credentials: true });
  const server = app.getHttpAdapter().getInstance() as express.Express;
  server.all("/api/auth/{*path}", toNodeHandler(auth));
  server.use(express.json());
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3001));
}

process.on("SIGTERM", () => { void prisma.$disconnect(); });
process.on("SIGINT", () => { void prisma.$disconnect(); });
void bootstrap();
