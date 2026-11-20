import { Body, Controller, Param, Patch, UseGuards } from "@nestjs/common";
import { ResolveCheckBody, type Locale } from "@helpo/shared";
import type { z } from "zod";
import { CurrentTeacher, TeacherGuard, type TeacherContext } from "../auth/teacher.guard";
import { ReqLocale } from "../common/i18n";
import { ZodValidationPipe } from "../common/zod.pipe";
import { ChecksService } from "./checks.service";

@Controller("checks")
@UseGuards(TeacherGuard)
export class ChecksController {
  constructor(private readonly checks: ChecksService) {}

  @Patch(":id")
  resolve(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Param("id") id: string, @Body(new ZodValidationPipe(ResolveCheckBody)) body: z.infer<typeof ResolveCheckBody>) {
    return this.checks.resolve(t.id, id, body.status, locale, body.editedText);
  }
}
