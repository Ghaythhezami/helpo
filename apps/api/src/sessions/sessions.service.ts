import { Injectable, Optional } from "@nestjs/common";
import { EventBus } from "../jobs/job-queue";
import { randomInt } from "node:crypto";
import type { ActivitySession } from "@prisma/client";
import { leaderboardAllowed, type CreateSessionBody, type LeaderboardMode, type Locale, QuizContent, SessionActionBody, SessionTeacherView } from "@helpo/shared";
import type { z } from "zod";
import { badRequest, conflict, notFound } from "../common/problem";
import { contentOf } from "../common/views";
import { PrismaService } from "../prisma/prisma.service";

/** Student join URL carrying the code. */
export function joinLink(code: string): string {
  return `${process.env.WEB_URL || process.env.WEB_ORIGIN || "http://localhost:3000"}/join?code=${code}`;
}

/** QR code of the join link as SVG (the qrcode package). Falls back to an empty string if it cannot be made. */
export async function qrSvg(link: string): Promise<string> {
  try {
    const QRCode = await import("qrcode");
    return await QRCode.toString(link, { type: "svg", margin: 1 });
  } catch {
    return "";
  }
}

/** The shared actions plus open/close of a share link. */
export type SessionAction = z.infer<typeof SessionActionBody>["action"] | "open" | "close";

/** Join codes reserved for the pre-configured demo activities (see prisma/seed.ts). */
export const RESERVED_JOIN_CODES: ReadonlySet<string> = new Set(["202020", "303030"]);

