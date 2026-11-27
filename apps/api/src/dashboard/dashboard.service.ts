import { Injectable } from "@nestjs/common";
import type { DashboardView, Locale } from "@helpo/shared";
import { toClassSummary } from "../common/views";
import { startOfIsoWeek } from "../common/time";
import { classesWeekXp } from "../common/xp";
import { LESSON_INCLUDE, LessonViewService } from "../lessons/lesson-view.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lessons: LessonViewService,
  ) {}

  async get(teacher: { id: string; name: string }, locale: Locale): Promise<DashboardView> {
    const now = new Date();
    const weekStart = startOfIsoWeek(now);
    const [user, classes, recent, ready] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: teacher.id }, select: { school: { select: { name: true } } } }),
      this.prisma.classRoom.findMany({ where: { teacherId: teacher.id }, orderBy: [{ grade: "asc" }, { name: "asc" }], include: { _count: { select: { students: true } } } }),
      this.prisma.lesson.findMany({ where: { teacherId: teacher.id }, include: LESSON_INCLUDE, orderBy: { createdAt: "desc" }, take: 6 }),
      this.prisma.lesson.findMany({
        where: { teacherId: teacher.id, status: { in: ["READY", "PARTIAL"] } },
        include: { ...LESSON_INCLUDE, sessions: { select: { id: true }, take: 1 } },
        orderBy: [{ createdAt: "desc" }],
        take: 20,
      }),
    ]);

    const weekXp = await classesWeekXp(this.prisma, classes.map((c) => c.id), now);
    const quest = classes
      .map((c) => ({ c, earned: weekXp.get(c.id) ?? 0 }))
      .filter((x) => x.earned > 0)
      .sort((a, b) => b.earned - a.earned)[0];

    // Next lesson: the oldest ready lesson nobody has taught yet; otherwise the newest ready one.
    const untaught = ready.filter((l) => l.sessions.length === 0).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    const nextRaw = untaught ?? ready[0] ?? null;

    // ONE summaries() call covers the recent lessons and the next lesson (it used to cost a second 3-query call when
    // the next lesson was not among the six most recent).
    const wanted = nextRaw && !recent.some((l) => l.id === nextRaw.id) ? [...recent, nextRaw] : recent;
    const all = await this.lessons.summaries(wanted, locale);
    const summaries = all.slice(0, recent.length);
    const next = nextRaw ? (all.find((s) => s.id === nextRaw.id) ?? null) : null;

    const [kitsMade, liveQuizzes, xpAgg] = await Promise.all([
      this.prisma.lesson.count({ where: { teacherId: teacher.id, status: { in: ["READY", "PARTIAL"] }, generationFinishedAt: { gte: weekStart } } }),
      this.prisma.activitySession.count({ where: { lesson: { teacherId: teacher.id }, type: "LIVE_QUIZ", createdAt: { gte: weekStart } } }),
      this.prisma.xpEvent.aggregate({ where: { classId: { in: classes.map((c) => c.id) }, createdAt: { gte: weekStart } }, _sum: { amount: true } }),
    ]);

    return {
      teacherName: teacher.name,
      schoolName: user?.school?.name ?? null,
      today: now.toISOString().slice(0, 10),
      nextLesson: next,
      classes: classes.map((c) => toClassSummary(c, locale)),
      recentLessons: summaries.slice(0, 5),
      classQuest: quest ? { classId: quest.c.id, className: quest.c.name, goalXp: quest.c.weeklyGoalXp, earnedXp: quest.earned } : null,
      kitCheckStreak: await this.kitCheckStreak(teacher.id),
      weekRecap: { kitsMade, liveQuizzes, xpEarned: xpAgg._sum.amount ?? 0 },
    };
  }

  /** Consecutive ready kits (newest first) whose AI checks are all reviewed; kits still under review are skipped. */
  private async kitCheckStreak(teacherId: string): Promise<number> {
    const lessons = await this.prisma.lesson.findMany({
      where: { teacherId, status: { in: ["READY", "PARTIAL"] } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { checks: { select: { status: true } } },
    });
    let streak = 0;
    let started = false;
    for (const l of lessons) {
      const open = l.checks.some((c) => c.status === "OPEN");
      if (open && !started) continue;
      if (open) break;
      started = true;
      streak += 1;
    }
    return streak;
  }
}
