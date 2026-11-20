import { Injectable } from "@nestjs/common";
import type { Lesson, Prisma } from "@prisma/client";
import { BlueprintSchema, LIMITS, isLocale, type LessonDetail, type LessonSummary, type Locale } from "@helpo/shared";
import { notFound } from "../common/problem";
import { startOfMonth } from "../common/time";
import { quizQuestionCount, sessionAverage } from "../common/stats";
import { asLocale, pickText, parseTranslations } from "../common/i18n";
import { lessonTitle, objectivesOf, toCheckView, toResourceView } from "../common/views";
import { PrismaService } from "../prisma/prisma.service";

export const LESSON_INCLUDE = { classRoom: { select: { name: true, grade: true, band: true } } } satisfies Prisma.LessonInclude;
export type LessonWithClass = Prisma.LessonGetPayload<{ include: typeof LESSON_INCLUDE }>;

export function parseBlueprint(json: unknown) {
  const r = BlueprintSchema.safeParse(json);
  return r.success ? r.data : null;
}

/** Builds LessonSummary / LessonDetail views. Every lookup is scoped by teacherId. */
@Injectable()
export class LessonViewService {
  constructor(private readonly prisma: PrismaService) {}

  async findOwned(teacherId: string, id: string): Promise<LessonWithClass> {
    const lesson = await this.prisma.lesson.findFirst({ where: { id, teacherId }, include: LESSON_INCLUDE });
    if (!lesson) throw notFound("Lesson");
    return lesson;
  }

  async summaries(lessons: LessonWithClass[], locale: Locale): Promise<LessonSummary[]> {
    if (lessons.length === 0) return [];
    const ids = lessons.map((l) => l.id);
    const [open, averages] = await Promise.all([
      this.prisma.aiCheck.groupBy({ by: ["lessonId"], where: { lessonId: { in: ids }, status: "OPEN" }, _count: { _all: true } }),
      this.averages(ids),
    ]);
    const openBy = new Map(open.map((o) => [o.lessonId, o._count._all]));
    return lessons.map((l) => this.toSummary(l, openBy.get(l.id) ?? 0, averages.get(l.id) ?? null, locale));
  }

  async summary(lesson: LessonWithClass, locale: Locale): Promise<LessonSummary> {
    return (await this.summaries([lesson], locale))[0];
  }

  toSummary(l: Lesson & { classRoom: { name: string } }, openChecks: number, averageScore: number | null, locale: Locale): LessonSummary {
    return {
      id: l.id,
      classId: l.classId,
      className: l.classRoom.name,
      title: lessonTitle(l, locale),
      unitTitle: pickText(l.unitTitleEn, l.unitTitleAr, locale),
      lessonNumber: l.lessonNumber,
      status: l.status,
      openChecks,
      createdAt: l.createdAt.toISOString(),
      averageScore,
    };
  }

  async detail(teacherId: string, id: string, locale: Locale): Promise<LessonDetail> {
    const lesson = await this.findOwned(teacherId, id);
    return this.detailOf(lesson, locale);
  }

  async detailOf(lesson: LessonWithClass, locale: Locale): Promise<LessonDetail> {
    const [resources, checks, summary] = await Promise.all([
      this.prisma.resource.findMany({ where: { lessonId: lesson.id }, orderBy: { createdAt: "asc" } }),
      this.prisma.aiCheck.findMany({ where: { lessonId: lesson.id }, orderBy: { createdAt: "asc" } }),
      this.summary(lesson, locale),
    ]);
    const contentLocale = asLocale(lesson.contentLocale);
    const translations = parseTranslations(lesson.translationStatus, contentLocale);
    const kindOrder = ["SLIDES", "WORKSHEET", "QUIZ", "GAME", "CARDS"];
    resources.sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind));
    const started = lesson.generationStartedAt;
    const finished = lesson.generationFinishedAt;
    return {
      ...summary,
      durationMin: lesson.durationMin,
      language: lesson.language,
      standard: lesson.standard,
      objectives: objectivesOf(lesson, locale),
      sourceFileName: lesson.sourceFileName,
      sourceChars: lesson.sourceText?.length ?? 0,
      band: lesson.classRoom.band,
      grade: lesson.classRoom.grade,
      resources: resources.map((r) => toResourceView(r, locale, translations)),
      checks: checks.map((c) => toCheckView(c, locale)),
      trace:
        lesson.tracedStatements !== null && lesson.totalStatements !== null
          ? { traced: lesson.tracedStatements, total: lesson.totalStatements }
          : null,
      generation: {
        startedAt: started?.toISOString() ?? null,
        finishedAt: finished?.toISOString() ?? null,
        seconds: started && finished ? Math.round((finished.getTime() - started.getTime()) / 1000) : null,
      },
      blueprint: parseBlueprint(lesson.blueprint),
      prompt: lesson.prompt,
      aiWritten: lesson.aiWritten,
      detectedLanguage: lesson.sourceLocale,
      tokenCount: lesson.tokenCount,
      approvedAt: lesson.approvedAt?.toISOString() ?? null,
      quota: await this.quota(lesson.teacherId),
      source:
        lesson.sourceText || lesson.sourceFileName
          ? {
              fileName: lesson.sourceFileName,
              type: lesson.sourceType,
              pages: lesson.sourcePages,
              chars: lesson.sourceText?.length ?? 0,
              detectedLocale: isLocale(lesson.sourceLocale) ? lesson.sourceLocale : null,
              sha256: lesson.sourceSha256,
            }
          : null,
      contentLocale,
      translations,
    };
  }

  async quota(teacherId: string): Promise<{ used: number; limit: number }> {
    const used = await this.prisma.lesson.count({ where: { teacherId, createdAt: { gte: startOfMonth() } } });
    return { used, limit: Number(process.env.MONTHLY_LESSON_QUOTA) || LIMITS.monthlyLessonQuota };
  }

  /** Average score (0..1) of the latest finished live quiz for each lesson. */
  async averages(lessonIds: string[]): Promise<Map<string, number>> {
    const [sessions, quizzes] = await Promise.all([
      this.prisma.activitySession.findMany({
        where: { lessonId: { in: lessonIds }, type: "LIVE_QUIZ", status: "ENDED" },
        orderBy: { endedAt: "desc" },
        select: { lessonId: true, answers: { select: { participantId: true, questionIndex: true, correct: true, partial: true } } },
      }),
      this.prisma.resource.findMany({ where: { lessonId: { in: lessonIds }, kind: "QUIZ" }, select: { lessonId: true, contentEn: true, contentAr: true } }),
    ]);
    const counts = new Map(quizzes.map((q) => [q.lessonId, quizQuestionCount(q.contentEn ?? q.contentAr)]));
    const out = new Map<string, number>();
    for (const s of sessions) {
      if (out.has(s.lessonId)) continue;
      const avg = sessionAverage(s.answers, counts.get(s.lessonId) ?? 0);
      if (avg !== null) out.set(s.lessonId, avg);
    }
    return out;
  }
}
