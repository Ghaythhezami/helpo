import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CreateSessionBody, SessionActionBody, type Locale } from "@helpo/shared";
import { z } from "zod";
import { CurrentTeacher, TeacherGuard, type TeacherContext } from "../auth/teacher.guard";
import { ReqLocale } from "../common/i18n";
import { ZodValidationPipe } from "../common/zod.pipe";
import { SessionsService } from "./sessions.service";

const ActionBody = z.object({ action: z.union([SessionActionBody.shape.action, z.enum(["open", "close"])]) });

@Controller("sessions")
@UseGuards(TeacherGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post()
  create(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Body(new ZodValidationPipe(CreateSessionBody)) body: z.infer<typeof CreateSessionBody>) {
    return this.sessions.create(t.id, body, locale);
  }

  @Get(":id")
  get(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Param("id") id: string) {
    return this.sessions.get(t.id, id, locale);
  }

  @Post(":id/action")
  action(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Param("id") id: string, @Body(new ZodValidationPipe(ActionBody)) body: z.infer<typeof ActionBody>) {
    return this.sessions.action(t.id, id, body.action, locale);
  }
}
