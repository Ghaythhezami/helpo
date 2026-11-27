import { Prisma } from "@prisma/client";
import type { QuizContent } from "@helpo/shared";
import { correctIndex } from "../ai/content";
import { quizCache } from "../common/content-cache";
import { DemoAiProvider } from "../ai/demo.provider";
import { mockPrisma } from "../testing/mock-prisma";
import { GamificationService } from "./gamification.service";
import { PlayService } from "./play.service";

const student = { id: "S1", classId: "C1", displayName: "Sara A.", fullName: "Sara Ahmed", xp: 3340, streakDays: 4, streakSavers: 1, lastActiveDay: null as string | null, locale: "en", avatarItems: [], avatarBackground: "lavender", classRoom: { id: "C1", name: "6B", band: "NAVIGATOR", weeklyGoalXp: 500, pointsEnabled: true, teamsEnabled: false, soundsEnabled: false, celebrationsEnabled: true } };

async function quiz(): Promise<QuizContent> {
  const demo = new DemoAiProvider();
  return (await demo.generateResource("QUIZ", { title: "Photosynthesis", grade: 6, band: "NAVIGATOR", locale: "en", language: "English", durationMin: 45, standard: null, objectives: [], sourceText: "" })).content as QuizContent;
}

function setup() {
  quizCache.clear(); // the quiz LRU is process-wide: every test starts cold
  const db = mockPrisma();
  db.student.findUnique.mockResolvedValue({ ...student });
  const service = new PlayService(db, new GamificationService());
  return { db, service };
}

const session = (over: Record<string, unknown> = {}) => ({ id: "SE1", lessonId: "L1", classId: "C1", type: "LIVE_QUIZ", status: "LIVE", currentQuestion: 0, revealed: false, game: null, lesson: { titleEn: "Photosynthesis", titleAr: "التمثيل الضوئي", resources: [{ id: "R1", updatedAt: new Date(1000), status: "READY" }] }, ...over });

async function quizSetup(sessionOver: Record<string, unknown> = {}) {
  const ctx = setup();
  const q = await quiz();
  ctx.db.activitySession.findFirst.mockResolvedValue(session(sessionOver));
  ctx.db.resource.findUnique.mockResolvedValue({ contentEn: q, contentAr: null });
  ctx.db.participant.upsert.mockResolvedValue({ id: "P1" });
  ctx.db.answer.findMany.mockResolvedValue([]);
  ctx.db.answer.findUnique.mockResolvedValue(null);
  ctx.db.xpEvent.count.mockResolvedValue(0);
  ctx.db.gameResult.count.mockResolvedValue(0);
  ctx.db.student.findUnique.mockResolvedValue({ ...student, streakDays: 4, streakSavers: 1, lastActiveDay: "2020-01-01" });
  return { ...ctx, q };
}

