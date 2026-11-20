import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AddStudentsBody, CreateClassBody, UpdateClassSettingsBody, type Locale } from "@helpo/shared";
import type { z } from "zod";
import { CurrentTeacher, TeacherGuard, type TeacherContext } from "../auth/teacher.guard";
import { ReqLocale } from "../common/i18n";
import { ZodValidationPipe } from "../common/zod.pipe";
import { ClassesService } from "./classes.service";

@Controller("classes")
@UseGuards(TeacherGuard)
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Get()
  list(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale) {
    return this.classes.list(t.id, locale);
  }

  @Post()
  create(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Body(new ZodValidationPipe(CreateClassBody)) body: z.infer<typeof CreateClassBody>) {
    return this.classes.create(t.id, body, locale);
  }

  @Get(":id")
  detail(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Param("id") id: string) {
    return this.classes.detail(t.id, id, locale);
  }

  @Patch(":id/settings")
  settings(@CurrentTeacher() t: TeacherContext, @Param("id") id: string, @Body(new ZodValidationPipe(UpdateClassSettingsBody)) body: z.infer<typeof UpdateClassSettingsBody>) {
    return this.classes.updateSettings(t.id, id, body);
  }

  @Post(":id/students")
  addStudents(@CurrentTeacher() t: TeacherContext, @Param("id") id: string, @Body(new ZodValidationPipe(AddStudentsBody)) body: z.infer<typeof AddStudentsBody>) {
    return this.classes.addStudents(t.id, id, body);
  }

  @Delete(":id/students/:studentId")
  @HttpCode(204)
  async removeStudent(@CurrentTeacher() t: TeacherContext, @Param("id") id: string, @Param("studentId") studentId: string) {
    await this.classes.removeStudent(t.id, id, studentId);
  }
}
