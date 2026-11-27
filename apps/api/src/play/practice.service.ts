import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import { playableTemplates, splitGamePoints, type GameContent, type GameKind, type Locale, type PracticeQuiz, type PracticeResult, type PracticeSubmitBody, type QuizContent, type StudentPractice } from "@helpo/shared";
import { notFound } from "../common/problem";
import { startOfDay } from "../common/time";
import { contentOf, lessonTitle } from "../common/views";
import { PrismaService } from "../prisma/prisma.service";
import { sessionGames } from "../sessions/sessions.service";
import { GamificationService } from "./gamification.service";
import { gradeAnswer } from "./grading";
import { DAILY_PRACTICE_XP_CAP_PER_LESSON, PRACTICE_XP_ATTEMPT, PRACTICE_XP_CORRECT, correctAnswerText, optionOrder, practiceReason, toPracticeQuestion } from "./practice";

/** Lessons a student may practise: their own class, finished (READY or PARTIAL) and approved by the teacher. */
const practisable = (classId: string) => ({ classId, status: { in: ["READY", "PARTIAL"] as ("READY" | "PARTIAL")[] }, approvedAt: { not: null } });

/**
 * Practice mode: the student's own class, any time, no teacher session. Nothing here creates a Participant or an Answer,
 * so class results and mastery are never touched; practice earns a little capped XP and nothing else.
 */
@Injectable()
export class PracticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
  ) {}

  private async student(id: string) {
    const s = await this.prisma.student.findUnique({ where: { id }, include: { classRoom: true } });
    if (!s) throw notFound("Student");
    return s;
  }

  /** GET /play/practice: what is open right now, plus every lesson with its quiz size, playable games and best stars. */
  async list(studentId: string, locale: Locale): Promise<StudentPractice> {
    const s = await this.student(studentId);
    const now = new Date();
    const [sessions, lessons, bests] = await Promise.all([
      this.prisma.activitySession.findMany({
        where: {
          classId: s.classId,
          OR: [
            { type: "LIVE_QUIZ", status: { in: ["LOBBY", "LIVE"] } },
            { type: { in: ["ASSIGNMENT", "GAME"] }, status: { not: "ENDED" }, isOpen: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          ],
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, type: true, joinCode: true, game: true, games: true, lesson: { select: { titleEn: true, titleAr: true } } },
      }),
      this.prisma.lesson.findMany({
        where: practisable(s.classId),
        orderBy: [{ lessonNumber: "asc" }, { createdAt: "asc" }],
        select: { id: true, titleEn: true, titleAr: true, lessonNumber: true, resources: { where: { kind: { in: ["QUIZ", "GAME"] }, status: "READY" }, select: { kind: true, contentEn: true, contentAr: true } } },
      }),
      this.prisma.gameResult.groupBy({ by: ["lessonId"], where: { studentId }, _max: { stars: true } }),
    ]);
    const best = new Map(bests.map((b) => [b.lessonId, b._max.stars ?? 0]));
    return {
      className: s.classRoom.name,
      // `games` (the teacher's published games and their points) is an addition to the shared StudentPractice type
      open: sessions.map((x) => ({ sessionId: x.id, type: x.type, joinCode: x.joinCode, lessonTitle: lessonTitle(x.lesson, locale), games: splitGamePoints(sessionGames(x) ?? []) })),
      lessons: lessons.map((l) => {
        const quiz = l.resources.find((r) => r.kind === "QUIZ");
        const game = l.resources.find((r) => r.kind === "GAME");
        const quizContent = quiz ? contentOf<QuizContent>(quiz, locale).content : null;
        const gameContent = game ? contentOf<GameContent>(game, locale).content : null;
        const games: GameKind[] = gameContent ? playableTemplates(gameContent, s.classRoom.band) : [];
        return { lessonId: l.id, title: lessonTitle(l, locale), number: l.lessonNumber, quizQuestions: quizContent?.questions.length ?? 0, games, bestStars: best.get(l.id) ?? 0 };
      }),
    };
  }

  /** The lesson (class-scoped, otherwise 404) and its READY quiz. */
  private async quizOf(studentId: string, lessonId: string, locale: Locale) {
    const s = await this.student(studentId);
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, ...practisable(s.classId) },
      select: { titleEn: true, titleAr: true, resources: { where: { kind: "QUIZ", status: "READY" }, select: { contentEn: true, contentAr: true } } },
    });
    const res = lesson?.resources[0];
    const quiz = res ? contentOf<QuizContent>(res, locale).content : null;
    if (!lesson || !quiz) throw notFound("Quiz");
    return { s, title: lessonTitle(lesson, locale), quiz, seed: `${s.id}:${lessonId}` };
  }

  /** GET /play/practice/:lessonId/quiz: no correct flags, no accepted answers, no explanations. */
  async quiz(studentId: string, lessonId: string, locale: Locale): Promise<PracticeQuiz> {
    const { title, quiz, seed } = await this.quizOf(studentId, lessonId, locale);
    return { lessonId, lessonTitle: title, questions: quiz.questions.map((q) => toPracticeQuestion(q, seed)) };
  }

  /** POST /play/practice/:lessonId/quiz: graded on the server; the review reveals answers only now. */
  async submit(studentId: string, lessonId: string, body: z.infer<typeof PracticeSubmitBody>, locale: Locale): Promise<PracticeResult> {
    const { s, quiz, seed } = await this.quizOf(studentId, lessonId, locale);
    const given = new Map<string, (typeof body.answers)[number]>();
    for (const a of body.answers) if (!given.has(a.questionId)) given.set(a.questionId, a);

    let raw = 0;
    let correct = 0;
    const review = quiz.questions.map((q) => {
      const a = given.get(q.id);
      // Options were shown shuffled: translate the position the student picked back to the stored option.
      const optionIndex = a?.optionIndex === undefined ? undefined : q.type === "mcq" ? optionOrder(q, seed)[a.optionIndex] : a.optionIndex;
      const grade = a ? gradeAnswer(q, { optionIndex, text: a.text, pairs: a.pairs }) : null;
      if (grade) raw += grade.correct ? PRACTICE_XP_CORRECT : PRACTICE_XP_ATTEMPT;
      if (grade?.correct) correct += 1;
      return { questionId: q.id, correct: grade?.correct ?? false, explanation: q.explanation, correctAnswer: correctAnswerText(q) };
    });

    let xp = 0;
    await this.prisma.$transaction(async (tx) => {
      if (s.classRoom.pointsEnabled && raw > 0) {
        const today = await tx.xpEvent.aggregate({ where: { studentId: s.id, reason: practiceReason(lessonId), createdAt: { gte: startOfDay() } }, _sum: { amount: true } });
        xp = Math.max(0, Math.min(raw, DAILY_PRACTICE_XP_CAP_PER_LESSON - (today._sum.amount ?? 0)));
        await this.gamification.awardXp(tx, s, xp, practiceReason(lessonId));
      }
      await this.gamification.touchStreak(tx, s.id);
    });
    const total = quiz.questions.length;
    return { score: total ? correct / total : 0, correct, total, xp, review };
  }
}
