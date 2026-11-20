import { Injectable, Optional } from "@nestjs/common";
import { EventBus } from "../jobs/job-queue";
import { Prisma, type ActivitySession, type Student } from "@prisma/client";
import {
  BADGES,
  GAME_TEMPLATES,
  daysBetween,
  levelForXp,
  levelTitle,
  playableTemplates,
  scoreGame,
  type AvatarBody,
  type GameContent,
  type GameKind,
  type GameResultBody,
  type GameResultView,
  type PlaySubmitBody,
  type Locale,
  type QuizContent,
  type StudentGame,
  type StudentHome,
  type StudentQuizState,
  type BadgeKey,
} from "@helpo/shared";
import type { z } from "zod";
import { badRequest, conflict, notFound } from "../common/problem";
import { asLocale } from "../common/i18n";
import { schoolDay, startOfDay, startOfIsoWeek } from "../common/time";
import { contentOf, lessonTitle, toClassSettings } from "../common/views";
import { classWeekXp } from "../common/xp";
import { PrismaService } from "../prisma/prisma.service";
import { DAILY_GAME_XP_CAP, badgeForGame, correctIndex, firstAnswerXp, gradeAnswer, neverGivesUpEarned, retryXpDelta, studentType, stripForStudent, unlockedAvatar, type StudentQuestion } from "./grading";
import { GamificationService } from "./gamification.service";

type SessionWithTitle = ActivitySession & { lesson: { titleEn: string | null; titleAr: string | null } };

const GAME_KINDS = Object.keys(GAME_TEMPLATES) as GameKind[];

