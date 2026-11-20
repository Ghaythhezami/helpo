import { Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { Locale } from "@helpo/shared";
import { ReqLocale } from "../common/i18n";
import { CurrentTeacher, TeacherGuard, type TeacherContext } from "../auth/teacher.guard";
import { RateLimit } from "../common/rate-limit";
import { ResultsService } from "./results.service";

@Controller("lessons/:id")
@UseGuards(TeacherGuard)
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Get("results")
  get(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Param("id") id: string, @Query("sessionId") sessionId?: string) {
    return this.results.get(t.id, id, locale, sessionId);
  }

  @Post("reteach")
  @RateLimit("ai", 20)
  reteach(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale, @Param("id") id: string) {
    return this.results.reteach(t.id, id, locale);
  }
}
