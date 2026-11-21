import { Injectable } from "@nestjs/common";
import type { Locale, Me, UserRole } from "@helpo/shared";
import { asLocale } from "../common/i18n";
import { notFound } from "../common/problem";
import { slugify } from "../common/time";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async get(teacherId: string): Promise<Me> {
    const user = await this.prisma.user.findUnique({ where: { id: teacherId }, include: { school: true } });
    if (!user) throw notFound("Account");
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      locale: asLocale(user.locale),
      role: (user.role === "ADMIN" ? "ADMIN" : "TEACHER") as UserRole,
      school: user.school ? { id: user.school.id, name: user.school.name, slug: user.school.slug } : null,
    };
  }

  async setLocale(teacherId: string, locale: Locale): Promise<Me> {
    await this.prisma.user.update({ where: { id: teacherId }, data: { locale } });
    return this.get(teacherId);
  }

  /** Creates the school (by slug) or joins the existing one. */
  async setSchool(teacherId: string, name: string): Promise<Me> {
    const slug = slugify(name);
    const school = await this.prisma.school.upsert({ where: { slug }, create: { name, slug }, update: {} });
    await this.prisma.user.update({ where: { id: teacherId }, data: { schoolId: school.id } });
    return this.get(teacherId);
  }
}