export function randomJoinCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly events?: EventBus,
  ) {}

  /** session.question: the room learns which question is open (students poll in poll mode). */
  private async emitQuestion(view: SessionTeacherView): Promise<SessionTeacherView> {
    const q = view.question ? await this.timeLimit(view.lessonId, view.currentQuestion) : null;
    this.events?.emit(`session:${view.id}`, "session.question", { sessionId: view.id, index: view.currentQuestion, timeLimit: q });
    return view;
  }

  private async timeLimit(lessonId: string, index: number): Promise<number | null> {
    const quiz = await this.quiz(lessonId, "en");
    return quiz?.questions[index]?.timeLimitSec ?? null;
  }

  /** 6-digit code, unique among sessions that are not ENDED; retried on collision. */
  async uniqueJoinCode(generate: () => string = randomJoinCode): Promise<string> {
    for (let i = 0; i < 25; i++) {
      const code = generate();
      if (RESERVED_JOIN_CODES.has(code)) continue; // fixed demo codes
      const taken = await this.prisma.activitySession.findFirst({ where: { joinCode: code, status: { not: "ENDED" } }, select: { id: true } });
      if (!taken) return code;
    }
    throw conflict("Could not find a free join code. Try again in a moment.");
  }

  async create(teacherId: string, body: z.infer<typeof CreateSessionBody>, locale: Locale, extra: { expiresInHours?: number; leaderboard?: LeaderboardMode } = {}): Promise<SessionTeacherView> {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: body.lessonId, teacherId },
      include: { resources: { select: { kind: true, status: true } }, classRoom: { select: { band: true } } },
    });
    if (!lesson) throw notFound("Lesson");
    if (!lesson.approvedAt) throw conflict("Approve this kit before teaching or sharing it.");
    const ready = (kind: string) => lesson.resources.some((r) => r.kind === kind && r.status === "READY");
    if (body.type === "LIVE_QUIZ" && !ready("QUIZ")) throw badRequest("The quiz is not ready yet.");
    if (body.type === "GAME" && !ready("GAME")) throw badRequest("The game is not ready yet.");
    if (body.type === "ASSIGNMENT" && !ready("QUIZ") && !ready("GAME")) throw badRequest("Nothing is ready to assign yet.");
    const joinCode = await this.uniqueJoinCode();
    const live = body.type !== "LIVE_QUIZ"; // games and assignments have no lobby
    const session = await this.prisma.activitySession.create({
      data: {
        lessonId: lesson.id,
        classId: lesson.classId,
        type: body.type,
        game: body.type === "GAME" ? (body.game ?? "MATCH") : (body.game ?? null),
        status: live ? "LIVE" : "LOBBY",
        startedAt: live ? new Date() : null,
        joinCode,
        namesHidden: body.namesHidden,
        isOpen: true,
        expiresAt: new Date(Date.now() + (extra.expiresInHours ?? 24) * 3_600_000),
        // children never see an individual ranking by default: Explorer classes are held to TEAMS
        leaderboard: leaderboardAllowed(extra.leaderboard ?? "TEAMS", lesson.classRoom?.band ?? "NAVIGATOR"),
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
      },
    });
    return this.view(session, locale);
  }

  async get(teacherId: string, id: string, locale: Locale): Promise<SessionTeacherView> {
    return this.view(await this.owned(teacherId, id), locale);
  }

  async action(teacherId: string, id: string, action: SessionAction, locale: Locale): Promise<SessionTeacherView> {
    const session = await this.owned(teacherId, id);
    if (session.status === "ENDED") throw conflict("This session has ended.");
    if (action === "open" || action === "close") {
      return this.view(await this.prisma.activitySession.update({ where: { id }, data: { isOpen: action === "open" } }), locale);
    }
    if (action === "toggleNames") {
      return this.view(await this.prisma.activitySession.update({ where: { id }, data: { namesHidden: !session.namesHidden } }), locale);
    }
    if (action === "end") {
      return this.view(await this.prisma.activitySession.update({ where: { id }, data: { status: "ENDED", endedAt: new Date() } }), locale);
    }
    if (session.type !== "LIVE_QUIZ") throw badRequest("Only a live quiz can be started, stepped or revealed.");
    const count = await this.questionCount(session.lessonId);
    switch (action) {
      case "start":
        if (session.status !== "LOBBY") throw conflict("The quiz has already started.");
        return this.emitQuestion(await this.view(await this.prisma.activitySession.update({ where: { id }, data: { status: "LIVE", startedAt: new Date(), currentQuestion: 0, revealed: false } }), locale));
      case "next":
      case "prev": {
        if (session.status !== "LIVE") throw conflict("Start the quiz first.");
        const next = Math.min(Math.max(session.currentQuestion + (action === "next" ? 1 : -1), 0), Math.max(count - 1, 0));
        return this.emitQuestion(await this.view(await this.prisma.activitySession.update({ where: { id }, data: { currentQuestion: next, revealed: false } }), locale));
      }
      case "reveal":
        if (session.status !== "LIVE") throw conflict("Start the quiz first.");
        return this.view(await this.prisma.activitySession.update({ where: { id }, data: { revealed: true } }), locale);
    }
  }

  private async owned(teacherId: string, id: string): Promise<ActivitySession> {
    const s = await this.prisma.activitySession.findFirst({ where: { id, lesson: { teacherId } } });
    if (!s) throw notFound("Session");
    return s;
  }

  private async questionCount(lessonId: string): Promise<number> {
    return (await this.quiz(lessonId, "en"))?.questions.length ?? 0;
  }

  private async quiz(lessonId: string, locale: Locale): Promise<QuizContent | null> {
    const r = await this.prisma.resource.findUnique({ where: { lessonId_kind: { lessonId, kind: "QUIZ" } }, select: { contentEn: true, contentAr: true } });
    return r ? contentOf<QuizContent>(r, locale).content : null;
  }

  async view(s: ActivitySession, locale: Locale): Promise<SessionTeacherView> {
    const isQuiz = s.type === "LIVE_QUIZ";
    const [quiz, participants, classSize, answers] = await Promise.all([
      isQuiz ? this.quiz(s.lessonId, locale) : Promise.resolve(null),
      this.prisma.participant.findMany({ where: { sessionId: s.id }, select: { id: true, displayName: true, student: { select: { fullName: true } } } }),
      this.prisma.student.count({ where: { classId: s.classId } }),
      isQuiz ? this.prisma.answer.findMany({ where: { sessionId: s.id, questionIndex: s.currentQuestion }, select: { participantId: true, optionIndex: true } }) : Promise.resolve([]),
    ]);
    const link = joinLink(s.joinCode);
    const q = quiz?.questions[s.currentQuestion] ?? null;
    const showQuestion = isQuiz && s.status !== "LOBBY" && q;
    const answeredIds = new Set(answers.map((a) => a.participantId));
    let distribution: number[] | null = null;
    const options = q?.options?.map((o) => o.text) ?? [];
    if (showQuestion && s.revealed && options.length) {
      distribution = options.map((_, i) => answers.filter((a) => a.optionIndex === i).length);
    }
    return {
      id: s.id,
      lessonId: s.lessonId,
      type: s.type,
      game: s.game,
      status: s.status,
      joinCode: s.joinCode,
      namesHidden: s.namesHidden,
      currentQuestion: s.currentQuestion,
      questionCount: quiz?.questions.length ?? 0,
      revealed: s.revealed,
      joined: participants.length,
      classSize,
      answeredCurrent: isQuiz ? answers.length : 0,
      notAnswered: isQuiz && s.status === "LIVE" ? participants.filter((p) => !answeredIds.has(p.id)).map((p) => p.student?.fullName ?? p.displayName) : [],
      question: showQuestion ? { prompt: q.prompt, options, type: q.type } : null,
      distribution,
      link,
      qrSvg: await qrSvg(link),
      isOpen: s.isOpen && !(s.expiresAt && s.expiresAt < new Date()),
      expiresAt: s.expiresAt?.toISOString() ?? null,
      leaderboard: (s.leaderboard as SessionTeacherView["leaderboard"]) ?? "TEAMS",
    };
  }
}
