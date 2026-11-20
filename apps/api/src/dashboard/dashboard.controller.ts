import { Controller, Get, UseGuards } from "@nestjs/common";
import type { Locale } from "@helpo/shared";
import { ReqLocale } from "../common/i18n";
import { CurrentTeacher, TeacherGuard, type TeacherContext } from "../auth/teacher.guard";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
@UseGuards(TeacherGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(@CurrentTeacher() t: TeacherContext, @ReqLocale() locale: Locale) {
    return this.dashboard.get(t, locale);
  }
}
