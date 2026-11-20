import { CanActivate, ExecutionContext, Injectable, createParamDecorator } from "@nestjs/common";
import type { Request } from "express";
import { unauthorized } from "../common/problem";
import { STUDENT_COOKIE, parseCookies, verifyStudentToken } from "../common/student-cookie";
import { PrismaService } from "../prisma/prisma.service";

export interface StudentContext {
  id: string;
  classId: string;
}

export type StudentRequest = Request & { student?: StudentContext };

/** Verifies the HMAC-signed `helpo_student` cookie and that the student still exists in that class. */
@Injectable()
export class StudentGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<StudentRequest>();
    const token = verifyStudentToken(parseCookies(req.headers.cookie)[STUDENT_COOKIE]);
    if (!token) throw unauthorized("Pick your name to join first.");
    const student = await this.prisma.student.findFirst({ where: { id: token.studentId, classId: token.classId }, select: { id: true, classId: true } });
    if (!student) throw unauthorized("Pick your name to join first.");
    req.student = { id: student.id, classId: student.classId };
    return true;
  }
}

export const CurrentStudent = createParamDecorator((_data: unknown, ctx: ExecutionContext): StudentContext => {
  return ctx.switchToHttp().getRequest<StudentRequest>().student as StudentContext;
});
