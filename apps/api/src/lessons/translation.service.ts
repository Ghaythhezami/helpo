import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { otherLocale, type LessonDetail, type Locale, type ResourceKind, type Translations } from "@helpo/shared";
import { AI_PROVIDER, type AiProvider, type CheckText } from "../ai/ai.provider";
import { CONTENT_SCHEMAS, type ResourceContent } from "../ai/content";
import { runInBackground } from "../common/background";
import { parseTranslations, pickText, suffix, asLocale } from "../common/i18n";
import { conflict } from "../common/problem";
import { objectivesOf } from "../common/views";
import { PrismaService } from "../prisma/prisma.service";
import { lessonContext } from "./lesson-context";
import { LessonViewService } from "./lesson-view.service";

/**
 * Dynamic translation: fills the other language's columns (title, objectives, resources, checks).
 * translationStatus[to] goes missing -> working -> ready (back to missing if anything failed).
 */
@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly views: LessonViewService,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  async start(teacherId: string, lessonId: string, to: Locale, locale: Locale): Promise<LessonDetail> {
    const lesson = await this.views.findOwned(teacherId, lessonId);
    if (lesson.status === "GENERATING") throw conflict("Wait for the kit to finish generating before translating.");
    const current = parseTranslations(lesson.translationStatus, asLocale(lesson.contentLocale));
    if (current[to] === "working") return this.views.detailOf(lesson, locale);
    await this.setStatus(lesson.id, current, to, "working");
    runInBackground(this.run(lesson.id, to));
    return this.views.detail(teacherId, lessonId, locale);
  }

  private async setStatus(lessonId: string, current: Translations, to: Locale, state: Translations[Locale]): Promise<void> {
    await this.prisma.lesson.update({ where: { id: lessonId }, data: { translationStatus: { ...current, [to]: state } as unknown as Prisma.InputJsonValue } });
  }

  /** Background job. Never throws. */
  async run(lessonId: string, to: Locale): Promise<void> {
    const from = otherLocale(to);
    const fromSfx = suffix(from);
    const toSfx = suffix(to);
    let ok = false;
    try {
      const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: { classRoom: { select: { name: true, grade: true, band: true } } } });
      if (!lesson) return;
      const ctx = lessonContext(lesson, from);
      // Every job is settled the moment it is created so a rejection can never go unhandled.
      const settle = (name: string, p: Promise<unknown>): Promise<string | null> =>
        p.then(
          () => null,
          (e: unknown) => {
            this.logger.warn(`Translating ${name} of lesson ${lessonId} (${fromSfx} to ${toSfx}) failed: ${e instanceof Error ? e.message : String(e)}`);
            return name;
          },
        );
      const outcomes: Promise<string | null>[] = [];

      const metaJob = this.ai
        .translateMeta(
          {
            title: pickText(lesson.titleEn, lesson.titleAr, from) ?? "",
            unitTitle: pickText(lesson.unitTitleEn, lesson.unitTitleAr, from),
            description: pickText(lesson.descriptionEn, lesson.descriptionAr, from),
            objectives: objectivesOf(lesson, from),
          },
          ctx,
          to,
        )
        .then((m) =>
          this.prisma.lesson.update({
            where: { id: lessonId },
            data: {
              [`title${toSfx}`]: m.title,
              [`unitTitle${toSfx}`]: m.unitTitle,
              [`description${toSfx}`]: m.description,
              [`objectives${toSfx}`]: m.objectives as unknown as Prisma.InputJsonValue,
            } as Prisma.LessonUpdateInput,
          }),
        );
      outcomes.push(settle("lesson", metaJob));

      const resources = await this.prisma.resource.findMany({ where: { lessonId, status: "READY" } });
      const resourceJobs = resources.map((r) => settle(r.kind, (async () => {
        const source = (from === "en" ? r.contentEn : r.contentAr) as unknown as ResourceContent | null;
        if (!source) return;
        const out = await this.ai.translateContent(r.kind as ResourceKind, source, ctx, to);
        const parsed = CONTENT_SCHEMAS[r.kind as ResourceKind].safeParse(out);
        if (!parsed.success) throw new Error(`${r.kind} translation did not match the schema`);
        await this.prisma.resource.update({ where: { id: r.id }, data: { [`content${toSfx}`]: parsed.data as unknown as Prisma.InputJsonValue } as Prisma.ResourceUpdateInput });
      })()));
      outcomes.push(...resourceJobs);

      const checkJob = settle("checks", (async () => {
        const checks = await this.prisma.aiCheck.findMany({ where: { lessonId } });
        const texts: CheckText[] = checks.map((c) => ({
          itemRef: c.itemRef,
          message: (from === "en" ? c.messageEn : c.messageAr) ?? "",
          suggestion: (from === "en" ? c.suggestionEn : c.suggestionAr) ?? null,
        }));
        const out = await this.ai.translateChecks(texts, ctx, to);
        await this.prisma.$transaction(
          checks.map((c, i) =>
            this.prisma.aiCheck.update({
              where: { id: c.id },
              data: { [`message${toSfx}`]: out[i]?.message ?? null, [`suggestion${toSfx}`]: out[i]?.suggestion ?? null } as Prisma.AiCheckUpdateInput,
            }),
          ),
        );
      })());
      outcomes.push(checkJob);

      const failures = (await Promise.all(outcomes)).filter((x): x is string => x !== null);
      ok = failures.length === 0;
    } catch (e) {
      this.logger.error(`Translation crashed for lesson ${lessonId}: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      const fresh = await this.prisma.lesson.findUnique({ where: { id: lessonId }, select: { translationStatus: true, contentLocale: true } });
      const current = parseTranslations(fresh?.translationStatus, asLocale(fresh?.contentLocale));
      await this.setStatus(lessonId, current, to, ok ? "ready" : "missing");
    } catch (e) {
      this.logger.error(`Could not record translation state for lesson ${lessonId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
