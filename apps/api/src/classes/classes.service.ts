import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { bandForGrade, childSafeName, type AddStudentsBody, type ClassDetail, type ClassSettings, type ClassSummary, type CreateClassBody, type Locale, type StudentSummary, type UpdateClassSettingsBody } from "@helpo/shared";
import type { z } from "zod";
import { conflict, notFound } from "../common/problem";
import { toClassSettings, toClassSummary, toStudentSummary } from "../common/views";
import { classWeekXp } from "../common/xp";
import { LESSON_INCLUDE, LessonViewService } from "../lessons/lesson-view.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lessons: LessonViewService,
  ) {}

  private owned(teacherId: string, id: string) {
    return this.prisma.classRoom.findFirst({ where: { id, teacherId }, include: { _count: { select: { students: true } } } });
  }

  async list(teacherId: string, locale: Locale): Promise<ClassSummary[]> {
    const rows = await this.prisma.classRoom.findMany({
      where: { teacherId },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
      include: { _count: { select: { students: true } } },
    });
    return rows.map((r) => toClassSummary(r, locale));
  }

  async create(teacherId: string, body: z.infer<typeof CreateClassBody>, locale: Locale): Promise<ClassSummary> {
    const teacher = await this.prisma.user.findUnique({ where: { id: teacherId }, select: { schoolId: true } });
    try {
      const row = await this.prisma.classRoom.create({
        data: {
          teacherId,
          schoolId: teacher?.schoolId ?? null,
          name: body.name,
          grade: body.grade,
          band: bandForGrade(body.grade),
          ...(locale === "ar" ? { subjectAr: body.subject } : { subjectEn: body.subject, ...(body.subject === "Science" ? { subjectAr: "العلوم" } : {}) }),
        },
        include: { _count: { select: { students: true } } },
      });
      return toClassSummary(row, locale);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict(`You already have a class called ${body.name}.`);
      throw e;
    }
  }

  async detail(teacherId: string, id: string, locale: Locale): Promise<ClassDetail> {
    const c = await this.owned(teacherId, id);
    if (!c) throw notFound("Class");
    const [students, lessons, weekXp] = await Promise.all([
      this.prisma.student.findMany({ where: { classId: c.id }, orderBy: { fullName: "asc" }, include: { badges: { select: { badge: true } } } }),
      this.prisma.lesson.findMany({ where: { classId: c.id, teacherId }, include: LESSON_INCLUDE, orderBy: [{ lessonNumber: "asc" }, { createdAt: "asc" }] }),
      classWeekXp(this.prisma, c.id),
    ]);
    return {
      ...toClassSummary(c, locale),
      settings: toClassSettings(c),
      students: students.map(toStudentSummary),
      weekXp,
      lessons: await this.lessons.summaries(lessons, locale),
    };
  }

  async updateSettings(teacherId: string, id: string, body: z.infer<typeof UpdateClassSettingsBody>): Promise<ClassSettings> {
    const c = await this.owned(teacherId, id);
    if (!c) throw notFound("Class");
    const updated = await this.prisma.classRoom.update({ where: { id: c.id }, data: body });
    return toClassSettings(updated);
  }

  async addStudents(teacherId: string, id: string, body: z.infer<typeof AddStudentsBody>): Promise<StudentSummary[]> {
    const c = await this.owned(teacherId, id);
    if (!c) throw notFound("Class");
    const created = await this.prisma.$transaction(
      body.names.map((fullName) =>
        this.prisma.student.create({ data: { classId: c.id, fullName, displayName: childSafeName(fullName) }, include: { badges: { select: { badge: true } } } }),
      ),
    );
    return created.map(toStudentSummary);
  }

  async removeStudent(teacherId: string, id: string, studentId: string): Promise<void> {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, classId: id, classRoom: { teacherId } }, select: { id: true } });
    if (!student) throw notFound("Student");
    await this.prisma.student.delete({ where: { id: student.id } });
  }
}
