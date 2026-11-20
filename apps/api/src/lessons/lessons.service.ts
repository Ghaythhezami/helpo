import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { LessonDetail, LessonSummary, Locale, RefinedPrompt, RefinePromptBody, UpdateLessonBody } from "@helpo/shared";
import { cleanPrompt } from "@helpo/shared";
import type { z } from "zod";
import { AI_PROVIDER, type AiProvider } from "../ai/ai.provider";
import { writeCol } from "../common/i18n";
import { ProblemException, conflict, duplicateUpload, notFound } from "../common/problem";
import { PrismaService } from "../prisma/prisma.service";
import { DocumentsService, sha256Hex } from "../documents/documents.service";
import { LESSON_INCLUDE, LessonViewService } from "./lesson-view.service";
import { PipelineService } from "./pipeline.service";

@Injectable()
export class LessonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly views: LessonViewService,
    private readonly documents: DocumentsService,
    private readonly pipeline: PipelineService,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  async list(teacherId: string, locale: Locale, classId?: string): Promise<LessonSummary[]> {
    const lessons = await this.prisma.lesson.findMany({
      where: { teacherId, ...(classId ? { classId } : {}) },
      include: LESSON_INCLUDE,
      orderBy: [{ createdAt: "desc" }],
    });
    return this.views.summaries(lessons, locale);
  }

  /**
   * "Refine with AI". Does not create a lesson, so it does not count toward the monthly quota. The class (if given)
   * supplies grade, subject and duration; the prompt is treated as data by the model.
   */
  async refinePrompt(teacherId: string, body: z.infer<typeof RefinePromptBody>, locale: Locale): Promise<RefinedPrompt> {
    const cls = body.classId
      ? await this.prisma.classRoom.findFirst({ where: { id: body.classId, teacherId }, select: { grade: true, subjectEn: true, subjectAr: true } })
      : null;
    if (body.classId && !cls) throw notFound("Class");
    const l = body.locale ?? locale;
    return this.ai.refinePrompt({
      prompt: cleanPrompt(body.prompt),
      locale: l,
      grade: cls?.grade,
      subject: cls ? ((l === "ar" ? cls.subjectAr : cls.subjectEn) ?? cls.subjectEn) : undefined,
    });
  }

  get(teacherId: string, id: string, locale: Locale): Promise<LessonDetail> {
    return this.views.detail(teacherId, id, locale);
  }

  /**
   * Alias of the upload step for clients that attach a file to an existing lesson (POST /lessons/:id/source):
   * magic-byte check, 20 MB cap (multer), sha256 duplicate detection (409 with existingLessonId), extraction.
   */
  async attachSource(teacherId: string, id: string, file: { buffer: Buffer; originalname: string }, locale: Locale): Promise<LessonDetail> {
    const lesson = await this.views.findOwned(teacherId, id);
    const type = await this.documents.detectType(file.buffer, file.originalname);
    const sha256 = sha256Hex(file.buffer);
    const duplicate = await this.prisma.lesson.findFirst({ where: { teacherId, sourceSha256: sha256, id: { not: lesson.id } }, select: { id: true } });
    if (duplicate) throw duplicateUpload(duplicate.id);

    const previous = lesson.status;
    await this.prisma.lesson.update({ where: { id: lesson.id }, data: { status: "EXTRACTING" } });
    let extracted;
    try {
      extracted = await this.documents.extract(file.buffer, type, this.ai);
    } catch (e) {
      await this.prisma.lesson.update({ where: { id: lesson.id }, data: { status: previous } });
      throw e;
    }
    const blobUrl = await this.documents.storeOriginal(file.buffer, `nibras/${teacherId}/${sha256.slice(0, 12)}-${file.originalname.replace(/[^\w.-]+/g, "_")}`);
    await this.pipeline.saveExtraction(lesson.id, extracted, true);
    const updated = await this.prisma.lesson.update({
      where: { id: lesson.id },
      data: { sourceFileName: file.originalname.slice(0, 200), sourceType: type, sourceBlobUrl: blobUrl, status: "UPLOADED", blueprint: Prisma.DbNull },
      include: LESSON_INCLUDE,
    });
    return this.views.detailOf(updated, locale);
  }

  /** POST /lessons/:id/plan: the analysis step, synchronous (the one-call pipeline runs it in the background). */
  async analyze(teacherId: string, id: string, locale: Locale): Promise<LessonDetail> {
    const lesson = await this.views.findOwned(teacherId, id);
    await this.pipeline.analyze(lesson.id);
    return this.views.detail(teacherId, id, locale);
  }

  /** Edits write the request locale's column. */
  async update(teacherId: string, id: string, body: z.infer<typeof UpdateLessonBody>, locale: Locale): Promise<LessonDetail> {
    const lesson = await this.views.findOwned(teacherId, id);
    const updated = await this.prisma.lesson.update({
      where: { id: lesson.id },
      data: {
        ...(body.title !== undefined ? (writeCol("title", locale, body.title) as object) : {}),
        ...(body.objectives !== undefined ? (writeCol("objectives", locale, body.objectives as unknown as Prisma.InputJsonValue) as object) : {}),
        ...(body.standard !== undefined ? { standard: body.standard } : {}),
      },
      include: LESSON_INCLUDE,
    });
    return this.views.detailOf(updated, locale);
  }

  /**
   * Teacher approval: sessions can only start on approved kits. Needs a finished kit and no OPEN checks,
   * unless `force` is set. (Sharing a resource approves too; see ResourcesService.share.)
   */
  async approve(teacherId: string, id: string, force: boolean, locale: Locale): Promise<LessonDetail> {
    const lesson = await this.views.findOwned(teacherId, id);
    if (lesson.status !== "READY" && lesson.status !== "PARTIAL") throw conflict("Generate the kit before approving it.");
    if (!force) {
      const open = await this.prisma.aiCheck.count({ where: { lessonId: lesson.id, status: "OPEN" } });
      if (open > 0) {
        throw new ProblemException(409, "Checks still open", `${open} AI check${open === 1 ? " is" : "s are"} still open. Review them, or approve anyway.`, undefined, { type: "checks-open", openChecks: open });
      }
    }
    const updated = await this.prisma.lesson.update({ where: { id: lesson.id }, data: { approvedAt: new Date() }, include: LESSON_INCLUDE });
    return this.views.detailOf(updated, locale);
  }

  async remove(teacherId: string, id: string): Promise<void> {
    const lesson = await this.views.findOwned(teacherId, id);
    await this.prisma.lesson.delete({ where: { id: lesson.id } });
  }
}
