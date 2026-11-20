import { Injectable } from "@nestjs/common";
import { TEACHER_AWARDABLE_BADGES, type BadgeKey } from "@helpo/shared";
import { badRequest, notFound } from "../common/problem";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async owned(teacherId: string, studentId: string) {
    const s = await this.prisma.student.findFirst({ where: { id: studentId, classRoom: { teacherId } }, select: { id: true } });
    if (!s) throw notFound("Student");
    return s;
  }

  async award(teacherId: string, studentId: string, badge: BadgeKey): Promise<{ badge: BadgeKey }> {
    const s = await this.owned(teacherId, studentId);
    await this.prisma.studentBadge.upsert({
      where: { studentId_badge: { studentId: s.id, badge } },
      create: { studentId: s.id, badge, awardedBy: teacherId },
      update: {},
    });
    return { badge };
  }

  async revoke(teacherId: string, studentId: string, badge: string): Promise<void> {
    if (!TEACHER_AWARDABLE_BADGES.includes(badge as BadgeKey)) throw badRequest("Only teacher-awarded badges can be removed.");
    const s = await this.owned(teacherId, studentId);
    await this.prisma.studentBadge.deleteMany({ where: { studentId: s.id, badge } });
  }
}
