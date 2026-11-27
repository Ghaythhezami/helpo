import { Injectable } from "@nestjs/common";
import type { Lesson, Prisma } from "@prisma/client";
import { BlueprintSchema, isLocale, type LessonDetail, type LessonSummary, type Locale, type ResourceKind, type ResourceStatus, type Translations } from "@helpo/shared";
import { notFound } from "../common/problem";
import { lessonQuotaLimit } from "../common/quota";
import { startOfMonth } from "../common/time";
import { quizQuestionCount } from "../common/stats";
import { asLocale, pickText, parseTranslations } from "../common/i18n";
import { lessonTitle, objectivesOf, toCheckView, toResourceView } from "../common/views";
import { asCurriculum } from "./lesson-context";
import { GENERATION_ORDER } from "../jobs/job-queue";
import { PrismaService } from "../prisma/prisma.service";

export const LESSON_INCLUDE = { classRoom: { select: { name: true, grade: true, band: true } } } satisfies Prisma.LessonInclude;
export type LessonWithClass = Prisma.LessonGetPayload<{ include: typeof LESSON_INCLUDE }>;

export function parseBlueprint(json: unknown) {
  const r = BlueprintSchema.safeParse(json);
  return r.success ? r.data : null;
}

/** GET /lessons/:id/status: what the web app polls while a kit is generating (one query, no content). */
export interface LessonStatusView {
  status: Lesson["status"];
  resources: { kind: ResourceKind; status: ResourceStatus; progress: number; error: string | null }[];
  translations: Translations;
  updatedAt: string;
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

  /**
   * Lightweight poll target: lesson status, per-resource progress and translation state. ONE query (the resources are
   * a nested select without their JSON content), teacher-scoped. `updatedAt` is the latest change of the lesson or any
   * resource, so clients can skip a refetch of the full lesson when it has not moved.
   */
  async status(teacherId: string, id: string): Promise<LessonStatusView> {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id, teacherId },
      select: {
        status: true,
        updatedAt: true,
        contentLocale: true,
        translationStatus: true,
        resources: { select: { kind: true, status: true, progress: true, error: true, updatedAt: true } },
      },
    });
    if (!lesson) throw notFound("Lesson");
    const order: string[] = [...GENERATION_ORDER];
    const resources = [...lesson.resources].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    const updatedAt = Math.max(lesson.updatedAt.getTime(), ...resources.map((r) => r.updatedAt.getTime()));
    return {
      status: lesson.status,
      resources: resources.map((r) => ({ kind: r.kind, status: r.status, progress: r.progress, error: r.error })),
      translations: parseTranslations(lesson.translationStatus, asLocale(lesson.contentLocale)),
      updatedAt: new Date(updatedAt).toISOString(),
    };
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
      curriculum: asCurriculum(lesson.curriculum),
      translations,
    };
  }

  async quota(teacherId: string): Promise<{ used: number; limit: number }> {
    const [used, user] = await Promise.all([
      this.prisma.lesson.count({ where: { teacherId, createdAt: { gte: startOfMonth() } } }),
      this.prisma.user.findUnique({ where: { id: teacherId }, select: { email: true } }),
    ]);
    return { used, limit: lessonQuotaLimit(user?.email) };
  }

  /**
   * Average score (0..1) of the latest finished live quiz for each lesson. Bounded reads: a plain list of sessions
   * (no answers), then ONE grouped count of the answers of just the latest session per lesson. It used to load every
   * answer row of every ended session of every lesson, plus every quiz's full content.
   */
  async averages(lessonIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const sessions = await this.prisma.activitySession.findMany({
      where: { lessonId: { in: lessonIds }, type: "LIVE_QUIZ", status: "ENDED" },
      orderBy: { endedAt: "desc" },
      select: { id: true, lessonId: true },
    });
    const latest = new Map<string, string>(); // lessonId -> newest ended session
    for (const s of sessions) if (!latest.has(s.lessonId)) latest.set(s.lessonId, s.id);
    if (latest.size === 0) return out;
    const [groups, quizzes] = await Promise.all([
      this.prisma.answer.groupBy({ by: ["sessionId", "participantId", "correct", "partial"], where: { sessionId: { in: [...latest.values()] } }, _count: { _all: true } }),
      this.prisma.resource.findMany({ where: { lessonId: { in: [...latest.keys()] }, kind: "QUIZ" }, select: { lessonId: true, contentEn: true, contentAr: true } }),
    ]);
    const counts = new Map(quizzes.map((q) => [q.lessonId, quizQuestionCount(q.contentEn ?? q.contentAr)]));
    // per session, per participant: correct answers score 1, partial 0.5 (the same rule as studentScore)
    const scores = new Map<string, Map<string, number>>();
    for (const g of groups) {
      const per = scores.get(g.sessionId) ?? new Map<string, number>();
      per.set(g.participantId, (per.get(g.participantId) ?? 0) + g._count._all * (g.correct ? 1 : g.partial ? 0.5 : 0));
      scores.set(g.sessionId, per);
    }
    for (const [lessonId, sessionId] of latest) {
      const per = scores.get(sessionId);
      const questions = counts.get(lessonId) ?? 0;
      if (!per || per.size === 0 || questions <= 0) continue;
      out.set(lessonId, [...per.values()].reduce((sum, v) => sum + v / questions, 0) / per.size);
    }
    return out;
  }
}
