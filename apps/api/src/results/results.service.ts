import { Inject, Injectable } from "@nestjs/common";
import {
  NEEDS_HELP_BELOW,
  masteryByObjective,
  percentCorrectByQuestion,
  studentScore,
  type AnswerRecord,
  type GameKind,
  type Locale,
  type QuizContent,
  type ReteachPlan,
  type ResultsView,
} from "@helpo/shared";
import { AI_PROVIDER, type AiProvider } from "../ai/ai.provider";
import { notFound } from "../common/problem";
import { sessionAverage } from "../common/stats";
import { contentOf, lessonTitle, objectivesOf } from "../common/views";
import { classWeekXp } from "../common/xp";
import { lessonContext } from "../lessons/lesson-context";
import { LessonViewService } from "../lessons/lesson-view.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * How long a student took: the submitted duration (self-paced), otherwise from joining to their last answer
 * (live quiz). Null when neither exists.
 */
export function participantSeconds(p: { durationSec: number | null; joinedAt: Date }, answers: { createdAt: Date }[]): number | null {
  if (typeof p.durationSec === "number") return p.durationSec;
  if (answers.length === 0) return null;
  const last = Math.max(...answers.map((a) => a.createdAt.getTime()));
  return Math.max(0, Math.round((last - p.joinedAt.getTime()) / 1000));
}