describe("PlayService quiz", () => {
  it("never leaks the answer or explanation before reveal", async () => {
    const { service } = await quizSetup();
    const state = await service.quizState("S1", "SE1", "en");
    expect(state.question).toMatchObject({ prompt: expect.any(String) });
    expect(state.revealed).toBeNull();
    const json = JSON.stringify(state);
    expect(json).not.toContain("correct");
    expect(json).not.toContain("explanation");
    expect(state.question).not.toHaveProperty("correct");
  });

  it("reveals correctness only once the teacher reveals", async () => {
    const { db, service, q } = await quizSetup({ revealed: true });
    db.answer.findMany.mockResolvedValue([{ questionIndex: 0, optionIndex: 0, text: null, correct: true }]);
    const state = await service.quizState("S1", "SE1", "en");
    expect(state.revealed).toMatchObject({ correctIndex: correctIndex(q.questions[0]), correct: true });
  });

  it("is not available in a lobby and 404s for sessions of another class", async () => {
    const { db, service } = await quizSetup({ status: "LOBBY" });
    expect((await service.quizState("S1", "SE1", "en")).question).toBeNull();
    db.activitySession.findFirst.mockResolvedValue(null);
    await expect(service.quizState("S1", "SE1", "en")).rejects.toMatchObject({ status: 404 });
  });

  it("grades on the server: a first-try correct answer earns 10 XP in one transaction", async () => {
    const { db, service, q } = await quizSetup();
    await service.submitAnswer("S1", "SE1", { questionIndex: 0, optionIndex: correctIndex(q.questions[0]) as number }, "en");
    expect(db.$transaction).toHaveBeenCalled();
    expect(db.answer.create.mock.calls[0][0].data).toMatchObject({ correct: true, xpAwarded: 10, questionIndex: 0 });
    expect(db.xpEvent.create.mock.calls[0][0].data).toMatchObject({ amount: 10, reason: "answer:first", studentId: "S1" });
    expect(db.student.update).toHaveBeenCalledWith({ where: { id: "S1" }, data: { xp: { increment: 10 } } });
  });

  it("a wrong first answer earns the 2 XP attempt reward", async () => {
    const { db, service, q } = await quizSetup();
    const wrong = (correctIndex(q.questions[0]) as number) === 0 ? 1 : 0;
    await service.submitAnswer("S1", "SE1", { questionIndex: 0, optionIndex: wrong }, "en");
    expect(db.answer.create.mock.calls[0][0].data).toMatchObject({ correct: false, xpAwarded: 2 });
    expect(db.xpEvent.create.mock.calls[0][0].data.amount).toBe(2);
  });

  it("is idempotent: the same answer twice, or changing a correct answer, awards nothing more", async () => {
    const { db, service, q } = await quizSetup();
    const right = correctIndex(q.questions[0]) as number;
    db.answer.findUnique.mockResolvedValue({ id: "A1", optionIndex: right, text: null, correct: true, xpAwarded: 10 });
    await service.submitAnswer("S1", "SE1", { questionIndex: 0, optionIndex: right }, "en");
    await service.submitAnswer("S1", "SE1", { questionIndex: 0, optionIndex: right === 0 ? 1 : 0 }, "en");
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.xpEvent.create).not.toHaveBeenCalled();
  });

  it("fixing a wrong answer earns the +5 retry total (3 on top of the 2 already given)", async () => {
    const { db, service, q } = await quizSetup();
    const right = correctIndex(q.questions[0]) as number;
    const wrong = right === 0 ? 1 : 0;
    db.answer.findUnique.mockResolvedValue({ id: "A1", optionIndex: wrong, text: null, correct: false, xpAwarded: 2 });
    await service.submitAnswer("S1", "SE1", { questionIndex: 0, optionIndex: right }, "en");
    expect(db.answer.update.mock.calls[0][0].data).toMatchObject({ correct: true, xpAwarded: 5 });
    expect(db.xpEvent.create.mock.calls[0][0].data).toMatchObject({ amount: 3, reason: "answer:retry" });
  });

  it("unlocks NEVER_GIVES_UP at five retried-correct answers", async () => {
    const { db, service, q } = await quizSetup();
    const right = correctIndex(q.questions[0]) as number;
    db.answer.findUnique.mockResolvedValue({ id: "A1", optionIndex: right === 0 ? 1 : 0, text: null, correct: false, xpAwarded: 2 });
    db.xpEvent.count.mockResolvedValue(5);
    db.studentBadge.findUnique.mockResolvedValue(null);
    await service.submitAnswer("S1", "SE1", { questionIndex: 0, optionIndex: right }, "en");
    expect(db.studentBadge.create).toHaveBeenCalledWith({ data: { studentId: "S1", badge: "NEVER_GIVES_UP" } });
  });

  it("rejects closed, out-of-turn and malformed answers", async () => {
    const { db, service } = await quizSetup({ revealed: true });
    await expect(service.submitAnswer("S1", "SE1", { questionIndex: 0, optionIndex: 0 }, "en")).rejects.toMatchObject({ status: 409 });
    db.activitySession.findFirst.mockResolvedValue(session());
    await expect(service.submitAnswer("S1", "SE1", { questionIndex: 3, optionIndex: 0 }, "en")).rejects.toMatchObject({ status: 409 });
    await expect(service.submitAnswer("S1", "SE1", { questionIndex: 0 }, "en")).rejects.toMatchObject({ status: 400 });
    await expect(service.submitAnswer("S1", "SE1", { questionIndex: 99, optionIndex: 0 }, "en")).rejects.toMatchObject({ status: 404 });
    db.activitySession.findFirst.mockResolvedValue(session({ status: "LOBBY" }));
    await expect(service.submitAnswer("S1", "SE1", { questionIndex: 0, optionIndex: 0 }, "en")).rejects.toMatchObject({ status: 409 });
  });

  it("awards no XP when the class turned points off", async () => {
    const { db, service, q } = await quizSetup();
    db.student.findUnique.mockResolvedValue({ ...student, classRoom: { ...student.classRoom, pointsEnabled: false } });
    await service.submitAnswer("S1", "SE1", { questionIndex: 0, optionIndex: correctIndex(q.questions[0]) as number }, "en");
    expect(db.answer.create.mock.calls[0][0].data.xpAwarded).toBe(0);
    expect(db.xpEvent.create).not.toHaveBeenCalled();
  });

  it("swallows a concurrent duplicate (P2002) instead of failing", async () => {
    const { db, service, q } = await quizSetup();
    db.answer.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    await expect(service.submitAnswer("S1", "SE1", { questionIndex: 0, optionIndex: correctIndex(q.questions[0]) as number }, "en")).resolves.toBeDefined();
  });

  it("serves the quiz in the requested language", async () => {
    const { db, service, q } = await quizSetup();
    db.resource.findUnique.mockResolvedValue({ contentEn: q, contentAr: { questions: q.questions.map((x) => ({ ...x, prompt: "سؤال" })) } });
    expect((await service.quizState("S1", "SE1", "ar")).question?.prompt).toBe("سؤال");
    expect((await service.quizState("S1", "SE1", "ar")).lessonTitle).toBe("التمثيل الضوئي");
  });

  it("assignments are self-paced and reveal after answering", async () => {
    const { db, service, q } = await quizSetup({ type: "ASSIGNMENT" });
    db.answer.findMany.mockResolvedValue([{ questionIndex: 0, optionIndex: 0, text: null, correct: false }]);
    const state = await service.quizState("S1", "SE1", "en");
    expect(state.questionIndex).toBe(1);
    expect(state.revealed).toBeNull();
    db.answer.findMany.mockResolvedValue(q.questions.map((_, i) => ({ questionIndex: i, optionIndex: 0, text: null, correct: true })));
    expect((await service.quizState("S1", "SE1", "en")).revealed).not.toBeNull();
  });
});

