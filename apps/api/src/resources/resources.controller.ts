import { Body, Controller, Get, Param, Patch, Post, Query, Res, StreamableFile, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { ExportQuery, RevertResourceBody, ShareBody, ChangeRequestBody, RewriteBody, UpdateResourceBody, type Locale } from "@helpo/shared";
import type { z } from "zod";
import { CurrentTeacher, TeacherGuard, type TeacherContext } from "../auth/teacher.guard";
import { ReqLocale } from "../common/i18n";
import { RateLimit } from "../common/rate-limit";
import { ZodValidationPipe } from "../common/zod.pipe";
import { ResourcesService } from "./resources.service";
import { ExportService, contentDisposition } from "./export.service";

@Controller("resources")
@UseGuards(TeacherGuard)
export class ResourcesController {
  constructor(
    private readonly resources: ResourcesService,
    private readonly exports: ExportService,
  ) {}

  /** Streams a PPTX, DOCX or PDF download in the request's language. */
  @Get(":id/export")
  @RateLimit("export", 30)
  async export(
    @CurrentTeacher() t: TeacherContext,
    @ReqLocale() locale: Locale,
    @Param("id") id: string,
    @Query(new ZodValidationPipe(ExportQuery)) query: z.infer<typeof ExportQuery>,
    @Query("key") key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.exports.build(t.id, id, query.format, locale, key !== "false");
    res.set({ "Content-Type": file.mime, "Content-Disposition": contentDisposition(file.filename), "Cache-Control": "private, no-store" });
    return new StreamableFile(file.buffer);
  }


  @Patch(":id")
  update(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Param("id") id: string, @Body(new ZodValidationPipe(UpdateResourceBody)) body: z.infer<typeof UpdateResourceBody>) {
    return this.resources.update(t.id, id, body.content, locale);
  }

  @Post(":id/revert")
  revert(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Param("id") id: string, @Body(new ZodValidationPipe(RevertResourceBody)) body: z.infer<typeof RevertResourceBody>) {
    return this.resources.revert(t.id, id, body.version, locale);
  }

  @Post(":id/share")
  @RateLimit("share", 60)
  share(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Param("id") id: string, @Body(new ZodValidationPipe(ShareBody)) body: z.infer<typeof ShareBody>) {
    return this.resources.share(t.id, id, body, locale);
  }

  @Post(":id/rewrite")
  @RateLimit("ai", 20)
  rewrite(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Param("id") id: string, @Body(new ZodValidationPipe(RewriteBody)) body: z.infer<typeof RewriteBody>) {
    return this.resources.rewrite(t.id, id, body.text, body.action, locale, body.language);
  }

  @Post(":id/change")
  @RateLimit("ai", 20)
  change(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Param("id") id: string, @Body(new ZodValidationPipe(ChangeRequestBody)) body: z.infer<typeof ChangeRequestBody>) {
    return this.resources.change(t.id, id, body.request, locale);
  }
}
