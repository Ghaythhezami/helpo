import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { LIMITS, RESOURCE_KINDS, cleanPrompt, type CreateLessonBody, type Locale, type ResourceKind, type UploadType } from "@helpo/shared";
import type { z } from "zod";
import { AI_PROVIDER, type AiProvider } from "../ai/ai.provider";
import { asLocale, initialTranslations, writeCol } from "../common/i18n";
import { ProblemException, badRequest, notFound } from "../common/problem";
import { startOfMonth } from "../common/time";
import { DocumentsService, extensionOf, sha256Hex, type ExtractedSource } from "../documents/documents.service";
import { JobQueue } from "../jobs/job-queue";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { AnalysisService } from "./analysis.service";
import { GenerationService, type GenerationOptions } from "./generation.service";
import { lessonContext } from "./lesson-context";
import { LESSON_INCLUDE } from "./lesson-view.service";

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
}

/** What a repeat upload of the same file can reuse (cache by sha256). */
interface CachedSource {
  cleanText: string;
  tokenCount: number | null;
  sourcePages: number | null;
  sourceLocale: string | null;
  blueprint: Prisma.JsonValue | null;
}

/**
 * A short provisional title from a rough prompt: no "Lesson on:" lead-in, the first clause, at most 60 characters,
 * cut at a word boundary. The blueprint's title replaces it after analysis.
 */
export function shortTitle(prompt: string): string {
  const cleaned = prompt
    .replace(/\s+/g, " ")
    .replace(/^please\s+/i, "")
    .replace(/^(lesson\s+(brief|plan|outline)|brief)\s*:\s*/i, "")
    .replace(/^((teach|make|create|write|prepare|build)\s+(me\s+)?(a\s+)?)?(lesson|class|unit)\s+(on|about|for)\s*:?\s*/i, "")
    .replace(/^(teach|explain)\s+/i, "")
    .trim();
  const clause = cleaned.split(/[.,;:\n!?]|\s[-\u2013\u2014]\s/)[0].trim() || cleaned;
  const text = clause.length > 60 ? clause.slice(0, 60).replace(/\s+\S*$/, "") || clause.slice(0, 60) : clause;
  return text ? text[0].toUpperCase() + text.slice(1) : "New lesson";
}

/** Per-teacher upload limiter: 10 uploads per hour (in memory, best effort). */
export class UploadLimiter {
  private readonly hits = new Map<string, number[]>();
  check(teacherId: string, now = Date.now(), max = LIMITS.uploadsPerHour): void {
    const recent = (this.hits.get(teacherId) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= max) {
      this.hits.set(teacherId, recent);
      throw new ProblemException(429, "Too many uploads", `You can upload ${max} files per hour. Try again later.`);
    }
    this.hits.set(teacherId, [...recent, now]);
  }
}

/**
 * The simplified flow: POST /lessons (optional file + fields) creates the lesson and returns at once; the background
 * pipeline runs UPLOADED -> EXTRACTING -> ANALYZING -> ANALYZED and, with autoGenerate, starts generation.
 */
