import { Controller, Get } from "@nestjs/common";
import { ProblemException } from "../common/problem";
import { PrismaService } from "../prisma/prisma.service";

/** Rejects when the database does not answer in time, so a hung pool shows as 503 instead of a hanging probe. */
export const HEALTH_DB_TIMEOUT_MS = 3000;

export async function pingWithTimeout(ping: Promise<unknown>, ms = HEALTH_DB_TIMEOUT_MS): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([ping, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error("database ping timed out")), ms)))]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health(): Promise<{ status: "ok"; db: "ok" }> {
    try {
      await pingWithTimeout(this.prisma.$queryRaw`SELECT 1`);
    } catch {
      throw new ProblemException(503, "Service unavailable", "The database is not reachable.");
    }
    return { status: "ok", db: "ok" };
  }
}
