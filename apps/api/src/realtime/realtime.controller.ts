import { Controller, Get, Inject, Req } from "@nestjs/common";
import type { Request } from "express";
import { AUTH, type Auth } from "../auth/auth.factory";
import { toWebHeaders } from "../auth/teacher.guard";
import { signRealtimeToken } from "../common/realtime-token";
import { unauthorized } from "../common/problem";
import { STUDENT_COOKIE, parseCookies, verifyStudentToken } from "../common/student-cookie";

/** GET /api/realtime/token: a 5-minute token for the Socket.IO handshake, for a teacher session or a student cookie. */
@Controller("realtime")
export class RealtimeController {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  @Get("token")
  async token(@Req() req: Request): Promise<{ token: string; url: string }> {
    const url = process.env.API_WS_URL || process.env.NEXT_PUBLIC_API_WS_URL || process.env.API_URL || "";
    const session = await this.auth.api.getSession({ headers: toWebHeaders(req.headers) });
    if (session?.user) return { token: signRealtimeToken({ kind: "teacher", id: session.user.id }), url };
    const student = verifyStudentToken(parseCookies(req.headers.cookie)[STUDENT_COOKIE]);
    if (student) return { token: signRealtimeToken({ kind: "student", id: student.studentId, classId: student.classId }), url };
    throw unauthorized();
  }
}
