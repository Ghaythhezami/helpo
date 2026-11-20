import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma, type ResourceKind as DbKind } from "@prisma/client";
import { LIMITS, RESOURCE_KINDS, type LessonDetail, type Locale, type ResourceKind } from "@helpo/shared";
import { AI_PROVIDER, type AiProvider, type GenerateOptions, type LessonContext } from "../ai/ai.provider";
import { countStatements, type ResourceContent } from "../ai/content";
import { AiError } from "../ai/errors";
import { generateWithRepair } from "../ai/generators";
import { asLocale, initialTranslations, pickJson, writeCol } from "../common/i18n";
import { badRequest } from "../common/problem";
import { EventBus, JobQueue, type GenerationJob } from "../jobs/job-queue";
import { PrismaService } from "../prisma/prisma.service";
import { lessonContext } from "./lesson-context";
import { LessonViewService } from "./lesson-view.service";

const STALE_GENERATION_MS = LIMITS.jobTimeoutMs * 4;

/** What one click generates; stored on the lesson (`generationOptions`). */
export interface GenerationOptions {
  resources?: ResourceKind[];
  quizCount?: number;
  difficulty?: "easy" | "medium" | "hard";
  autoGenerate?: boolean;
  /** The teacher gave no title: the blueprint's title replaces the provisional one after analysis. */
  autoTitle?: boolean;
}

export function readOptions(json: unknown): GenerationOptions {
  return json && typeof json === "object" ? (json as GenerationOptions) : {};
}

/**
 * Generation flow: claim the lesson atomically (a double click starts nothing twice), set GENERATING + WAITING rows,
 * return 202, then generate all kinds in parallel (inline) or as a BullMQ flow. Each resource moves WAITING ->
 * WORKING -> READY/FAILED with progress, tokens and prompt version persisted. Checks and the final status run once
 * every resource has finished. Everything is written to the lesson's contentLocale columns.
 */
