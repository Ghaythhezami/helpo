import { Body, Controller, Get, HttpCode, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { DemoLoginBody } from "@helpo/shared";
import type { z } from "zod";
import { RateLimit } from "../common/rate-limit";
import { STUDENT_COOKIE, STUDENT_COOKIE_TTL_SECONDS, signStudentToken, studentCookieOptions } from "../common/student-cookie";
import { ZodValidationPipe } from "../common/zod.pipe";
import { DemoService } from "./demo.service";

@Controller("demo")
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Get("accounts")
  @RateLimit("demo", 30)
  accounts() {
    return this.demo.accounts();
  }

  /** Signs in server-side and forwards the session cookie (first-party on the web origin through the rewrite). */
  @Post("login")
  @HttpCode(200)
  @RateLimit("demo", 30)
  async login(@Body(new ZodValidationPipe(DemoLoginBody)) body: z.infer<typeof DemoLoginBody>, @Res({ passthrough: true }) res: Response) {
    const out = await this.demo.login(body.account);
    for (const cookie of out.setCookies) res.append("Set-Cookie", cookie);
    if (out.student) {
      const exp = Math.floor(Date.now() / 1000) + STUDENT_COOKIE_TTL_SECONDS;
      res.cookie(STUDENT_COOKIE, signStudentToken({ studentId: out.student.studentId, classId: out.student.classId, exp }), studentCookieOptions());
    }
    return out.result;
  }
}