describe("PlayService quiz polling cost", () => {
  it("a poll is 2 parallel queries and, once the quiz is cached, never reloads the quiz content", async () => {
    const { db, service } = await quizSetup();
    await service.quizState("S1", "SE1", "en");
    expect(db.student.findUnique).not.toHaveBeenCalled(); // scoped through the session's class relation instead
    expect(db.activitySession.findFirst).toHaveBeenCalledTimes(1);
    expect(db.answer.findMany).toHaveBeenCalledTimes(1);
    expect(db.resource.findUnique).toHaveBeenCalledTimes(1); // cold: one content load
    await service.quizState("S1", "SE1", "en");
    await service.quizState("S1", "SE1", "en");
    expect(db.resource.findUnique).toHaveBeenCalledTimes(1); // warm: zero
    expect(db.activitySession.findFirst.mock.calls[0][0].where).toMatchObject({ classRoom: { students: { some: { id: "S1" } } } });
    expect(db.answer.findMany.mock.calls[0][0].select).toEqual({ questionIndex: true, optionIndex: true, text: true, correct: true });
  });

  it("a teacher edit (new updatedAt) or another language is a new cache key", async () => {
    const { db, service } = await quizSetup();
    await service.quizState("S1", "SE1", "en");
    db.activitySession.findFirst.mockResolvedValue(session({ lesson: { titleEn: "P", titleAr: null, resources: [{ id: "R1", updatedAt: new Date(2000), status: "READY" }] } }));
    await service.quizState("S1", "SE1", "en");
    await service.quizState("S1", "SE1", "ar");
    expect(db.resource.findUnique).toHaveBeenCalledTimes(3);
  });

  it("404s while the quiz is not READY", async () => {
    const { db, service } = await quizSetup();
    db.activitySession.findFirst.mockResolvedValue(session({ lesson: { titleEn: "P", titleAr: null, resources: [{ id: "R1", updatedAt: new Date(1000), status: "WORKING" }] } }));
    await expect(service.quizState("S1", "SE1", "en")).rejects.toMatchObject({ status: 404 });
    db.activitySession.findFirst.mockResolvedValue(session({ lesson: { titleEn: "P", titleAr: null, resources: [] } }));
    await expect(service.quizState("S1", "SE1", "en")).rejects.toMatchObject({ status: 404 });
  });

  it("emits session.answer with counts only: no choice, no correct answer, no student", async () => {
    const { db, q } = await quizSetup();
    const events = { emit: jest.fn() };
    const service = new PlayService(db, new GamificationService(), events as never);
    db.answer.count.mockResolvedValue(7);
    await service.submitAnswer("S1", "SE1", { questionIndex: 0, optionIndex: correctIndex(q.questions[0]) as number }, "en");
    expect(events.emit).toHaveBeenCalledWith("session:SE1", "session.answer", { sessionId: "SE1", questionIndex: 0, answered: 7 });
    expect(JSON.stringify(events.emit.mock.calls)).not.toMatch(/correct|choice|optionIndex|S1/);
  });
});