@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly views: LessonViewService,
    private readonly queue: JobQueue,
    private readonly events: EventBus,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {
    this.queue.registerGeneration({
      run: (job) => this.run(job.lessonId, job.kinds, job.replaceAllChecks),
      generateKind: (lessonId, kind, opts) => this.generateKind(lessonId, kind, opts),
      finalize: (job) => this.finalize(job),
    });
  }

  /** POST /lessons/:id/generate. Options in the body replace the stored ones. */
  async start(teacherId: string, lessonId: string, locale: Locale, body?: GenerationOptions): Promise<LessonDetail> {
    const lesson = await this.views.findOwned(teacherId, lessonId);
    await this.startInternal(lesson.id, body);
    return this.views.detail(teacherId, lessonId, locale);
  }

  /** Also used by the pipeline (autoGenerate). Returns false when a generation is already running. */
  async startInternal(lessonId: string, body?: GenerationOptions): Promise<boolean> {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: { classRoom: { select: { name: true, grade: true, band: true } } } });
    if (!lesson) return false;
    const stored = readOptions(lesson.generationOptions);
    const options: GenerationOptions = { ...stored, ...body };
    const kinds = (options.resources?.length ? options.resources : lesson.requestedKinds.length ? lesson.requestedKinds : [...RESOURCE_KINDS]) as ResourceKind[];
    const cl = asLocale(lesson.contentLocale);

    // Atomic claim: only one caller flips the lesson to GENERATING (idempotent double click).
    const stale = new Date(Date.now() - STALE_GENERATION_MS);
    const claimed = await this.prisma.lesson.updateMany({
      where: { id: lesson.id, OR: [{ status: { not: "GENERATING" } }, { generationStartedAt: { lt: stale } }] },
      data: {
        status: "GENERATING",
        generationStartedAt: new Date(),
        generationFinishedAt: null,
        tracedStatements: null,
        totalStatements: null,
        approvedAt: null, // a fresh kit needs a fresh approval
        cancelRequested: false,
        requestedKinds: kinds as DbKind[],
        generationOptions: options as unknown as Prisma.InputJsonValue,
        translationStatus: initialTranslations(cl) as unknown as Prisma.InputJsonValue,
      },
    });
    if (claimed.count === 0) return false;

    await this.prisma.$transaction([
      this.prisma.aiCheck.deleteMany({ where: { lessonId: lesson.id } }),
      // a regenerated kit starts a new history: version 1 is the new AI original
      this.prisma.resourceVersion.deleteMany({ where: { resource: { lessonId: lesson.id, kind: { in: kinds as DbKind[] } } } }),
      ...kinds.map((kind) =>
        this.prisma.resource.upsert({
          where: { lessonId_kind: { lessonId: lesson.id, kind } },
          create: { lessonId: lesson.id, kind, status: "WAITING" },
          update: { status: "WAITING", contentEn: Prisma.DbNull, contentAr: Prisma.DbNull, error: null, progress: 0, version: 1, tokensIn: 0, tokensOut: 0, promptVersion: null, model: null },
        }),
      ),
    ]);
    this.events.emit(`lesson:${lesson.id}`, "lesson.status", { lessonId: lesson.id, status: "GENERATING" });
    // Queue workers read the blueprint from the database, so it must exist before the jobs are queued.
    if (this.queue.driver === "bullmq") await this.ensureBlueprint(lessonContext(lesson, cl), lesson.id);
    await this.queue.enqueueGeneration({ lessonId: lesson.id, kinds, replaceAllChecks: true });
    return true;
  }

  async retry(teacherId: string, lessonId: string, kind: ResourceKind, locale: Locale): Promise<LessonDetail> {
    if (!RESOURCE_KINDS.includes(kind)) throw badRequest("Unknown resource kind.");
    const lesson = await this.views.findOwned(teacherId, lessonId);
    await this.prisma.$transaction([
      this.prisma.resourceVersion.deleteMany({ where: { resource: { lessonId: lesson.id, kind } } }),
      this.prisma.lesson.update({
        where: { id: lesson.id },
        data: {
          status: "GENERATING",
          generationStartedAt: new Date(),
          generationFinishedAt: null,
          approvedAt: null,
          cancelRequested: false,
          translationStatus: initialTranslations(asLocale(lesson.contentLocale)) as unknown as Prisma.InputJsonValue,
        },
      }),
      this.prisma.resource.upsert({
        where: { lessonId_kind: { lessonId: lesson.id, kind } },
        create: { lessonId: lesson.id, kind, status: "WAITING" },
        update: { status: "WAITING", contentEn: Prisma.DbNull, contentAr: Prisma.DbNull, error: null, progress: 0, version: 1 },
      }),
    ]);
    await this.queue.enqueueGeneration({ lessonId: lesson.id, kinds: [kind], replaceAllChecks: false });
    return this.views.detail(teacherId, lessonId, locale);
  }

  /** POST /lessons/:id/cancel: running generators stop before their next resource; queued jobs are removed. */
  async cancel(teacherId: string, lessonId: string, locale: Locale): Promise<LessonDetail> {
    const lesson = await this.views.findOwned(teacherId, lessonId);
    await this.prisma.lesson.update({ where: { id: lesson.id }, data: { cancelRequested: true } });
    await this.queue.cancel(lesson.id);
    return this.views.detail(teacherId, lessonId, locale);
  }

  /** Inline driver: the whole flow. Never throws: failures are recorded on the rows (and the lesson is marked FAILED). */
  async run(lessonId: string, kinds: ResourceKind[], replaceAllChecks: boolean): Promise<void> {
    try {
      const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: { classRoom: { select: { name: true, grade: true, band: true } } } });
      if (!lesson) return;
      const ctx = await this.ensureBlueprint(lessonContext(lesson, asLocale(lesson.contentLocale)), lessonId);
      await Promise.all(kinds.map((k) => this.queue.guard(`${lessonId}:${k}`, () => this.runKind(ctx, lessonId, k, { final: true }))));
      await this.finalize({ lessonId, kinds, replaceAllChecks });
    } catch (e) {
      this.logger.error(`Generation crashed for lesson ${lessonId}: ${e instanceof Error ? e.message : String(e)}`);
      await this.prisma.lesson
        .update({ where: { id: lessonId }, data: { status: "FAILED", generationFinishedAt: new Date() } })
        .catch(() => undefined);
    }
  }

  /** Queue child job `generate.{kind}`: loads the lesson (and its stored blueprint) and generates one resource. */
  async generateKind(lessonId: string, kind: ResourceKind, opts: { final: boolean; onProgress?: (percent: number) => void | Promise<void> }): Promise<void> {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: { classRoom: { select: { name: true, grade: true, band: true } } } });
    if (!lesson) return;
    await this.runKind(lessonContext(lesson, asLocale(lesson.contentLocale)), lessonId, kind, opts);
  }

  /**
   * One resource, through the repair loop. With `final` false a failure is thrown (the queue retries with backoff);
   * with `final` true it is recorded on the row and the lesson carries on (PARTIAL).
   */
  private async runKind(ctx: LessonContext, lessonId: string, kind: ResourceKind, opts: { final: boolean; onProgress?: (percent: number) => void | Promise<void> }): Promise<void> {
    const cl = ctx.locale;
    const where = { lessonId_kind: { lessonId, kind } };
    const lessonRow = await this.prisma.lesson.findUnique({ where: { id: lessonId }, select: { cancelRequested: true, generationOptions: true } });
    if (lessonRow?.cancelRequested) {
      await this.prisma.resource.update({ where, data: { status: "FAILED", error: "Cancelled by the teacher.", progress: 0 } });
      return;
    }
    const options = readOptions(lessonRow?.generationOptions);
    const genOptions: GenerateOptions = { quizCount: options.quizCount, difficulty: options.difficulty };
    await this.prisma.resource.update({ where, data: { status: "WORKING", error: null, progress: 5 } });
    this.events.emit(`lesson:${lessonId}`, "resource.progress", { lessonId, kind, percent: 5 });
    try {
      const out = await generateWithRepair(this.ai, kind, ctx, genOptions, {
        lessonId,
        onAttempt: async (attempt) => {
          const percent = Math.min(90, 5 + attempt * 30);
          await this.prisma.resource.update({ where, data: { progress: percent } });
          await opts.onProgress?.(percent);
          this.events.emit(`lesson:${lessonId}`, "resource.progress", { lessonId, kind, percent });
        },
      });
      const saved = await this.prisma.resource.update({
        where,
        data: {
          status: "READY",
          ...(writeCol("content", cl, out.content as unknown as Prisma.InputJsonValue) as object),
          error: null,
          progress: 100,
          version: 1,
          promptVersion: out.usage.promptVersion,
          model: out.usage.model,
          tokensIn: out.usage.tokensIn,
          tokensOut: out.usage.tokensOut,
        },
      });
      await this.prisma.resourceVersion.upsert({
        where: { resourceId_version: { resourceId: saved.id, version: 1 } },
        create: { resourceId: saved.id, version: 1, source: "AI", ...(writeCol("content", cl, out.content as unknown as Prisma.InputJsonValue) as object) },
        update: { source: "AI", ...(writeCol("content", cl, out.content as unknown as Prisma.InputJsonValue) as object) },
      });
      this.events.emit(`lesson:${lessonId}`, "resource.ready", { lessonId, kind, resourceId: saved.id });
    } catch (e) {
      this.logger.warn(`${kind} failed for lesson ${lessonId}: ${e instanceof Error ? e.message : String(e)}`);
      if (!opts.final) throw e;
      const failed = await this.prisma.resource.update({ where, data: { status: "FAILED", error: friendlyError(e), progress: 0 } });
      this.events.emit(`lesson:${lessonId}`, "resource.failed", { lessonId, kind, resourceId: failed?.id, error: friendlyError(e) });
    }
  }

  /** Queue parent job `finalize`: review checks, trace counts, and the lesson's final status. */
  async finalize(job: GenerationJob): Promise<void> {
    const { lessonId, kinds, replaceAllChecks } = job;
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: { classRoom: { select: { name: true, grade: true, band: true } } } });
    if (!lesson) return;
    const cl = asLocale(lesson.contentLocale);
    await this.runChecks(lessonId, lessonContext(lesson, cl), cl, kinds, replaceAllChecks);
    const all = await this.prisma.resource.findMany({ where: { lessonId }, select: { status: true } });
    const failed = all.filter((r) => r.status === "FAILED").length;
    const status = lessonStatusFor(failed, all.length);
    await this.prisma.lesson.update({ where: { id: lessonId }, data: { status, generationFinishedAt: new Date() } });
    this.events.emit(`lesson:${lessonId}`, "lesson.status", { lessonId, status });
  }

  /** The single analysis call: all five generators read the same blueprint. Skipped when it is already stored. */
  private async ensureBlueprint(ctx: LessonContext, lessonId: string): Promise<LessonContext> {
    if (ctx.blueprint) return ctx;
    try {
      const blueprint = await this.ai.analyze(ctx);
      await this.prisma.lesson.update({
        where: { id: lessonId },
        data: {
          blueprint: blueprint as unknown as Prisma.InputJsonValue,
          ...(ctx.objectives.length ? {} : (writeCol("objectives", ctx.locale, blueprint.objectives as unknown as Prisma.InputJsonValue) as object)),
        },
      });
      return { ...ctx, blueprint, objectives: ctx.objectives.length ? ctx.objectives : blueprint.objectives };
    } catch (e) {
      this.logger.warn(`Analysis failed for lesson ${lessonId}, generating without a blueprint: ${e instanceof Error ? e.message : String(e)}`);
      return ctx;
    }
  }

  private async runChecks(lessonId: string, ctx: LessonContext, cl: Locale, kinds: ResourceKind[], replaceAll: boolean): Promise<void> {
    // Review against everything that is ready now (including resources kept from earlier runs).
    const ready = await this.prisma.resource.findMany({ where: { lessonId, status: "READY" }, select: { kind: true, contentEn: true, contentAr: true } });
    const content: Partial<Record<ResourceKind, ResourceContent>> = {};
    for (const r of ready) {
      const c = pickJson<ResourceContent>(r.contentEn, r.contentAr, cl).value;
      if (c) content[r.kind as ResourceKind] = c;
    }
    if (!content.QUIZ && !content.WORKSHEET) return;
    try {
      const checks = await this.ai.generateChecks(ctx, content);
      const refresh = replaceAll ? null : new Set<ResourceKind>(kinds);
      const kept = refresh ? checks.filter((c) => refresh.has(c.resource)) : checks;
      await this.prisma.$transaction([
        this.prisma.aiCheck.deleteMany({ where: { lessonId, ...(refresh ? { resource: { in: [...refresh] as DbKind[] } } : {}) } }),
        this.prisma.aiCheck.createMany({
          data: kept.map((c) => ({
            lessonId,
            resource: c.resource,
            itemRef: c.itemRef,
            kind: c.kind,
            ...(writeCol("message", cl, c.message) as object),
            ...(writeCol("suggestion", cl, c.suggestion) as object),
            sourcePage: c.sourcePage,
          })),
        }),
      ]);
      const total = (["QUIZ", "WORKSHEET"] as const).reduce((n, k) => n + (content[k] ? countStatements(k, content[k]) : 0), 0);
      const open = await this.prisma.aiCheck.count({ where: { lessonId } });
      await this.prisma.lesson.update({ where: { id: lessonId }, data: { totalStatements: total, tracedStatements: Math.max(0, total - open) } });
    } catch (e) {
      this.logger.warn(`Checks failed for lesson ${lessonId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/** READY when nothing failed, FAILED when everything failed, PARTIAL for 1 to 4 failures. */
export function lessonStatusFor(failed: number, total: number): "READY" | "PARTIAL" | "FAILED" {
  if (failed === 0) return "READY";
  return failed >= total ? "FAILED" : "PARTIAL";
}

export function friendlyError(e: unknown): string {
  if (e instanceof AiError) return e.message;
  return "Something went wrong while making this resource. Try again.";
}
