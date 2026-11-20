import { Controller, Get } from "@nestjs/common";
import { ProblemException } from "../common/problem";
import { PrismaService } from "../prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health(): Promise<{ status: "ok"; db: "ok" }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ProblemException(503, "Service unavailable", "The database is not reachable.");
    }
    return { status: "ok", db: "ok" };
  }
}
