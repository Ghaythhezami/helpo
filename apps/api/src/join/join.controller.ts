import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { JoinBody, type JoinResult, type Locale } from "@helpo/shared";
import type { z } from "zod";
import { ReqLocale } from "../common/i18n";
import { RateLimit } from "../common/rate-limit";
import { STUDENT_COOKIE, STUDENT_COOKIE_TTL_SECONDS, signStudentToken, studentCookieOptions } from "../common/student-cookie";
import { ZodValidationPipe } from "../common/zod.pipe";
import { JoinService } from "./join.service";

@Controller("join")
export class JoinController {
  constructor(private readonly join: JoinService) {}

  // Public lookups. Limits are per IP and deliberately generous: a whole class often shares one NAT address, so 120 lookups
  // and 60 joins per minute never lock a classroom out, yet guessing the 900,000 six-digit codes is still throttled hard.
  @Get("schools/:slug/classes")
  @RateLimit("join-lookup", 120)
  classes(@Param("slug") slug: string, @ReqLocale() locale: Locale, @Query("grade") grade?: string) {
    const g = grade !== undefined && /^\d{1,2}$/.test(grade) ? Number(grade) : undefined;
    return this.join.classesFor(slug, g, locale);
  }

  @Get("classes/:classId/students")
  @RateLimit("join-lookup", 120)
  students(@Param("classId") classId: string) {
    return this.join.studentsOf(classId);
  }

  @Get("code/:code")
  @RateLimit("join-lookup", 120)
  byCode(@Param("code") code: string, @ReqLocale() locale: Locale) {
    return this.join.byCode(code, locale);
  }

  @Post()
  @HttpCode(200)
  @RateLimit("join", 60)
  async create(@Body(new ZodValidationPipe(JoinBody)) body: z.infer<typeof JoinBody>, @Res({ passthrough: true }) res: Response): Promise<JoinResult> {
    const { result, studentId, classId } = await this.join.join(body);
    const exp = Math.floor(Date.now() / 1000) + STUDENT_COOKIE_TTL_SECONDS;
    res.cookie(STUDENT_COOKIE, signStudentToken({ studentId, classId, exp }), studentCookieOptions());
    return result;
  }
}
