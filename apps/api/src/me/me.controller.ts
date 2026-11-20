import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { UpdateLocaleBody } from "@helpo/shared";
import { z } from "zod";
import { CurrentTeacher, TeacherGuard, type TeacherContext } from "../auth/teacher.guard";
import { ZodValidationPipe } from "../common/zod.pipe";
import { MeService } from "./me.service";

const SchoolBody = z.object({ name: z.string().trim().min(2).max(80) });

@Controller("me")
@UseGuards(TeacherGuard)
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  get(@CurrentTeacher() t: TeacherContext) {
    return this.me.get(t.id);
  }

  @Put("locale")
  setLocale(@CurrentTeacher() t: TeacherContext, @Body(new ZodValidationPipe(UpdateLocaleBody)) body: z.infer<typeof UpdateLocaleBody>) {
    return this.me.setLocale(t.id, body.locale);
  }

  @Put("school")
  setSchool(@CurrentTeacher() t: TeacherContext, @Body(new ZodValidationPipe(SchoolBody)) body: z.infer<typeof SchoolBody>) {
    return this.me.setSchool(t.id, body.name);
  }
}