/** Mean of the durations that exist, in whole seconds; null when none. */
export function averageTime(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => typeof x === "number");
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lessons: LessonViewService,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  async get(teacherId: string, lessonId: string, locale: Locale, sessionId?: string): Promise<ResultsView> {
    const lesson = await this.lessons.findOwned(teacherId, lessonId);
    const [quizRes, students, gameRows, goalXp, classRoom] = await Promise.all([
      this.prisma.resource.findUnique({ where: { lessonId_kind: { lessonId, kind: "QUIZ" } }, select: { contentEn: true, contentAr: true } }),
      this.prisma.student.findMany({ where: { classId: lesson.classId }, select: { id: true, fullName: true } }),
      this.prisma.gameResult.groupBy({ by: ["game"], where: { lessonId }, _count: { _all: true }, _avg: { stars: true } }),
      classWeekXp(this.prisma, lesson.classId),
      this.prisma.classRoom.findUnique({ where: { id: lesson.classId }, select: { weeklyGoalXp: true } }),
    ]);
    const classGoal = { goalXp: classRoom?.weeklyGoalXp ?? 500, earnedXp: goalXp };
    const gameInsights = gameRows.map((g) => ({ game: g.game as GameKind, plays: g._count._all, averageStars: Math.round((g._avg.stars ?? 0) * 10) / 10 }));

    // Default session: the newest one that has answers or submissions, else simply the newest.
    // Bounded reads: the session list is plain rows plus ONE grouped count of participants who answered
    // (never every session with all its answers); only the selected session's answers are loaded below.
    const [all, answeredBy] = await Promise.all([
      this.prisma.activitySession.findMany({ where: { lessonId }, orderBy: { createdAt: "desc" }, select: { id: true, type: true, createdAt: true } }),
      this.prisma.participant.groupBy({ by: ["sessionId"], where: { session: { lessonId }, answers: { some: {} } }, _count: { _all: true } }),
    ]);
    const answeredCount = new Map(answeredBy.map((g) => [g.sessionId, g._count._all]));
    const sessions = all.map((s) => ({ id: s.id, type: s.type, createdAt: s.createdAt.toISOString(), answered: answeredCount.get(s.id) ?? 0 }));
    const pickedId = sessionId ?? sessions.find((s) => s.answered > 0)?.id ?? sessions[0]?.id;
    if (sessionId && !all.some((s) => s.id === sessionId)) throw notFound("Session");
    const session = pickedId ? await this.prisma.activitySession.findFirst({ where: { id: pickedId, lessonId } }) : null;

    const quiz = quizRes ? contentOf<QuizContent>(quizRes, locale).content : null;
    const questions = quiz?.questions ?? [];
    const empty: ResultsView = {
      lessonId,
      sessionId: session?.id ?? null,
      answered: 0,
      classSize: students.length,
      average: null,
      mastery: [],
      questions: questions.map((q, index) => ({ index, id: q.id, prompt: q.prompt, objectiveCode: q.objectiveCode, percent: null })),
      misconception: null,
      grid: [],
      needsHelp: [],
      notSubmitted: students.map((s) => ({ studentId: s.id, name: s.fullName })),
      gameInsights,
      classGoal,
      averageTimeSec: null,
      ranking: [],
      sessions,
    };
    if (!session || questions.length === 0) return empty;

    const [answers, participants] = await Promise.all([
      this.prisma.answer.findMany({ where: { sessionId: session.id }, select: { participantId: true, questionIndex: true, correct: true, partial: true, optionIndex: true, createdAt: true } }),
      this.prisma.participant.findMany({ where: { sessionId: session.id }, select: { id: true, studentId: true, displayName: true, durationSec: true, joinedAt: true, student: { select: { fullName: true } } } }),
    ]);
    const records: AnswerRecord[] = answers.map((a) => ({ participantId: a.participantId, questionIndex: a.questionIndex, correct: a.correct, partial: a.partial }));
    const answeredIds = [...new Set(records.map((r) => r.participantId))];
    const byParticipant = new Map(participants.map((p) => [p.id, p]));
    const percents = percentCorrectByQuestion(records, questions.length);
    const mastery = masteryByObjective(records, questions.map((q) => q.objectiveCode));
    const objectives = objectivesOf(lesson, locale);

    // one pass over the answers instead of a records.find() per participant per question
    const cellOf = new Map(records.map((r) => [`${r.participantId}:${r.questionIndex}`, r]));
    const grid = answeredIds
      .map((pid) => {
        const p = byParticipant.get(pid);
        const cells = questions.map((_, qi) => {
          const a = cellOf.get(`${pid}:${qi}`);
          return a ? (a.correct ? "correct" : a.partial ? "partial" : "wrong") : "none";
        }) as ResultsView["grid"][number]["cells"];
        return { participantId: pid, name: p?.student?.fullName ?? p?.displayName ?? "Student", score: studentScore(records, pid, questions.length), cells };
      })
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    const needsHelp = grid
      .filter((g) => g.score < NEEDS_HELP_BELOW)
      .sort((a, b) => a.score - b.score)
      .map((g) => ({
        participantId: g.participantId,
        studentId: byParticipant.get(g.participantId)?.studentId ?? null,
        name: g.name,
        score: g.score,
        missed: g.cells.flatMap((c, i) => (c === "wrong" ? [questions[i].id] : [])),
      }));

    const submittedStudents = new Set(participants.filter((p) => answeredIds.includes(p.id)).map((p) => p.studentId));
    const notSubmitted = students.filter((s) => !submittedStudents.has(s.id)).map((s) => ({ studentId: s.id, name: s.fullName }));

    return {
      lessonId,
      sessionId: session.id,
      answered: answeredIds.length,
      classSize: students.length,
      average: sessionAverage(records, questions.length),
      mastery: objectives.filter((o) => o.code in mastery).map((o) => ({ code: o.code, text: o.text, bloom: o.bloom, value: mastery[o.code] })),
      questions: questions.map((q, index) => ({ index, id: q.id, prompt: q.prompt, objectiveCode: q.objectiveCode, percent: percents[index] })),
      misconception: this.misconception(quiz as QuizContent, percents, answers),
      grid,
      needsHelp,
      notSubmitted,
      gameInsights,
      classGoal,
      averageTimeSec: averageTime(participants.filter((p) => answeredIds.includes(p.id)).map((p) => participantSeconds(p, answers.filter((a) => a.participantId === p.id)))),
      sessions,
      // teacher dashboard only: never sent to students (the live leaderboard is TEAMS by default)
      ranking: grid.map((g) => ({ name: g.name, score: g.score })),
    };
  }

  /** The weakest question (below 60%) and the wrong option most students picked. */
  private misconception(quiz: QuizContent, percents: (number | null)[], answers: { questionIndex: number; optionIndex: number | null; correct: boolean }[]): ResultsView["misconception"] {
    let worst = -1;
    percents.forEach((p, i) => {
      if (p !== null && p < NEEDS_HELP_BELOW && (worst < 0 || p < (percents[worst] as number))) worst = i;
    });
    if (worst < 0) return null;
    const q = quiz.questions[worst];
    const wrong = new Map<number, number>();
    for (const a of answers) if (a.questionIndex === worst && !a.correct && a.optionIndex !== null) wrong.set(a.optionIndex, (wrong.get(a.optionIndex) ?? 0) + 1);
    const top = [...wrong.entries()].sort((a, b) => b[1] - a[1])[0];
    const pct = Math.round((percents[worst] as number) * 100);
    const wrongText = top ? q.options?.[top[0]]?.text : undefined;
    const note = top && wrongText
      ? `Most wrong answers chose "${wrongText}". Only ${pct}% got ${q.id} right.`
      : `Only ${pct}% got ${q.id} right.`;
    return { questionIndex: worst, prompt: q.prompt, percent: percents[worst] as number, note };
  }

  async reteach(teacherId: string, lessonId: string, locale: Locale): Promise<ReteachPlan> {
    const lesson = await this.lessons.findOwned(teacherId, lessonId);
    const results = await this.get(teacherId, lessonId, locale);
    const objectives = objectivesOf(lesson, locale);
    const weakest = [...results.mastery].sort((a, b) => a.value - b.value)[0];
    const objective = objectives.find((o) => o.code === weakest?.code) ?? objectives[0];
    const code = objective?.code ?? weakest?.code ?? "O1";
    const text = objective?.text ?? weakest?.text ?? lessonTitle(lesson, locale);
    return this.ai.reteachPlan(lessonContext(lesson, locale), {
      objectiveCode: code,
      objectiveText: text,
      misconception: results.misconception ? `${results.misconception.prompt} ${results.misconception.note}` : null,
    });
  }
}
