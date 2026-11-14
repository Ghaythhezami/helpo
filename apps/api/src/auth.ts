import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";

const secret = process.env.BETTER_AUTH_SECRET;
const baseURL = process.env.BETTER_AUTH_URL;
const teacherURL = process.env.TEACHER_URL;

if (!process.env.DATABASE_URL || !secret || secret.length < 32 || !baseURL || !teacherURL) {
  throw new Error("Set DATABASE_URL, BETTER_AUTH_URL, TEACHER_URL, and a BETTER_AUTH_SECRET of at least 32 characters.");
}

export const prisma = new PrismaClient();
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret,
  baseURL,
  trustedOrigins: [teacherURL],
  emailAndPassword: { enabled: true },
});
