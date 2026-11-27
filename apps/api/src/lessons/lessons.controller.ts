import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { z } from "zod";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { CreateLessonBody, RefinePromptBody, RESOURCE_KINDS, TranslateLessonBody, UpdateLessonBody, type Locale, type ResourceKind } from "@helpo/shared";
import { CurrentTeacher, TeacherGuard, type TeacherContext } from "../auth/teacher.guard";
import { ReqLocale } from "../common/i18n";
import { badRequest } from "../common/problem";
import { RateLimit } from "../common/rate-limit";
import { ZodValidationPipe } from "../common/zod.pipe";
import { MAX_UPLOAD_BYTES } from "../documents/documents.service";
import { GenerationService } from "./generation.service";
import { LessonsService } from "./lessons.service";
import { TranslationService } from "./translation.service";
import { PipelineService } from "./pipeline.service";

const GenerateOptionsBody = z.object({
  resources: z.array(z.enum(["SLIDES", "WORKSHEET", "QUIZ", "GAME", "CARDS"])).min(1).optional(),
  quizCount: z.number().int().min(5).max(20).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});

/** Multipart fields are strings: "false" must not become true, and empty fields are absent. */
export function parseCreateBody(raw: Record<string, unknown>) {
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw ?? {})) if (v !== "" && v !== undefined) body[k] = v;
  for (const k of ["reuse", "autoGenerate"]) if (body[k] === "false" || body[k] === "0") body[k] = false;
  return new ZodValidationPipe(CreateLessonBody).transform(body);
}

const ApproveBody = z.object({ force: z.boolean().optional() });

@Controller("lessons")
@UseGuards(TeacherGuard)
export class LessonsController {
  constructor(
    private readonly lessons: LessonsService,
    private readonly generation: GenerationService,
    private readonly translation: TranslationService,
    private readonly pipeline: PipelineService,
  ) {}

  @Get()
  list(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Query("classId") classId?: string) {
    return this.lessons.list(t.id, locale, classId);
  }

  @Post("refine-prompt")
  @HttpCode(200)
  @RateLimit("ai", 20)
  refine(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Body(new ZodValidationPipe(RefinePromptBody)) body: z.infer<typeof RefinePromptBody>) {
    return this.lessons.refinePrompt(t.id, body, locale);
  }

  /** One multipart endpoint: optional `file` plus the fields of CreateLessonBody. Returns at once; the pipeline runs in the background. */
  @Post()
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  create(@CurrentTeacher() t: TeacherContext, @Body() raw: Record<string, unknown>, @UploadedFile() file?: Express.Multer.File) {
    return this.pipeline.create(t.id, parseCreateBody(raw), file);
  }

  /** Lightweight poll target for a generating kit: status, per-resource progress, translations, updatedAt. */
  @Get(":id/status")
  status(@CurrentTeacher() t: TeacherContext, @Param("id") id: string) {
    return this.lessons.status(t.id, id);
  }

  @Get(":id")
  get(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Param("id") id: string) {
    return this.lessons.get(t.id, id, locale);
  }

  @Patch(":id")
  update(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Param("id") id: string, @Body(new ZodValidationPipe(UpdateLessonBody)) body: ReturnType<typeof UpdateLessonBody.parse>) {
    return this.lessons.update(t.id, id, body, locale);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentTeacher() t: TeacherContext, @Param("id") id: string) {
    await this.lessons.remove(t.id, id);
  }

  @Post(":id/source")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  source(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Param("id") id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw badRequest('Send the file in a multipart field named "file".');
    return this.lessons.attachSource(t.id, id, file, locale);
  }

  @Post(":id/plan")
  @RateLimit("ai", 20)
  plan(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Param("id") id: string) {
    return this.lessons.analyze(t.id, id, locale);
  }

  @Post(":id/approve")
  @HttpCode(200)
  approve(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Param("id") id: string, @Body(new ZodValidationPipe(ApproveBody)) body: z.infer<typeof ApproveBody>) {
    return this.lessons.approve(t.id, id, body.force === true, locale);
  }

  @Post(":id/generate")
  @HttpCode(202)
  @RateLimit("ai", 20)
  generate(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Param("id") id: string, @Body(new ZodValidationPipe(GenerateOptionsBody)) body: z.infer<typeof GenerateOptionsBody>) {
    return this.generation.start(t.id, id, locale, body);
  }

  @Post(":id/resources/:kind/retry")
  @HttpCode(202)
  @RateLimit("ai", 20)
  retry(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Param("id") id: string, @Param("kind") kind: string) {
    const upper = kind.toUpperCase() as ResourceKind;
    if (!RESOURCE_KINDS.includes(upper)) throw badRequest("Unknown resource kind.");
    return this.generation.retry(t.id, id, upper, locale);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Param("id") id: string) {
    return this.generation.cancel(t.id, id, locale);
  }

  @Post(":id/translate")
  @HttpCode(202)
  @RateLimit("ai", 20)
  translate(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Param("id") id: string, @Body(new ZodValidationPipe(TranslateLessonBody)) body: ReturnType<typeof TranslateLessonBody.parse>) {
    return this.translation.start(t.id, id, body.to, locale);
  }
}