describe("PlayService games and home", () => {
  const gameContent = { type: "matching", title: "G", instructions: "i", timeLimitSec: null, gridSize: 12, statements: Array.from({ length: 6 }, (_, i) => ({ text: `t${i}`, isTrue: i % 2 === 0, explanation: "e" })), pairs: Array.from({ length: 7 }, (_, i) => ({ left: `l${i}`, right: `r${i}` })), sortBaskets: { yes: "y", no: "n" }, sortItems: Array.from({ length: 7 }, (_, i) => ({ label: `s${i}`, belongsInYes: i % 2 === 0 })), equationTiles: ["a", "+", "b"] };

  function gameSetup() {
    const ctx = setup();
    ctx.db.lesson.findFirst.mockResolvedValue({ titleEn: "Photosynthesis", titleAr: null, resources: [{ contentEn: gameContent, contentAr: null }] });
    ctx.db.gameResult.aggregate.mockResolvedValue({ _max: { stars: 0 } });
    ctx.db.xpEvent.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    ctx.db.xpEvent.count.mockResolvedValue(0);
    ctx.db.gameResult.count.mockResolvedValue(0);
    ctx.db.studentBadge.findUnique.mockResolvedValue(null);
    ctx.db.student.findUniqueOrThrow.mockResolvedValue({ xp: 3415 });
    ctx.db.student.findUnique.mockResolvedValue({ ...student, lastActiveDay: "2020-01-01" });
    return ctx;
  }

  it("scores a perfect MATCH round server-side, caps XP, unlocks PLANT_SCOUT and streams the new level", async () => {
    const { db, service } = gameSetup();
    const result = await service.submitGame("S1", { lessonId: "L1", game: "MATCH", total: 7, firstTryCorrect: 7, retriedCorrect: 0, wrongTries: 0, hintsUsed: 0 }, "en");
    expect(result).toMatchObject({ stars: 3, xp: 80, personalBest: true, totalXp: 3415, level: 7, badgeUnlocked: { key: "PLANT_SCOUT" } });
    expect(db.gameResult.create.mock.calls[0][0].data).toMatchObject({ stars: 3, xp: 80, total: 7 });
    expect(db.xpEvent.create.mock.calls[0][0].data).toMatchObject({ amount: 80, reason: "game:match" });
  });

  it("ignores inflated client counts and a fake total", async () => {
    const { db, service } = gameSetup();
    await service.submitGame("S1", { lessonId: "L1", game: "SORT", total: 40, firstTryCorrect: 40, retriedCorrect: 40, wrongTries: 0, hintsUsed: 0 }, "en");
    expect(db.gameResult.create.mock.calls[0][0].data).toMatchObject({ total: 7, firstTry: 7, retried: 0 });
    expect(db.xpEvent.create.mock.calls[0][0].data.amount).toBeLessThanOrEqual(80);
  });

  it("caps game XP per day", async () => {
    const { db, service } = gameSetup();
    db.xpEvent.aggregate.mockResolvedValue({ _sum: { amount: 395 } });
    const r = await service.submitGame("S1", { lessonId: "L1", game: "SORT", total: 7, firstTryCorrect: 7, retriedCorrect: 0, wrongTries: 0, hintsUsed: 0 }, "en");
    expect(r.xp).toBe(5);
    db.xpEvent.aggregate.mockResolvedValue({ _sum: { amount: 400 } });
    expect((await service.submitGame("S1", { lessonId: "L1", game: "SORT", total: 7, firstTryCorrect: 7, retriedCorrect: 0, wrongTries: 0, hintsUsed: 0 }, "en")).xp).toBe(0);
  });

  it("practice games are worth 100 points; wrong tries cost 1 and hints cost 5", async () => {
    const { db, service } = gameSetup();
    const perfect = await service.submitGame("S1", { lessonId: "L1", game: "SORT", total: 7, firstTryCorrect: 7, retriedCorrect: 0, wrongTries: 0, hintsUsed: 0 }, "en");
    expect(perfect.points).toBe(100);
    const messy = await service.submitGame("S1", { lessonId: "L1", game: "SORT", total: 7, firstTryCorrect: 7, retriedCorrect: 0, wrongTries: 3, hintsUsed: 2 }, "en");
    expect(messy.points).toBe(100 - 3 - 10);
    expect(db.gameResult.create.mock.calls[1][0].data).toMatchObject({ points: 87, wrongTries: 3, hintsUsed: 2 });
    expect(messy.xp).toBe(perfect.xp); // XP rules are unchanged: they reward effort, not points
  });

  it("a session's published games split the 100 points; a game outside the list is refused", async () => {
    const { db, service } = gameSetup();
    db.activitySession.findFirst.mockResolvedValue({ id: "SE5", game: "SORT", games: ["SORT", "MATCH", "TRUE_FALSE"] });
    const r = await service.submitGame("S1", { lessonId: "L1", sessionId: "SE5", game: "SORT", total: 7, firstTryCorrect: 7, retriedCorrect: 0, wrongTries: 1, hintsUsed: 0 }, "en");
    expect(r.points).toBe(34 - 1); // 100 / 3 -> 34, 33, 33; the first game gets the extra point
    expect(db.gameResult.create.mock.calls[0][0].data).toMatchObject({ sessionId: "SE5", points: 33 });
    await expect(service.submitGame("S1", { lessonId: "L1", sessionId: "SE5", game: "EQUATION", total: 3, firstTryCorrect: 3, retriedCorrect: 0, wrongTries: 0, hintsUsed: 0 }, "en")).rejects.toMatchObject({ status: 400 });
    db.activitySession.findFirst.mockResolvedValue({ id: "SE6", game: null, games: null }); // unrestricted share
    expect((await service.submitGame("S1", { lessonId: "L1", sessionId: "SE6", game: "SORT", total: 7, firstTryCorrect: 7, retriedCorrect: 0, wrongTries: 0, hintsUsed: 0 }, "en")).points).toBe(100);
    db.activitySession.findFirst.mockResolvedValue(null); // a session of another class is simply ignored: practice weight
    expect((await service.submitGame("S1", { lessonId: "L1", sessionId: "NOPE", game: "SORT", total: 7, firstTryCorrect: 7, retriedCorrect: 0, wrongTries: 0, hintsUsed: 0 }, "en")).points).toBe(100);
  });

  it("odd one out rounds are sized by the lesson's oddOneOut rounds", async () => {
    const { db, service } = gameSetup();
    const round = (i: number) => ({ items: [`a${i}`, `b${i}`, `c${i}`, `d${i}`], oddIndex: i % 4, explanation: "because" });
    db.lesson.findFirst.mockResolvedValue({ titleEn: "P", titleAr: null, resources: [{ contentEn: { ...gameContent, oddOneOut: [0, 1, 2, 3, 4].map(round) }, contentAr: null }] });
    await service.submitGame("S1", { lessonId: "L1", game: "ODD_ONE_OUT", total: 40, firstTryCorrect: 40, retriedCorrect: 0, wrongTries: 0, hintsUsed: 0 }, "en");
    expect(db.gameResult.create.mock.calls[0][0].data).toMatchObject({ game: "ODD_ONE_OUT", total: 5, firstTry: 5 });
  });

  it("only MATCH with 3 stars earns PLANT_SCOUT; five retried games unlock NEVER_GIVES_UP", async () => {
    const { db, service } = gameSetup();
    const r = await service.submitGame("S1", { lessonId: "L1", game: "SORT", total: 7, firstTryCorrect: 7, retriedCorrect: 0, wrongTries: 0, hintsUsed: 0 }, "en");
    expect(r.badgeUnlocked).toBeNull();
    db.gameResult.count.mockResolvedValue(5);
    const r2 = await service.submitGame("S1", { lessonId: "L1", game: "SORT", total: 7, firstTryCorrect: 4, retriedCorrect: 3, wrongTries: 0, hintsUsed: 0 }, "en");
    expect(r2.badgeUnlocked).toMatchObject({ key: "NEVER_GIVES_UP" });
  });

  it("returns games with best stars and rejects unknown games and lessons", async () => {
    const { db, service } = gameSetup();
    db.gameResult.aggregate.mockResolvedValue({ _max: { stars: 2 } });
    expect(await service.game("S1", "L1", "MATCH", "en")).toMatchObject({ bestStars: 2, game: "MATCH", lessonTitle: "Photosynthesis" });
    expect(await service.game("S1", "L1", "MEMORY", "en")).toMatchObject({ game: "MEMORY" });
    await expect(service.game("S1", "L1", "CHESS", "en")).rejects.toMatchObject({ status: 404 });
    db.lesson.findFirst.mockResolvedValue(null);
    await expect(service.game("S1", "L1", "SORT", "en")).rejects.toMatchObject({ status: 404 });
  });

  it("game practice needs no teacher session: any READY/PARTIAL lesson of the student's class can be played and scored", async () => {
    const { db, service } = gameSetup();
    db.activitySession.findFirst.mockResolvedValue(null);
    db.activitySession.findMany.mockResolvedValue([]); // nothing assigned or open
    expect(await service.game("S1", "L1", "SORT", "en")).toMatchObject({ lessonId: "L1", game: "SORT" });
    expect(db.lesson.findFirst.mock.calls[0][0].where).toEqual({ id: "L1", classId: "C1", status: { in: ["READY", "PARTIAL"] }, approvedAt: { not: null } });
    expect(db.activitySession.findFirst).not.toHaveBeenCalled();
    const result = await service.submitGame("S1", { lessonId: "L1", game: "SORT", total: 7, firstTryCorrect: 7, retriedCorrect: 0, wrongTries: 0, hintsUsed: 0 }, "en");
    expect(result.stars).toBe(3);
    expect(db.gameResult.create.mock.calls[0][0].data).toMatchObject({ lessonId: "L1", sessionId: null, game: "SORT" });
    db.lesson.findFirst.mockResolvedValue(null); // another class's lesson: 404
    await expect(service.submitGame("S1", { lessonId: "OTHER", game: "SORT", total: 7, firstTryCorrect: 7, retriedCorrect: 0, wrongTries: 0, hintsUsed: 0 }, "en")).rejects.toMatchObject({ status: 404 });
  });

  it("lists only the templates the game content can feed for the class band, with assigned flags", async () => {
    const { db, service } = gameSetup();
    db.lesson.findMany.mockResolvedValue([{ id: "L1", titleEn: "Photosynthesis", titleAr: null, resources: [{ contentEn: gameContent, contentAr: null }] }]);
    db.gameResult.groupBy.mockResolvedValue([{ lessonId: "L1", game: "MATCH", _max: { stars: 3 } }]);
    db.activitySession.findMany.mockResolvedValue([{ lessonId: "L1", game: "SORT" }]);
    const list = await service.listGames("S1", "en");
    expect(list.map((g) => g.game)).toEqual(["SORT", "EQUATION", "MATCH", "TRUE_FALSE", "MEMORY"]); // learning-value order; no oddOneOut content, so no ODD_ONE_OUT
    expect(list.find((g) => g.game === "MATCH")).toMatchObject({ bestStars: 3, assigned: false });
    expect(list.find((g) => g.game === "SORT")?.assigned).toBe(true);
  });

  it("with a sessionId, games and the list show only what the teacher published for that session, with points", async () => {
    const { db, service } = gameSetup();
    db.lesson.findMany.mockResolvedValue([{ id: "L1", titleEn: "Photosynthesis", titleAr: null, resources: [{ contentEn: gameContent, contentAr: null }] }]);
    db.gameResult.groupBy.mockResolvedValue([]);
    db.activitySession.findMany.mockResolvedValue([]);
    db.activitySession.findFirst.mockResolvedValue({ id: "SE5", lessonId: "L1", game: "SORT", games: ["SORT", "MATCH"] });
    const list = await service.listGames("S1", "en", "SE5");
    expect(list.map((g) => [g.game, g.points])).toEqual([["SORT", 50], ["MATCH", 50]]);
    expect(db.lesson.findMany.mock.calls[0][0].where).toMatchObject({ id: "L1" });
    expect(db.activitySession.findFirst.mock.calls[0][0].where).toMatchObject({ id: "SE5", classId: "C1" });
    expect(await service.game("S1", "L1", "SORT", "en", "SE5")).toMatchObject({ game: "SORT", pointsWeight: 50 });
    await expect(service.game("S1", "L1", "MEMORY", "en", "SE5")).rejects.toMatchObject({ status: 404 }); // not published
    await expect(service.game("S1", "L2", "SORT", "en", "SE5")).rejects.toMatchObject({ status: 404 }); // another lesson
    db.activitySession.findFirst.mockResolvedValue(null);
    await expect(service.listGames("S1", "en", "SE9")).rejects.toMatchObject({ status: 404 });
  });

  it("builds the home view: level 7 with 340 XP in, streak, badges and unlocked avatar", async () => {
    const { db, service } = setup();
    const today = new Date().toISOString().slice(0, 10);
    db.student.findUnique.mockResolvedValue({ ...student, lastActiveDay: today });
    db.xpEvent.aggregate.mockResolvedValue({ _sum: { amount: 380 } });
    db.xpEvent.groupBy.mockResolvedValue([]);
    db.answer.count.mockResolvedValue(3);
    db.gameResult.count.mockResolvedValue(1);
    db.activitySession.findFirst.mockResolvedValue({ id: "SE1", type: "LIVE_QUIZ", game: null, lesson: { titleEn: "Photosynthesis", titleAr: null } });
    db.lesson.findMany.mockResolvedValue([{ id: "L1", titleEn: "One", titleAr: null, lessonNumber: 1 }, { id: "L2", titleEn: "Two", titleAr: null, lessonNumber: 2 }, { id: "L3", titleEn: "Three", titleAr: null, lessonNumber: 3 }]);
    db.activitySession.findMany.mockResolvedValue([{ lessonId: "L1" }]);
    db.studentBadge.findMany.mockResolvedValue([{ badge: "PLANT_SCOUT" }]);
    const home = await service.home("S1", "en");
    expect(home).toMatchObject({ level: 7, xpIntoLevel: 340, levelTitle: "Plant Scout", locale: "en", streak: { days: 4, saversLeft: 1 } });
    expect(home.journey.map((j) => j.state)).toEqual(["done", "current", "locked"]);
    expect(home.badges.find((b) => b.key === "PLANT_SCOUT")?.earned).toBe(true);
    expect(home.classGoal.goalXp).toBe(500);
    expect(home.live?.sessionId).toBe("SE1");
    expect(home.avatar.unlocked).toContain("backpack");
  });

  it("shows a lapsed streak kindly, sets avatar only from unlocked items and stores the locale", async () => {
    const { db, service } = setup();
    db.student.findUnique.mockResolvedValue({ ...student, xp: 100, lastActiveDay: "2020-01-01" });
    db.xpEvent.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    db.lesson.findMany.mockResolvedValue([]);
    db.activitySession.findMany.mockResolvedValue([]);
    db.studentBadge.findMany.mockResolvedValue([]);
    db.answer.count.mockResolvedValue(0);
    db.gameResult.count.mockResolvedValue(0);
    expect((await service.home("S1", "en")).streak.message).toMatch(/Welcome back/);
    await expect(service.setAvatar("S1", { items: ["backpack"], background: "lavender" }, "en")).rejects.toMatchObject({ status: 400 });
    await service.setAvatar("S1", { items: ["scarf"], background: "lavender" }, "en");
    expect(db.student.update).toHaveBeenCalledWith({ where: { id: "S1" }, data: { avatarItems: ["scarf"], avatarBackground: "lavender" } });
    await service.setLocale("S1", "ar");
    expect(db.student.update).toHaveBeenCalledWith({ where: { id: "S1" }, data: { locale: "ar" } });
  });
});

