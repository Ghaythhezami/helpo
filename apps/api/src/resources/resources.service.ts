import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { playableTemplates, type GameContent, type GameKind, type Locale, type ResourceView, type SessionTeacherView, type ShareBody } from "@helpo/shared";
import type { z } from "zod";
import { AI_PROVIDER, type AiProvider, type RewriteAction } from "../ai/ai.provider";
import { CONTENT_SCHEMAS, contentProblems, type ResourceContent } from "../ai/content";
import { AiOutputError } from "../ai/errors";
import { ProblemException, badRequest, conflict, notFound } from "../common/problem";
import { SessionsService } from "../sessions/sessions.service";
import { asLocale, parseTranslations, suffix } from "../common/i18n";
import { contentOf, toResourceView } from "../common/views";
import { lessonContext } from "../lessons/lesson-context";
import { LESSON_INCLUDE } from "../lessons/lesson-view.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    private readonly sessions: SessionsService,
  ) {}

  private async owned(teacherId: string, id: string) {
    const r = await this.prisma.resource.findFirst({ where: { id, lesson: { teacherId } }, include: { lesson: { include: LESSON_INCLUDE } } });
    if (!r) throw notFound("Resource");
    return r;
  }

  /** The language the teacher is editing: the request locale when that content exists, else the fallback language. */
  private target(r: { contentEn: unknown; contentAr: unknown }, locale: Locale): Locale {
    return contentOf(r as never, locale).locale ?? locale;
  }

  private translations(lesson: { contentLocale: string; translationStatus: unknown }) {
    return parseTranslations(lesson.translationStatus, asLocale(lesson.contentLocale));
  }

  /** Teacher edits: the content is re-validated with the kind's schema and written to the edited language's column. */
  async update(teacherId: string, id: string, content: unknown, locale: Locale): Promise<ResourceView> {
    const r = await this.owned(teacherId, id);
    const parsed = CONTENT_SCHEMAS[r.kind].safeParse(content);
    if (!parsed.success) {
      throw new ProblemException(
        400,
        "Validation failed",
        `That ${r.kind.toLowerCase()} content is not valid.`,
        parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }
    const col = `content${suffix(this.target(r, locale))}`;
    // A teacher edit is a new version; version 1 is the AI original and is kept so it can be restored.
    const next = r.version + 1;
    await this.prisma.resourceVersion.upsert({
      where: { resourceId_version: { resourceId: r.id, version: r.version } },
      create: { resourceId: r.id, version: r.version, source: "AI", contentEn: r.contentEn ?? Prisma.DbNull, contentAr: r.contentAr ?? Prisma.DbNull },
      update: {},
    });
    const saved = await this.prisma.resource.update({
      where: { id: r.id },
      data: { [col]: parsed.data as unknown as Prisma.InputJsonValue, status: "READY", error: null, version: next } as Prisma.ResourceUpdateInput,
    });
    await this.prisma.resourceVersion.create({
      data: { resourceId: r.id, version: next, source: "TEACHER", contentEn: saved.contentEn ?? Prisma.DbNull, contentAr: saved.contentAr ?? Prisma.DbNull },
    });
    return toResourceView(saved, locale, this.translations(r.lesson));
  }

  /** POST /resources/:id/revert: restores an earlier version as a NEW version (history is never rewritten). */
  async revert(teacherId: string, id: string, version: number, locale: Locale): Promise<ResourceView> {
    const r = await this.owned(teacherId, id);
    const old = await this.prisma.resourceVersion.findUnique({ where: { resourceId_version: { resourceId: r.id, version } } });
    if (!old) throw notFound("Version");
    const next = r.version + 1;
    const saved = await this.prisma.resource.update({
      where: { id: r.id },
      data: { contentEn: old.contentEn ?? Prisma.DbNull, contentAr: old.contentAr ?? Prisma.DbNull, version: next, status: "READY", error: null },
    });
    await this.prisma.resourceVersion.create({
      data: { resourceId: r.id, version: next, source: "TEACHER", contentEn: old.contentEn ?? Prisma.DbNull, contentAr: old.contentAr ?? Prisma.DbNull },
    });
    return toResourceView(saved, locale, this.translations(r.lesson));
  }

  /**
   * POST /resources/:id/share: sharing is the approval. The lesson is approved when no checks are OPEN, or when
   * `approveAnyway` is true; otherwise 409 `checks-open` with the count. Returns the session with link and QR.
   */
  async share(teacherId: string, id: string, body: z.infer<typeof ShareBody>, locale: Locale): Promise<SessionTeacherView> {
    const r = await this.owned(teacherId, id);
    const quizKind = r.kind === "QUIZ" && (body.mode === "LIVE_QUIZ" || body.mode === "ASSIGNMENT");
    const gameKind = r.kind === "GAME" && (body.mode === "GAME" || body.mode === "ASSIGNMENT");
    if (!quizKind && !gameKind) throw badRequest(`A ${r.kind.toLowerCase()} cannot be shared as ${body.mode}.`);
    if (!r.lesson.approvedAt) {
      if (r.lesson.status !== "READY" && r.lesson.status !== "PARTIAL") throw conflict("Generate the kit before sharing it.");
      if (!body.approveAnyway) {
        const open = await this.prisma.aiCheck.count({ where: { lessonId: r.lessonId, status: "OPEN" } });
        if (open > 0) {
          throw new ProblemException(409, "Checks still open", `${open} AI check${open === 1 ? " is" : "s are"} still open. Review them, or share anyway.`, undefined, { type: "checks-open", openChecks: open });
        }
      }
      await this.prisma.lesson.update({ where: { id: r.lessonId }, data: { approvedAt: new Date() } });
    }
    return this.sessions.create(
      teacherId,
      { lessonId: r.lessonId, type: body.mode, game: body.game, dueAt: body.dueAt, namesHidden: true },
      locale,
      { expiresInHours: body.expiresInHours, leaderboard: body.leaderboard, games: gameKind ? this.publishedGames(r, body, locale) : undefined },
    );
  }

  /**
   * The games a share publishes (`games`: e.g. 2 of 6 when there are 10 minutes). Each must be playable with this lesson's
   * game content and suit the class band; the 100 points are split among them (see splitGamePoints).
   */
  private publishedGames(r: { kind: string; contentEn: unknown; contentAr: unknown; lesson: { classRoom: { band: "EXPLORER" | "NAVIGATOR" | "STUDIO" } } }, body: z.infer<typeof ShareBody>, locale: Locale): GameKind[] | undefined {
    if (!body.games?.length) return undefined;
    const content = contentOf<GameContent>(r as never, locale).content;
    const playable = content ? playableTemplates(content, r.lesson.classRoom.band) : [];
    const unique = [...new Set(body.games)];
    const missing = unique.filter((g) => !playable.includes(g));
    if (missing.length) throw badRequest(`These games cannot be played with this lesson: ${missing.join(", ")}.`);
    return unique;
  }

  async rewrite(teacherId: string, id: string, text: string, action: RewriteAction, locale: Locale, language?: string): Promise<{ text: string }> {
    const r = await this.owned(teacherId, id);
    return { text: await this.ai.rewrite(lessonContext(r.lesson, this.target(r, locale)), text, action, language) };
  }

  async change(teacherId: string, id: string, request: string, locale: Locale): Promise<{ summary: string; resource: ResourceView }> {
    const r = await this.owned(teacherId, id);
    const picked = contentOf<ResourceContent>(r, locale);
    if (r.status !== "READY" || !picked.content) throw badRequest("This resource is not ready to change yet.");
    const out = await this.ai.changeRequest(lessonContext(r.lesson, picked.locale ?? locale), r.kind, picked.content, request);
    const parsed = CONTENT_SCHEMAS[r.kind].safeParse(out.content);
    if (!parsed.success || contentProblems(r.kind, parsed.data).length) throw new AiOutputError("The change did not produce valid content, so nothing was changed.");
    const col = `content${suffix(picked.locale ?? locale)}`;
    const saved = await this.prisma.resource.update({ where: { id: r.id }, data: { [col]: parsed.data as unknown as Prisma.InputJsonValue } as Prisma.ResourceUpdateInput });
    return { summary: out.summary, resource: toResourceView(saved, locale, this.translations(r.lesson)) };
  }
}
