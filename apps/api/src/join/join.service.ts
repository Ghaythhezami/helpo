import { Injectable, Optional } from "@nestjs/common";
import { EventBus } from "../jobs/job-queue";
import { childSafeName, normalizeJoinCode, type JoinOption, type JoinResult, type Locale } from "@helpo/shared";
import { badRequest, conflict, notFound } from "../common/problem";
import { lessonTitle } from "../common/views";
import { PrismaService } from "../prisma/prisma.service";

const MAX_CLASS_SIZE = 100;

interface ClassRow {
  id: string;
  name: string;
  grade: number;
  teacher: { name: string };
}

@Injectable()
export class JoinService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly events?: EventBus,
  ) {}

  private async announce(sessionId: string, name: string): Promise<void> {
    if (!this.events) return;
    const count = await this.prisma.participant.count({ where: { sessionId } });
    this.events.emit(`session:${sessionId}`, "session.studentJoined", { sessionId, name, count });
  }

  /** The newest lobby/live session for each class. */
  private async liveByClass(classIds: string[], locale: Locale) {
    const sessions = await this.prisma.activitySession.findMany({
      where: { classId: { in: classIds }, status: { in: ["LOBBY", "LIVE"] } },
      orderBy: { createdAt: "desc" },
      include: { lesson: { select: { titleEn: true, titleAr: true } } },
    });
    const out = new Map<string, NonNullable<JoinOption["live"]>>();
    for (const s of sessions) {
      if (!out.has(s.classId)) out.set(s.classId, { sessionId: s.id, type: s.type, game: s.game, lessonTitle: lessonTitle(s.lesson, locale), joinCode: s.joinCode });
    }
    return out;
  }

  private toOption(c: ClassRow, live: JoinOption["live"]): JoinOption {
    return { classId: c.id, className: c.name, grade: c.grade, teacherName: c.teacher.name, live };
  }

  async classesFor(slug: string, grade: number | undefined, locale: Locale): Promise<JoinOption[]> {
    const school = await this.prisma.school.findUnique({ where: { slug }, select: { id: true } });
    if (!school) throw notFound("School");
    const classes = await this.prisma.classRoom.findMany({
      where: { schoolId: school.id, ...(grade !== undefined ? { grade } : {}) },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
      select: { id: true, name: true, grade: true, teacher: { select: { name: true } } },
    });
    const live = await this.liveByClass(classes.map((c) => c.id), locale);
    return classes.map((c) => this.toOption(c, live.get(c.id) ?? null));
  }

  /** First name + initial only. */
  async studentsOf(classId: string): Promise<{ id: string; displayName: string }[]> {
    const cls = await this.prisma.classRoom.findUnique({ where: { id: classId }, select: { id: true } });
    if (!cls) throw notFound("Class");
    return this.prisma.student.findMany({ where: { classId }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } });
  }

  async byCode(rawCode: string, locale: Locale): Promise<JoinOption> {
    const code = normalizeJoinCode(rawCode);
    if (!code) throw notFound("Join code");
    const session = await this.prisma.activitySession.findFirst({
      where: { joinCode: code, status: { not: "ENDED" } },
      orderBy: { createdAt: "desc" },
      include: { classRoom: { select: { id: true, name: true, grade: true, teacher: { select: { name: true } } } }, lesson: { select: { titleEn: true, titleAr: true } } },
    });
    if (!session) throw notFound("Join code");
    return this.toOption(session.classRoom, { sessionId: session.id, type: session.type, game: session.game, lessonTitle: lessonTitle(session.lesson, locale), joinCode: session.joinCode });
  }

  /** Resolves the class (and live session) and the student; the caller sets the signed cookie. */
  async join(body: { code?: string; classId?: string; studentId?: string }): Promise<{ result: JoinResult; studentId: string; classId: string }> {
    let classId = body.classId ?? null;
    let session = null as Awaited<ReturnType<JoinService["findSession"]>>;
    if (body.code) {
      const code = normalizeJoinCode(body.code);
      if (!code) throw notFound("Join code");
      session = await this.findSession({ joinCode: code });
      if (!session) throw notFound("Join code");
      classId = session.classId;
    }
    if (!classId) throw badRequest("Give a join code or pick a class.");
    if (!body.studentId) throw badRequest("Pick your name to continue.");
    const student = await this.prisma.student.findFirst({ where: { id: body.studentId, classId }, select: { id: true, displayName: true, fullName: true } });
    if (!student) throw notFound("Student");
    session ??= await this.findSession({ classId });

    let participantId = student.id;
    if (session) {
      const p = await this.prisma.participant.upsert({
        where: { sessionId_studentId: { sessionId: session.id, studentId: student.id } },
        create: { sessionId: session.id, studentId: student.id, displayName: student.displayName || childSafeName(student.fullName) },
        update: {},
      });
      participantId = p.id;
      await this.announce(session.id, student.displayName);
    }
    const next: JoinResult["next"] = !session ? "home" : session.type === "LIVE_QUIZ" ? "quiz" : "game";
    return {
      result: { participantId, displayName: student.displayName, sessionId: session?.id ?? null, next },
      studentId: student.id,
      classId,
    };
  }

  /**
   * Share-by-code join: the student types a name instead of picking from the roster. The student is matched by
   * child-safe name (first name + initial) within the class, or created. Names stay inside Nibras, never sent to the AI.
   */
  async joinWithName(rawCode: string, rawName: string): Promise<{ result: JoinResult; studentId: string; classId: string }> {
    const code = normalizeJoinCode(rawCode);
    if (!code) throw notFound("Join code");
    const session = await this.findSession({ joinCode: code });
    if (!session) throw notFound("Join code");
    // eslint-disable-next-line no-control-regex -- strip control characters and angle brackets from typed names
    const fullName = rawName.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim();
    if (!/\p{L}/u.test(fullName)) throw badRequest("Type your name to join.");
    const displayName = childSafeName(fullName);
    let student = await this.prisma.student.findFirst({
      where: { classId: session.classId, displayName: { equals: displayName, mode: "insensitive" } },
      select: { id: true, displayName: true },
    });
    if (!student) {
      if ((await this.prisma.student.count({ where: { classId: session.classId } })) >= MAX_CLASS_SIZE) throw conflict("This class is full. Ask your teacher for help.");
      student = await this.prisma.student.create({ data: { classId: session.classId, fullName, displayName }, select: { id: true, displayName: true } });
    }
    const p = await this.prisma.participant.upsert({
      where: { sessionId_studentId: { sessionId: session.id, studentId: student.id } },
      create: { sessionId: session.id, studentId: student.id, displayName: student.displayName },
      update: {},
    });
    await this.announce(session.id, student.displayName);
    const next: JoinResult["next"] = session.type === "LIVE_QUIZ" ? "quiz" : "game";
    return { result: { participantId: p.id, displayName: student.displayName, sessionId: session.id, next }, studentId: student.id, classId: session.classId };
  }

  private findSession(where: { joinCode: string } | { classId: string }) {
    return this.prisma.activitySession.findFirst({ where: { ...where, status: { in: ["LOBBY", "LIVE"] } }, orderBy: { createdAt: "desc" } });
  }
}