@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);
  private readonly limiter = new UploadLimiter();

  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    private readonly analysis: AnalysisService,
    private readonly generation: GenerationService,
    private readonly storage: StorageService,
    private readonly queue: JobQueue,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  /** Lessons created this month versus the teacher's quota. */
  async quota(teacherId: string, now = new Date()): Promise<{ used: number; limit: number }> {
    const limit = Number(process.env.MONTHLY_LESSON_QUOTA) || LIMITS.monthlyLessonQuota;
    const used = await this.prisma.lesson.count({ where: { teacherId, createdAt: { gte: startOfMonth(now) } } });
    return { used, limit };
  }

  async create(teacherId: string, body: z.infer<typeof CreateLessonBody>, file?: UploadedFile): Promise<{ lessonId: string }> {
    const prompt = body.prompt ? cleanPrompt(body.prompt) : undefined;
    if (!file && !prompt) throw badRequest("Upload a file or describe the lesson in a prompt (at least 10 characters).");
    if (prompt !== undefined && prompt.length < LIMITS.promptMin) throw badRequest(`Describe the lesson in at least ${LIMITS.promptMin} characters.`);

    const classRoom = await this.prisma.classRoom.findFirst({ where: { id: body.classId, teacherId }, select: { id: true } });
    if (!classRoom) throw notFound("Class");
    const quota = await this.quota(teacherId);
    if (quota.used >= quota.limit) {
      throw new ProblemException(429, "Monthly lesson limit reached", `You have created ${quota.used} of ${quota.limit} lessons this month.`, undefined, { type: "quota-exceeded", ...quota });
    }

    let type: UploadType | null = null;
    let sha256: string | null = null;
    let cached: CachedSource | null = null;
    if (file) {
      this.limiter.check(teacherId);
      type = await this.documents.detectType(file.buffer, file.originalname);
      sha256 = sha256Hex(file.buffer);
      if (body.reuse) {
        cached = (await this.prisma.lesson.findFirst({
          where: { teacherId, sourceSha256: sha256, cleanText: { not: null } },
          orderBy: { createdAt: "desc" },
          select: { cleanText: true, tokenCount: true, sourcePages: true, sourceLocale: true, blueprint: true },
        })) as CachedSource | null;
      }
    }

    const cl: Locale = body.contentLocale ?? asLocale(cached?.sourceLocale ?? "en");
    const title = body.title || (file ? file.originalname.replace(/\.[^.]+$/, "") : shortTitle(prompt as string));
    const options: GenerationOptions = { autoTitle: !body.title, resources: body.resources as ResourceKind[] | undefined, quizCount: body.quizCount, difficulty: body.difficulty, autoGenerate: body.autoGenerate };
    const lesson = await this.prisma.lesson.create({
      data: {
        teacherId,
        classId: classRoom.id,
        ...(writeCol("title", cl, title) as object),
        ...(writeCol("unitTitle", cl, body.unitTitle ?? null) as object),
        lessonNumber: body.lessonNumber,
        durationMin: body.durationMin,
        prompt: prompt ?? null,
        aiWritten: !file,
        requestedKinds: (body.resources?.length ? body.resources : [...RESOURCE_KINDS]) as ResourceKind[],
        generationOptions: options as unknown as Prisma.InputJsonValue,
        contentLocale: cl,
        translationStatus: initialTranslations(cl) as unknown as Prisma.InputJsonValue,
        status: "UPLOADED",
        sourceFileName: file?.originalname.slice(0, 200) ?? null,
        sourceType: type,
        sourceSha256: sha256,
      },
      select: { id: true },
    });

    if (file && type) {
      const stored = await this.storage.put(`lessons/${lesson.id}/source.${extensionOf(file.originalname) || type}`, file.buffer);
      if (stored) await this.prisma.lesson.update({ where: { id: lesson.id }, data: { sourceKey: stored.key, sourceBlobUrl: stored.url } });
    }

    const job = { lessonId: lesson.id, file, type, cached, pageRange: body.pageRange, explicitLocale: Boolean(body.contentLocale) };
    this.queue.schedule(`${lesson.id}:pipeline`, () => this.run(job));
    return { lessonId: lesson.id };
  }

  /** Background pipeline. Never throws: a failure marks the lesson FAILED with a reason. */
  async run(job: { lessonId: string; file?: UploadedFile; type: UploadType | null; cached: CachedSource | null; pageRange?: string; explicitLocale: boolean }): Promise<void> {
    const { lessonId } = job;
    try {
      if (job.file && job.type) {
        if (job.cached) {
          await this.prisma.lesson.update({
            where: { id: lessonId },
            data: { sourceText: job.cached.cleanText, cleanText: job.cached.cleanText, tokenCount: job.cached.tokenCount, sourcePages: job.cached.sourcePages, sourceLocale: job.cached.sourceLocale },
          });
        } else {
          await this.prisma.lesson.update({ where: { id: lessonId }, data: { status: "EXTRACTING" } });
          const extracted = await this.documents.extract(job.file.buffer, job.type, this.ai, { pageRange: job.pageRange });
          await this.saveExtraction(lessonId, extracted, job.explicitLocale);
        }
      }

      let lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: LESSON_INCLUDE });
      if (!lesson) return;
      if (job.cached?.blueprint) {
        await this.prisma.lesson.update({ where: { id: lessonId }, data: { blueprint: job.cached.blueprint as Prisma.InputJsonValue, status: "ANALYZED" } });
      } else {
        await this.prisma.lesson.update({ where: { id: lessonId }, data: { status: "ANALYZING" } });
        lesson = await this.prisma.lesson.findUniqueOrThrow({ where: { id: lessonId }, include: LESSON_INCLUDE });
        await this.analyze(lessonId);
      }
      const after = await this.prisma.lesson.findUnique({ where: { id: lessonId }, select: { generationOptions: true, blueprint: true } });
      const options = (after?.generationOptions ?? {}) as GenerationOptions;
      if (options.autoGenerate !== false) await this.generation.startInternal(lessonId);
    } catch (e) {
      this.logger.warn(`Pipeline failed for lesson ${lessonId}: ${e instanceof Error ? e.message : String(e)}`);
      const message = e instanceof ProblemException ? (e.detail ?? e.title) : e instanceof Error ? e.message : "Something went wrong.";
      await this.prisma.lesson.update({ where: { id: lessonId }, data: { status: "FAILED", errorMessage: message.slice(0, 500) } }).catch(() => undefined);
    }
  }

  /** Stores the clean text and metadata; when the teacher did not pick a language, the document's language wins. */
  async saveExtraction(lessonId: string, x: ExtractedSource, explicitLocale: boolean): Promise<void> {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, select: { contentLocale: true, titleEn: true, titleAr: true, unitTitleEn: true, unitTitleAr: true } });
    const switchLocale = !explicitLocale && lesson && asLocale(lesson.contentLocale) !== x.detectedLocale;
    await this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        sourceText: x.text,
        cleanText: x.text,
        tokenCount: x.tokenCount,
        sourcePages: x.pages,
        sourceLocale: x.detectedLocale,
        sourceSha256: x.sha256,
        ...(switchLocale && lesson
          ? {
              contentLocale: x.detectedLocale,
              translationStatus: initialTranslations(x.detectedLocale) as unknown as Prisma.InputJsonValue,
              ...(writeCol("title", x.detectedLocale, lesson.titleEn ?? lesson.titleAr) as object),
              ...(writeCol("unitTitle", x.detectedLocale, lesson.unitTitleEn ?? lesson.unitTitleAr) as object),
              ...(writeCol("title", x.detectedLocale === "en" ? "ar" : "en", null) as object),
              ...(writeCol("unitTitle", x.detectedLocale === "en" ? "ar" : "en", null) as object),
            }
          : {}),
      },
    });
  }

  /** The analysis step (also behind POST /lessons/:id/plan): blueprint, objectives, standard, description, ANALYZED. */
  async analyze(lessonId: string): Promise<void> {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: LESSON_INCLUDE });
    if (!lesson) throw notFound("Lesson");
    const cl = asLocale(lesson.contentLocale);
    const ctx = lessonContext(lesson, cl);
    const blueprint = await this.analysis.build(ctx, lesson.tokenCount);
    const hasDescription = (cl === "en" ? lesson.descriptionEn : lesson.descriptionAr) !== null;
    const options = (lesson.generationOptions ?? {}) as GenerationOptions;
    const useBlueprintTitle = options.autoTitle === true && blueprint.title.trim().length > 0;
    const early = ["DRAFT", "UPLOADED", "EXTRACTING", "ANALYZING", "ANALYZED"].includes(lesson.status);
    await this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        blueprint: blueprint as unknown as Prisma.InputJsonValue,
        ...(writeCol("objectives", cl, blueprint.objectives as unknown as Prisma.InputJsonValue) as object),
        ...(hasDescription ? {} : (writeCol("description", cl, blueprint.summary) as object)),
        standard: blueprint.standard ?? lesson.standard,
        ...(useBlueprintTitle ? { ...(writeCol("title", cl, blueprint.title.trim().slice(0, 140)) as object), generationOptions: { ...options, autoTitle: false } as unknown as Prisma.InputJsonValue } : {}),
        ...(early ? { status: "ANALYZED" as const } : {}),
      },
    });
  }
}
