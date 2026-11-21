import { Injectable } from "@nestjs/common";
import type { AdminOverview } from "@helpo/shared";
import { isDemoMode } from "../ai/ai.provider";
import { pickText } from "../common/i18n";
import { selectDrivers } from "../jobs/job-queue";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(env: NodeJS.ProcessEnv = process.env): Promise<AdminOverview> {
    const p = this.prisma;
    const [schools, teachers, classes, students, lessons, sessions, answers, byStatus, byModel, recentLessons, recentSessions] = await Promise.all([
      p.school.count(),
      p.user.count(),
      p.classRoom.count(),
      p.student.count(),
      p.lesson.count(),
      p.activitySession.count(),
      p.answer.count(),
      p.lesson.groupBy({ by: ["status"], _count: { _all: true } }),
      p.resource.groupBy({ by: ["model"], where: { model: { not: null } }, _count: { _all: true }, _sum: { tokensIn: true, tokensOut: true } }),
      p.lesson.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { id: true, titleEn: true, titleAr: true, status: true, createdAt: true, teacher: { select: { name: true } } } }),
      p.activitySession.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { id: true, type: true, joinCode: true, status: true, createdAt: true, _count: { select: { participants: true } } } }),
    ]);
    const models = byModel.map((m) => ({ model: m.model ?? "unknown", resources: m._count._all, tokensIn: m._sum.tokensIn ?? 0, tokensOut: m._sum.tokensOut ?? 0 }));
    const drivers = selectDrivers(env);
    return {
      totals: { schools, teachers, classes, students, lessons, sessions, answers },
      lessonsByStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
      ai: {
        resources: models.reduce((n, m) => n + m.resources, 0),
        tokensIn: models.reduce((n, m) => n + m.tokensIn, 0),
        tokensOut: models.reduce((n, m) => n + m.tokensOut, 0),
        byModel: models,
      },
      recentLessons: recentLessons.map((l) => ({ id: l.id, title: pickText(l.titleEn, l.titleAr, "en") ?? "", teacherName: l.teacher.name, status: l.status, createdAt: l.createdAt.toISOString() })),
      recentSessions: recentSessions.map((s) => ({ id: s.id, type: s.type, joinCode: s.joinCode, status: s.status, joined: s._count.participants, createdAt: s.createdAt.toISOString() })),
      runtime: { queueDriver: drivers.queue, realtime: drivers.realtime, aiMode: isDemoMode(env) ? "demo" : "claude", demoLogin: env.DEMO_LOGIN === "true" },
    };
  }
}
