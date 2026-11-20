import { Body, Controller, Delete, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { AwardBadgeBody } from "@helpo/shared";
import type { z } from "zod";
import { CurrentTeacher, TeacherGuard, type TeacherContext } from "../auth/teacher.guard";
import { ZodValidationPipe } from "../common/zod.pipe";
import { StudentsService } from "./students.service";

@Controller("students")
@UseGuards(TeacherGuard)
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Post(":id/badges")
  award(@CurrentTeacher() t: TeacherContext, @Param("id") id: string, @Body(new ZodValidationPipe(AwardBadgeBody)) body: z.infer<typeof AwardBadgeBody>) {
    return this.students.award(t.id, id, body.badge);
  }

  @Delete(":id/badges/:badge")
  @HttpCode(204)
  async revoke(@CurrentTeacher() t: TeacherContext, @Param("id") id: string, @Param("badge") badge: string) {
    await this.students.revoke(t.id, id, badge);
  }
}
