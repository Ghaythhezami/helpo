import { Inject, Injectable, Logger } from "@nestjs/common";
import type { DemoAccount, DemoAccountKey, DemoLoginResult } from "@helpo/shared";
import { AUTH, type Auth } from "../auth/auth.factory";
import { ProblemException, notFound } from "../common/problem";
import { JoinService } from "../join/join.service";
import { PrismaService } from "../prisma/prisma.service";

export const DEMO_TEACHER_EMAIL = "demo@helpo.test";
export const DEMO_ADMIN_EMAIL = "admin@helpo.test";
/** The seeded self-paced quiz (see prisma/seed.ts). */
export const DEMO_ASSIGNMENT_CODE = "303030";
export const DEMO_STUDENT_NAME = "Layla A.";

export interface DemoLogin {
  result: DemoLoginResult;
  setCookies: string[];
  student: { studentId: string; classId: string } | null;
}

/**
 * Pre-configured access so a tester can pick an account instead of typing a login. Only active with DEMO_LOGIN=true.
 * The shared password is read from DEMO_PASSWORD and is never stored in code.
 */
@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH) private readonly auth: Auth,
    private readonly join: JoinService,
  ) {}

  /** Off by default: every demo route answers 404. */
  assertEnabled(env: NodeJS.ProcessEnv = process.env): void {
    if (env.DEMO_LOGIN !== "true") throw notFound("Page");
  }

  private async assignmentId(): Promise<string | null> {
    const s = await this.prisma.activitySession.findFirst({ where: { joinCode: DEMO_ASSIGNMENT_CODE, type: "ASSIGNMENT", status: { not: "ENDED" } }, select: { id: true } });
    return s?.id ?? null;
  }

  async accounts(): Promise<DemoAccount[]> {
    this.assertEnabled();
    const assignment = await this.assignmentId();
    return [
      {
        key: "teacher",
        label: "Teacher",
        labelAr: "معلّم",
        description: "Alex Green, Riverside Middle School: classes, a finished photosynthesis unit with results, and a ready kit.",
        descriptionAr: "أليكس غرين، مدرسة ريفرسايد المتوسطة: صفوف، ووحدة التمثيل الضوئي مع النتائج، وحزمة جاهزة.",
        email: DEMO_TEACHER_EMAIL,
        next: "/app",
      },
      {
        key: "student",
        label: "Student",
        labelAr: "طالب",
        description: "Layla A., class 6B: XP, a streak and a self-paced quiz waiting to be played. No password.",
        descriptionAr: "ليلى أ.، الصف 6B: نقاط وتتابع واختبار ذاتي جاهز للعب. بلا كلمة مرور.",
        email: null,
        next: assignment ? `/play/self/${assignment}` : "/play",
      },
      {
        key: "admin",
        label: "Admin",
        labelAr: "مشرف",
        description: "Nibras Admin: platform numbers, AI usage by model, recent lessons and sessions.",
        descriptionAr: "مشرف نبراس: أرقام المنصة، واستخدام الذكاء الاصطناعي حسب النموذج، وآخر الدروس والجلسات.",
        email: DEMO_ADMIN_EMAIL,
        next: "/admin",
      },
    ];
  }

  async login(key: DemoAccountKey): Promise<DemoLogin> {
    this.assertEnabled();
    const account = (await this.accounts()).find((a) => a.key === key);
    if (!account) throw notFound("Account");
    this.logger.log(`Demo login: ${key}`); // the account only, never an IP

    if (key === "student") {
      const assignment = await this.assignmentId();
      const student = await this.prisma.student.findFirst({
        where: { displayName: DEMO_STUDENT_NAME, classRoom: { name: "6B", teacher: { email: DEMO_TEACHER_EMAIL } } },
        select: { id: true },
      });
      if (!assignment || !student) throw new ProblemException(503, "Demo data is missing", "Run the seed first: the demo student or assignment does not exist.");
      const joined = await this.join.join({ code: DEMO_ASSIGNMENT_CODE, studentId: student.id });
      return { result: { account: key, next: account.next }, setCookies: [], student: { studentId: joined.studentId, classId: joined.classId } };
    }

    const password = process.env.DEMO_PASSWORD;
    if (!password) throw new ProblemException(503, "Demo login is not configured", "DEMO_PASSWORD is not set on the server.");
    const res = await this.auth.api.signInEmail({ body: { email: account.email as string, password }, asResponse: true });
    if (!res.ok) throw new ProblemException(401, "Demo sign-in failed", "The demo account could not be signed in. Run the seed to create it.");
    return { result: { account: key, next: account.next }, setCookies: res.headers.getSetCookie(), student: null };
  }
}