describe("PlayService self-paced submit", () => {
  async function batch(over: Record<string, unknown> = {}) {
    const ctx = await quizSetup({ type: "ASSIGNMENT", isOpen: true, expiresAt: null, joinCode: "123456", ...over });
    ctx.db.activitySession.findFirst.mockResolvedValue(session({ type: "ASSIGNMENT", isOpen: true, expiresAt: null, joinCode: "123456", ...over }));
    ctx.db.participant.upsert.mockResolvedValue({ id: "P1", submittedAt: null, durationSec: null });
    return ctx;
  }

  it("scores on the server, awards first-try XP once and reveals answers only in the response", async () => {
    const { db, service, q } = await batch();
    const answers = q.questions.map((x, i) => ({ questionId: x.id, optionIndex: i < 4 ? (correctIndex(x) as number) : undefined, text: x.type === "short" ? "no idea" : undefined })).filter((a) => a.optionIndex !== undefined || a.text);
    const r = await service.submitBatch("S1", "123456", { answers, durationSec: 95 }, "en");
    expect(r).toMatchObject({ correct: 4, total: 10, durationSec: 95, alreadySubmitted: false });
    expect(r.score).toBeCloseTo(0.4);
    expect(r.xp).toBe(4 * 10 + 2);
    expect(r.review).toHaveLength(5);
    expect(db.answer.createMany.mock.calls[0][0].data).toHaveLength(5);
    expect(db.participant.update.mock.calls[0][0].data).toMatchObject({ durationSec: 95 });
    expect(db.xpEvent.create.mock.calls[0][0].data).toMatchObject({ amount: 42, reason: "answer:self-paced" });
  });

  it("is idempotent: a second submit returns the first result and writes nothing", async () => {
    const { db, service, q } = await batch();
    db.participant.upsert.mockResolvedValue({ id: "P1", submittedAt: new Date(), durationSec: 80 });
    db.answer.findMany.mockResolvedValue([{ questionIndex: 0, correct: true, xpAwarded: 10 }, { questionIndex: 1, correct: false, xpAwarded: 2 }]);
    const r = await service.submitBatch("S1", "123456", { answers: [{ questionId: q.questions[0].id, optionIndex: 0 }], durationSec: 1 }, "en");
    expect(r).toMatchObject({ alreadySubmitted: true, correct: 1, xp: 12, durationSec: 80 });
    expect(db.answer.createMany).not.toHaveBeenCalled();
  });

  it("ignores unknown and duplicate question ids and refuses closed or expired links", async () => {
    const { db, service, q } = await batch();
    await service.submitBatch("S1", "123456", { answers: [{ questionId: "Q99", optionIndex: 0 }, { questionId: q.questions[0].id, optionIndex: 0 }, { questionId: q.questions[0].id, optionIndex: 1 }], durationSec: 5 }, "en");
    expect(db.answer.createMany.mock.calls[0][0].data).toHaveLength(1);
    db.activitySession.findFirst.mockResolvedValue(session({ type: "ASSIGNMENT", isOpen: false }));
    await expect(service.submitBatch("S1", "123456", { answers: [], durationSec: 1 }, "en")).rejects.toMatchObject({ status: 409 });
    db.activitySession.findFirst.mockResolvedValue(session({ type: "ASSIGNMENT", isOpen: true, expiresAt: new Date(Date.now() - 1000) }));
    await expect(service.submitBatch("S1", "123456", { answers: [], durationSec: 1 }, "en")).rejects.toMatchObject({ status: 409 });
    db.activitySession.findFirst.mockResolvedValue(null);
    await expect(service.submitBatch("S1", "000000", { answers: [], durationSec: 1 }, "en")).rejects.toMatchObject({ status: 404 });
  });

  it("students who joined through the picker learn the join code from the questions, and can submit by session id", async () => {
    const { db, service, q } = await batch();
    const out = await service.questionsFor("S1", "SE1", "en");
    expect(out.joinCode).toBe("123456");
    db.activitySession.findFirst.mockResolvedValueOnce({ joinCode: "123456" });
    const r = await service.submitBySession("S1", "SE1", { answers: [{ questionId: q.questions[0].id, optionIndex: 0 }], durationSec: 7 }, "en");
    expect(r.total).toBe(10);
    expect(db.activitySession.findFirst.mock.calls.at(-2)[0].where).toEqual({ id: "SE1", classId: "C1", type: "ASSIGNMENT" });
    db.activitySession.findFirst.mockResolvedValueOnce(null);
    await expect(service.submitBySession("S1", "SE9", { answers: [], durationSec: 1 }, "en")).rejects.toMatchObject({ status: 404 });
  });

  it("serves the questions without correct flags or accepted answers", async () => {
    const { service } = await batch();
    const out = await service.questionsFor("S1", "SE1", "en");
    expect(out.questions).toHaveLength(10);
    expect(JSON.stringify(out)).not.toMatch(/"correct"|acceptedAnswers|explanation/);
    const live = await quizSetup();
    await expect(live.service.questionsFor("S1", "SE1", "en")).rejects.toMatchObject({ status: 409 });
  });
});
