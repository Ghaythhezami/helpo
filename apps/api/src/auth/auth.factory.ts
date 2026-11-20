import type { PrismaClient } from "@prisma/client";
import { allowedOrigins } from "../common/origins";

/**
 * Better Auth ships as ESM. This file is compiled as CommonJS (module Node16), so `import()` stays a real
 * dynamic import and the module is loaded asynchronously: Nest awaits the AUTH provider at bootstrap.
 */
export async function createAuth(prisma: PrismaClient) {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!secret || secret.length < 32 || !baseURL) {
    throw new Error("Set BETTER_AUTH_URL and a BETTER_AUTH_SECRET of at least 32 characters.");
  }
  const { betterAuth } = await import("better-auth");
  const { prismaAdapter } = await import("better-auth/adapters/prisma");
  return betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    secret,
    baseURL,
    trustedOrigins: [...new Set([...allowedOrigins(), baseURL])],
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
  });
}

export type Auth = Awaited<ReturnType<typeof createAuth>>;

export async function loadNodeHandler(auth: Auth) {
  const { toNodeHandler } = await import("better-auth/node");
  return toNodeHandler(auth);
}

export const AUTH = Symbol("BETTER_AUTH");