@Injectable()
export class PlayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
    @Optional() private readonly events?: EventBus,
  ) {}

  private async student(id: string): Promise<Student & { classRoom: Prisma.ClassRoomGetPayload<object> }> {
    const s = await this.prisma.student.findUnique({ where: { id }, include: { classRoom: true } });
    if (!s) throw notFound("Student");
    return s;
  }

  private liveSession(classId: string) {
    return this.prisma.activitySession.findFirst({
      where: { classId, status: { in: ["LOBBY", "LIVE"] } },
      orderBy: { createdAt: "desc" },
      include: { lesson: { select: { titleEn: true, titleAr: true } } },
    });
  }

  /* --------------------------------- home --------------------------------- */

  async home(studentId: string, locale: Locale): Promise<StudentHome> {
    const s = await this.student(studentId);
    const now = new Date();
    const [weekXpForStudent, answersThisWeek, gamesToday, earnedXp, live, lessons, sessions, badges] = await Promise.all([
      this.prisma.xpEvent.aggregate({ where: { studentId, createdAt: { gte: startOfIsoWeek(now) } }, _sum: { amount: true } }),
      this.prisma.answer.count({ where: { participant: { studentId }, createdAt: { gte: startOfIsoWeek(now) } } }),
      this.prisma.gameResult.count({ where: { studentId, createdAt: { gte: startOfDay(now) } } }),
      classWeekXp(this.prisma, s.classId, now),
      this.liveSession(s.classId),
      this.prisma.lesson.findMany({ where: { classId: s.classId, status: { in: ["READY", "PARTIAL"] }, approvedAt: { not: null } }, orderBy: [{ lessonNumber: "asc" }, { createdAt: "asc" }], select: { id: true, titleEn: true, titleAr: true, lessonNumber: true } }),
      this.prisma.activitySession.findMany({ where: { classId: s.classId, status: "ENDED" }, select: { lessonId: true } }),
      this.prisma.studentBadge.findMany({ where: { studentId }, select: { badge: true } }),
    ]);
    const level = levelForXp(s.xp);
    const earned = new Set(badges.map((b) => b.badge));
    const taught = new Set(sessions.map((x) => x.lessonId));
    let currentSeen = false;
    const journey = lessons.map((l) => {
      let state: "done" | "current" | "locked" = "locked";
      if (taught.has(l.id)) state = "done";
      else if (!currentSeen) {
        state = "current";
        currentSeen = true;
      }
      return { lessonId: l.id, title: lessonTitle(l, locale), number: l.lessonNumber, state };
    });
    const gap = s.lastActiveDay ? daysBetween(s.lastActiveDay, schoolDay(now)) : null;
    const alive = s.streakDays > 0 && gap !== null && (gap <= 1 || (gap === 2 && s.streakSavers > 0));
    const days = alive ? s.streakDays : 0;
    return {
      locale: asLocale(s.locale),
      displayName: s.displayName,
      className: s.classRoom.name,
      band: s.classRoom.band,
      xp: s.xp,
      level: level.level,
      levelTitle: levelTitle(level.level),
      xpIntoLevel: level.xpIntoLevel,
      xpForNextLevel: level.xpForNextLevel,
      streak: {
        days,
        saversLeft: s.streakSavers,
        message: days > 0 ? `${days}-day learning streak` : s.streakDays > 0 ? "Welcome back! Pick up where you left off." : "Start your learning streak today",
      },
      quests: [
        { id: "play-game", title: "Play one game today", done: Math.min(gamesToday, 1), total: 1 },
        { id: "answer-5", title: "Answer 5 quiz questions this week", done: Math.min(answersThisWeek, 5), total: 5 },
        { id: "earn-100", title: "Earn 100 XP this week", done: Math.min(weekXpForStudent._sum.amount ?? 0, 100), total: 100 },
      ],
      badges: (Object.keys(BADGES) as BadgeKey[]).map((key) => ({ key, name: BADGES[key].name, howToEarn: BADGES[key].howToEarn, earned: earned.has(key) })),
      classGoal: { goalXp: s.classRoom.weeklyGoalXp, earnedXp },
      live: live ? { sessionId: live.id, type: live.type, game: live.game, lessonTitle: lessonTitle(live.lesson, locale) } : null,
      journey,
      avatar: { items: s.avatarItems, background: s.avatarBackground, unlocked: unlockedAvatar(level.level) },
      settings: toClassSettings(s.classRoom),
    };
  }

  async setLocale(studentId: string, locale: Locale): Promise<StudentHome> {
    await this.prisma.student.update({ where: { id: studentId }, data: { locale } });
    return this.home(studentId, locale);
  }

  async setAvatar(studentId: string, body: z.infer<typeof AvatarBody>, locale: Locale): Promise<StudentHome> {
    const s = await this.student(studentId);
    const unlocked = unlockedAvatar(levelForXp(s.xp).level);
    if (body.items.some((i) => !unlocked.includes(i)) || !unlocked.includes(body.background)) {
      throw badRequest("Keep playing to unlock that item.");
    }
    await this.prisma.student.update({ where: { id: s.id }, data: { avatarItems: [...new Set(body.items)], avatarBackground: body.background } });
    return this.home(studentId, locale);
  }

  /* ---------------------------------- quiz ---------------------------------- */

  private async quizFor(lessonId: string, locale: Locale): Promise<QuizContent> {
    const r = await this.prisma.resource.findUnique({ where: { lessonId_kind: { lessonId, kind: "QUIZ" } }, select: { contentEn: true, contentAr: true, status: true } });
    const content = r && r.status === "READY" ? contentOf<QuizContent>(r, locale).content : null;
    if (!content) throw notFound("Quiz");
    return content;
  }

  private async sessionFor(student: Student, sessionId: string): Promise<SessionWithTitle> {
    const session = await this.prisma.activitySession.findFirst({
      where: { id: sessionId, classId: student.classId, type: { in: ["LIVE_QUIZ", "ASSIGNMENT"] } },
      include: { lesson: { select: { titleEn: true, titleAr: true } } },
    });
    if (!session) throw notFound("Session");
    return session;
  }

  async quizState(studentId: string, sessionId: string, locale: Locale): Promise<StudentQuizState> {
    const s = await this.student(studentId);
    const session = await this.sessionFor(s, sessionId);
    return this.buildState(s, session, locale);
  }

  /** Never includes the correct answer or explanation before reveal. */
  private async buildState(student: Student, session: SessionWithTitle, locale: Locale): Promise<StudentQuizState> {
    const quiz = await this.quizFor(session.lessonId, locale);
    const count = quiz.questions.length;
    const mine = await this.prisma.answer.findMany({ where: { sessionId: session.id, participant: { studentId: student.id } }, orderBy: { questionIndex: "asc" } });
    const selfPaced = session.type === "ASSIGNMENT";
    const index = selfPaced ? Math.min(mine.length, Math.max(count - 1, 0)) : session.currentQuestion;
    const q = quiz.questions[index] ?? null;
    const answer = mine.find((a) => a.questionIndex === index) ?? null;
    const open = session.status === "LIVE" && q;
    const showReveal = open && (selfPaced ? Boolean(answer) : session.revealed);
    return {
      sessionId: session.id,
      status: session.status,
      lessonTitle: lessonTitle(session.lesson, locale),
      questionIndex: index,
      questionCount: count,
      question: open ? { prompt: q.prompt, options: q.options?.map((o) => o.text) ?? [], type: studentType(q) } : null,
      myAnswer: answer ? { optionIndex: answer.optionIndex, text: answer.text } : null,
      revealed: showReveal ? { correctIndex: correctIndex(q), explanation: q.explanation, correct: answer ? answer.correct : null } : null,
    };
  }

  async submitAnswer(studentId: string, sessionId: string, body: { questionIndex: number; optionIndex?: number; text?: string }, locale: Locale): Promise<StudentQuizState> {
    const s = await this.student(studentId);
    const session = await this.sessionFor(s, sessionId);
    if (session.status !== "LIVE") throw conflict("This quiz is not running right now.");
    const quiz = await this.quizFor(session.lessonId, locale);
    const question = quiz.questions[body.questionIndex];
    if (!question) throw notFound("Question");
    if (session.type === "LIVE_QUIZ") {
      if (body.questionIndex !== session.currentQuestion) throw conflict("That question is not open.");
      if (session.revealed) throw conflict("Answers are closed for this question.");
    }
    const grade = gradeAnswer(question, body);
    if (!grade) throw badRequest("Pick one of the options or type an answer.");

    const participant = await this.prisma.participant.upsert({
      where: { sessionId_studentId: { sessionId: session.id, studentId: s.id } },
      create: { sessionId: session.id, studentId: s.id, displayName: s.displayName },
      update: {},
    });
    const existing = await this.prisma.answer.findUnique({ where: { participantId_questionIndex: { participantId: participant.id, questionIndex: body.questionIndex } } });
    const points = s.classRoom.pointsEnabled;

    // Idempotent: the same answer again, or any change after a correct answer, is a no-op.
    const same = existing && existing.optionIndex === (body.optionIndex ?? null) && (existing.text ?? null) === (body.text ?? null);
    if (existing && (same || existing.correct)) return this.buildState(s, session, locale);

    try {
      await this.prisma.$transaction(async (tx) => {
        if (!existing) {
          const xp = points ? firstAnswerXp(grade) : 0;
          await tx.answer.create({
            data: {
              sessionId: session.id,
              participantId: participant.id,
              questionIndex: body.questionIndex,
              optionIndex: body.optionIndex ?? null,
              text: body.text ?? null,
              correct: grade.correct,
              partial: grade.partial,
              xpAwarded: xp,
            },
          });
          await this.gamification.awardXp(tx, s, xp, grade.correct ? "answer:first" : "answer:attempt");
        } else {
          const delta = points ? retryXpDelta(existing.xpAwarded, grade.correct) : 0;
          await tx.answer.update({
            where: { id: existing.id },
            data: { optionIndex: body.optionIndex ?? null, text: body.text ?? null, correct: grade.correct, partial: grade.partial, xpAwarded: existing.xpAwarded + delta },
          });
          await this.gamification.awardXp(tx, s, delta, "answer:retry");
        }
        await this.gamification.touchStreak(tx, s.id);
        if (neverGivesUpEarned(await this.gamification.retriedAnswers(tx, s.id), await this.gamification.retriedGames(tx, s.id))) {
          await this.gamification.unlock(tx, s.id, "NEVER_GIVES_UP");
        }
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e; // concurrent duplicate: fine
    }
    this.events?.emit(`session:${session.id}`, "session.answer", { sessionId: session.id, questionId: question.id, choice: body.optionIndex ?? body.text ?? "" });
    return this.buildState(s, session, locale);
  }

  /** Self-paced quiz / assignment: every question WITHOUT correct flags or accepted answers. */
  async questionsFor(studentId: string, sessionId: string, locale: Locale): Promise<{ sessionId: string; joinCode: string; lessonTitle: string; questions: StudentQuestion[] }> {
    const s = await this.student(studentId);
    const session = await this.sessionFor(s, sessionId);
    if (session.type !== "ASSIGNMENT") throw conflict("Questions are shown one at a time in a live quiz.");
    const quiz = await this.quizFor(session.lessonId, locale);
    return { sessionId: session.id, joinCode: session.joinCode, lessonTitle: lessonTitle(session.lesson, locale), questions: quiz.questions.map((q) => stripForStudent(q)) };
  }

  /** POST /play/sessions/:id/submit: the same as /play/:code/submit, for students who joined through the picker. */
  async submitBySession(studentId: string, sessionId: string, body: z.infer<typeof PlaySubmitBody>, locale: Locale) {
    const s = await this.student(studentId);
    const session = await this.prisma.activitySession.findFirst({ where: { id: sessionId, classId: s.classId, type: "ASSIGNMENT" }, select: { joinCode: true } });
    if (!session) throw notFound("Assignment");
    return this.submitBatch(studentId, session.joinCode, body, locale);
  }

  /**
   * POST /play/:code/submit: the whole self-paced quiz at once, scored on the server. Idempotent per student
   * (a second submit returns the first result). Correct answers are only revealed in the response, after submission.
   */
  async submitBatch(studentId: string, code: string, body: z.infer<typeof PlaySubmitBody>, locale: Locale) {
    const s = await this.student(studentId);
    const session = await this.prisma.activitySession.findFirst({
      where: { joinCode: code, classId: s.classId, type: "ASSIGNMENT", status: { not: "ENDED" } },
      include: { lesson: { select: { titleEn: true, titleAr: true } } },
    });
    if (!session) throw notFound("Assignment");
    if (!session.isOpen || (session.expiresAt && session.expiresAt < new Date())) throw conflict("This activity is closed.");
    const quiz = await this.quizFor(session.lessonId, locale);
    const participant = await this.prisma.participant.upsert({
      where: { sessionId_studentId: { sessionId: session.id, studentId: s.id } },
      create: { sessionId: session.id, studentId: s.id, displayName: s.displayName },
      update: {},
    });
    const review = (graded: { id: string; correct: boolean }[]) =>
      graded.map((g) => {
        const q = quiz.questions.find((x) => x.id === g.id);
        return { questionId: g.id, correct: g.correct, correctIndex: q ? correctIndex(q) : null, explanation: q?.explanation ?? "" };
      });

    if (participant.submittedAt) {
      const done = await this.prisma.answer.findMany({ where: { participantId: participant.id }, orderBy: { questionIndex: "asc" } });
      const graded = done.map((a) => ({ id: quiz.questions[a.questionIndex]?.id ?? `Q${a.questionIndex + 1}`, correct: a.correct }));
      const correct = graded.filter((g) => g.correct).length;
      return { score: quiz.questions.length ? correct / quiz.questions.length : 0, correct, total: quiz.questions.length, xp: done.reduce((n, a) => n + a.xpAwarded, 0), durationSec: participant.durationSec ?? 0, review: review(graded), alreadySubmitted: true };
    }

    const rows: Prisma.AnswerCreateManyInput[] = [];
    const graded: { id: string; correct: boolean }[] = [];
    let xp = 0;
    const seen = new Set<string>();
    for (const a of body.answers) {
      const index = quiz.questions.findIndex((x) => x.id === a.questionId);
      if (index < 0 || seen.has(a.questionId)) continue;
      seen.add(a.questionId);
      const grade = gradeAnswer(quiz.questions[index], { optionIndex: a.optionIndex, text: a.text, pairs: a.pairs });
      if (!grade) continue;
      const award = s.classRoom.pointsEnabled ? firstAnswerXp(grade) : 0;
      xp += award;
      graded.push({ id: a.questionId, correct: grade.correct });
      rows.push({ sessionId: session.id, participantId: participant.id, questionIndex: index, optionIndex: a.optionIndex ?? null, text: a.text ?? (a.pairs ? JSON.stringify(a.pairs) : null), correct: grade.correct, partial: grade.partial, xpAwarded: award });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.answer.createMany({ data: rows, skipDuplicates: true });
      await tx.participant.update({ where: { id: participant.id }, data: { durationSec: body.durationSec, submittedAt: new Date() } });
      await this.gamification.awardXp(tx, s, xp, "answer:self-paced");
      await this.gamification.touchStreak(tx, s.id);
    });
    const correct = graded.filter((g) => g.correct).length;
    return { score: quiz.questions.length ? correct / quiz.questions.length : 0, correct, total: quiz.questions.length, xp, durationSec: body.durationSec, review: review(graded), alreadySubmitted: false };
  }

  /* ---------------------------------- games ---------------------------------- */

  async listGames(studentId: string, locale: Locale): Promise<{ lessonId: string; lessonTitle: string; game: GameKind; bestStars: number; assigned: boolean }[]> {
    const s = await this.student(studentId);
    const [lessons, bests, open] = await Promise.all([
      this.prisma.lesson.findMany({
        where: { classId: s.classId, status: { in: ["READY", "PARTIAL"] }, approvedAt: { not: null }, resources: { some: { kind: "GAME", status: "READY" } } },
        orderBy: [{ lessonNumber: "asc" }, { createdAt: "asc" }],
        select: { id: true, titleEn: true, titleAr: true, resources: { where: { kind: "GAME", status: "READY" }, select: { contentEn: true, contentAr: true } } },
      }),
      this.prisma.gameResult.groupBy({ by: ["lessonId", "game"], where: { studentId }, _max: { stars: true } }),
      this.prisma.activitySession.findMany({ where: { classId: s.classId, status: { not: "ENDED" }, type: { in: ["GAME", "ASSIGNMENT"] } }, select: { lessonId: true, game: true } }),
    ]);
    const best = new Map(bests.map((b) => [`${b.lessonId}:${b.game}`, b._max.stars ?? 0]));
    // Only templates the lesson's game content can feed, and that suit the class band.
    return lessons.flatMap((l) => {
      const content = l.resources[0] ? contentOf<GameContent>(l.resources[0], locale).content : null;
      const playable = content ? playableTemplates(content, s.classRoom.band) : [];
      return GAME_KINDS.filter((g) => playable.includes(g)).map((game) => ({
        lessonId: l.id,
        lessonTitle: lessonTitle(l, locale),
        game,
        bestStars: best.get(`${l.id}:${game}`) ?? 0,
        assigned: open.some((o) => o.lessonId === l.id && (o.game === null || o.game === game)),
      }));
    });
  }

  private async gameFor(student: Student, lessonId: string, locale: Locale): Promise<{ title: string; content: GameContent }> {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, classId: student.classId, status: { in: ["READY", "PARTIAL"] }, approvedAt: { not: null } },
      select: { titleEn: true, titleAr: true, resources: { where: { kind: "GAME", status: "READY" }, select: { contentEn: true, contentAr: true } } },
    });
    const res = lesson?.resources[0];
    const content = res ? contentOf<GameContent>(res, locale).content : null;
    if (!lesson || !content) throw notFound("Game");
    return { title: lessonTitle(lesson, locale), content };
  }

  async game(studentId: string, lessonId: string, game: string, locale: Locale): Promise<StudentGame> {
    if (!GAME_KINDS.includes(game as GameKind)) throw notFound("Game");
    const s = await this.student(studentId);
    const { title, content } = await this.gameFor(s, lessonId, locale);
    const best = await this.prisma.gameResult.aggregate({ where: { studentId, lessonId, game: game as GameKind }, _max: { stars: true } });
    return { lessonId, lessonTitle: title, game: game as GameKind, content, bestStars: best._max.stars ?? 0 };
  }

  /** The client reports counts only; the server decides the round size, stars, capped XP, badges and streak. */
  async submitGame(studentId: string, body: z.infer<typeof GameResultBody>, locale: Locale = "en"): Promise<GameResultView> {
    const s = await this.student(studentId);
    const { content } = await this.gameFor(s, body.lessonId, locale);
    const roundSize =
      body.game === "MATCH" || body.game === "MEMORY" ? content.pairs.length : body.game === "SORT" ? content.sortItems.length : body.game === "TRUE_FALSE" ? content.statements.length : content.equationTiles.length;
    const best = await this.prisma.gameResult.aggregate({ where: { studentId, lessonId: body.lessonId, game: body.game }, _max: { stars: true } });
    const score = scoreGame({
      pairsOrItems: roundSize,
      firstTryCorrect: Math.min(body.firstTryCorrect, roundSize),
      retriedCorrect: body.retriedCorrect,
      previousBestStars: best._max.stars ?? 0,
    });
    const sessionId = body.sessionId
      ? ((await this.prisma.activitySession.findFirst({ where: { id: body.sessionId, classId: s.classId, lessonId: body.lessonId }, select: { id: true } }))?.id ?? null)
      : null;
    const first = Math.min(body.firstTryCorrect, roundSize);
    const retried = Math.min(body.retriedCorrect, roundSize - first);

    let unlocked: { key: BadgeKey; name: string } | null = null;
    let totalXp = s.xp;
    let xp = 0;
    await this.prisma.$transaction(async (tx) => {
      if (s.classRoom.pointsEnabled) {
        const today = await tx.xpEvent.aggregate({ where: { studentId: s.id, reason: { startsWith: "game:" }, createdAt: { gte: startOfDay() } }, _sum: { amount: true } });
        xp = Math.max(0, Math.min(score.xp, DAILY_GAME_XP_CAP - (today._sum.amount ?? 0)));
      }
      await tx.gameResult.create({
        data: { studentId: s.id, lessonId: body.lessonId, sessionId, game: body.game, stars: score.stars, xp, total: roundSize, firstTry: first, retried },
      });
      await this.gamification.awardXp(tx, s, xp, `game:${body.game.toLowerCase()}`);
      await this.gamification.touchStreak(tx, s.id);
      const badge = badgeForGame(body.game, score.stars);
      if (badge) unlocked = await this.gamification.unlock(tx, s.id, badge);
      if (!unlocked && neverGivesUpEarned(await this.gamification.retriedAnswers(tx, s.id), await this.gamification.retriedGames(tx, s.id))) {
        unlocked = await this.gamification.unlock(tx, s.id, "NEVER_GIVES_UP");
      }
      totalXp = (await tx.student.findUniqueOrThrow({ where: { id: s.id }, select: { xp: true } })).xp;
    });
    const level = levelForXp(totalXp);
    return {
      stars: score.stars,
      xp,
      personalBest: score.personalBest,
      totalXp,
      level: level.level,
      xpIntoLevel: level.xpIntoLevel,
      badgeUnlocked: unlocked,
      classGoal: { goalXp: s.classRoom.weeklyGoalXp, earnedXp: await classWeekXp(this.prisma, s.classId) },
    };
  }
}

