import { PlayController } from "./play.controller";
import { RATE_LIMIT_KEY, RateLimitGuard } from "../common/rate-limit";
import { STUDENT_COOKIE, signStudentToken } from "../common/student-cookie";
import { mockPrisma } from "../testing/mock-prisma";
import { GamificationService } from "./gamification.service";
import { PracticeService } from "./practice.service";
import { correctAnswerText, optionOrder, scrambledPairs, seededRng } from "./practice";

const student = { id: "S1", classId: "C1", displayName: "Sara A.", xp: 100, streakDays: 0, streakSavers: 1, lastActiveDay: "2020-01-01" as string | null, locale: "en", classRoom: { id: "C1", name: "6B", band: "NAVIGATOR", pointsEnabled: true } };

const quiz = {
  questions: [
    { id: "Q1", type: "mcq", prompt: "Which gas do plants take in?", options: [{ text: "Oxygen", correct: false }, { text: "Carbon dioxide", correct: true }, { text: "Nitrogen", correct: false }, { text: "Helium", correct: false }], acceptedAnswers: null, pairs: null, explanation: "Plants use CO2.", concept: "c", objectiveCode: "O1", difficulty: "easy", timeLimitSec: 20 },
    { id: "Q2", type: "tf", prompt: "Leaves are green because of chlorophyll.", options: [{ text: "True", correct: true }, { text: "False", correct: false }], acceptedAnswers: null, pairs: null, explanation: "Chlorophyll is green.", concept: "c", objectiveCode: "O1", difficulty: "easy", timeLimitSec: 15 },
    { id: "Q3", type: "short", prompt: "Name the green pigment.", options: null, acceptedAnswers: ["chlorophyll"], pairs: null, explanation: "It is chlorophyll.", concept: "c", objectiveCode: "O1", difficulty: "medium", timeLimitSec: 30 },
    { id: "Q4", type: "matching", prompt: "Match.", options: null, acceptedAnswers: null, pairs: [{ left: "Root", right: "Water" }, { left: "Leaf", right: "Light" }, { left: "Stem", right: "Support" }], explanation: "Each organ has a job.", concept: "c", objectiveCode: "O1", difficulty: "medium", timeLimitSec: 40 },
  ],
};

const gameContent = { type: "matching", title: "G", instructions: "i", timeLimitSec: null, gridSize: 12, statements: Array.from({ length: 6 }, (_, i) => ({ text: `t${i}`, isTrue: i % 2 === 0, explanation: "e" })), pairs: Array.from({ length: 7 }, (_, i) => ({ left: `l${i}`, right: `r${i}` })), sortBaskets: { yes: "y", no: "n" }, sortItems: Array.from({ length: 7 }, (_, i) => ({ label: `s${i}`, belongsInYes: i % 2 === 0 })), equationTiles: ["a", "+", "b"] };

function setup() {
  const db = mockPrisma();
  db.student.findUnique.mockResolvedValue({ ...student, classRoom: { ...student.classRoom } });
  db.lesson.findFirst.mockResolvedValue({ titleEn: "Photosynthesis", titleAr: "التمثيل الضوئي", resources: [{ contentEn: quiz, contentAr: null }] });
  db.xpEvent.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
  db.student.findUnique.mockResolvedValue({ ...student, classRoom: { ...student.classRoom } });
  return { db, service: new PracticeService(db, new GamificationService()) };
}

/** Everything a perfect student would send, given the options as they were shown. */
async function perfect(service: PracticeService) {
  const shown = await service.quiz("S1", "L1", "en");
  const q1 = shown.questions[0];
  return {
    answers: [
      { questionId: "Q1", optionIndex: (q1.options as string[]).indexOf("Carbon dioxide") },
      { questionId: "Q2", optionIndex: 0 },
      { questionId: "Q3", text: "Chlorophyll" },
      { questionId: "Q4", pairs: [{ left: "Root", right: "Water" }, { left: "Leaf", right: "Light" }, { left: "Stem", right: "Support" }] },
    ],
    durationSec: 40,
  };
}

describe("PracticeService.list", () => {
  it("lists open sessions (with join codes) and every READY/PARTIAL lesson with quiz size, playable games and best stars", async () => {
    const { db, service } = setup();
    db.activitySession.findMany.mockResolvedValue([
      { id: "SE1", type: "LIVE_QUIZ", joinCode: "202020", game: null, games: null, lesson: { titleEn: "Live one", titleAr: null } },
      { id: "SE2", type: "ASSIGNMENT", joinCode: "303030", game: null, games: null, lesson: { titleEn: "Homework", titleAr: null } },
      { id: "SE3", type: "GAME", joinCode: "404040", game: "SORT", games: ["SORT", "ODD_ONE_OUT", "MATCH"], lesson: { titleEn: "Games", titleAr: null } },
    ]);
    db.lesson.findMany.mockResolvedValue([
      { id: "L1", titleEn: "Photosynthesis", titleAr: "التمثيل الضوئي", lessonNumber: 1, resources: [{ kind: "QUIZ", contentEn: quiz, contentAr: null }, { kind: "GAME", contentEn: gameContent, contentAr: null }] },
      { id: "L2", titleEn: "Only a quiz", titleAr: null, lessonNumber: null, resources: [{ kind: "QUIZ", contentEn: quiz, contentAr: null }] },
      { id: "L3", titleEn: "Partial, nothing ready", titleAr: null, lessonNumber: 3, resources: [] },
    ]);
    db.gameResult.groupBy.mockResolvedValue([{ lessonId: "L1", _max: { stars: 2 } }]);

    const out = await service.list("S1", "en");

    expect(out.className).toBe("6B");
    expect(out.open).toEqual([
      { sessionId: "SE1", type: "LIVE_QUIZ", joinCode: "202020", lessonTitle: "Live one", games: [] },
      { sessionId: "SE2", type: "ASSIGNMENT", joinCode: "303030", lessonTitle: "Homework", games: [] },
      // the games the teacher published, with their share of the 100 points (the 100 / 3 remainder goes to the first)
      { sessionId: "SE3", type: "GAME", joinCode: "404040", lessonTitle: "Games", games: [{ game: "SORT", points: 34 }, { game: "ODD_ONE_OUT", points: 33 }, { game: "MATCH", points: 33 }] },
    ]);
    expect(out.lessons).toHaveLength(3);
    expect(out.lessons[0]).toMatchObject({ lessonId: "L1", title: "Photosynthesis", number: 1, quizQuestions: 4, bestStars: 2 });
    expect([...out.lessons[0].games].sort()).toEqual(["EQUATION", "MATCH", "MEMORY", "SORT", "TRUE_FALSE"]);
    expect(out.lessons[1]).toMatchObject({ lessonId: "L2", number: null, quizQuestions: 4, games: [], bestStars: 0 });
    expect(out.lessons[2]).toMatchObject({ lessonId: "L3", quizQuestions: 0, games: [] });
  });

  it("is scoped to the student's class and asks only for non-ended, non-expired open sessions and READY/PARTIAL lessons", async () => {
    const { db, service } = setup();
    db.activitySession.findMany.mockResolvedValue([]);
    db.lesson.findMany.mockResolvedValue([]);
    db.gameResult.groupBy.mockResolvedValue([]);
    await service.list("S1", "en");
    const sessionWhere = db.activitySession.findMany.mock.calls[0][0].where;
    expect(sessionWhere.classId).toBe("C1");
    expect(sessionWhere.OR[0]).toEqual({ type: "LIVE_QUIZ", status: { in: ["LOBBY", "LIVE"] } });
    expect(sessionWhere.OR[1]).toMatchObject({ type: { in: ["ASSIGNMENT", "GAME"] }, status: { not: "ENDED" }, isOpen: true });
    expect(sessionWhere.OR[1].OR).toEqual([{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }]);
    expect(db.lesson.findMany.mock.calls[0][0].where).toMatchObject({ classId: "C1", status: { in: ["READY", "PARTIAL"] } });
    expect(db.gameResult.groupBy.mock.calls[0][0].where).toEqual({ studentId: "S1" });
  });

  it("follows the request locale and falls back to the other language", async () => {
    const { db, service } = setup();
    db.activitySession.findMany.mockResolvedValue([]);
    db.gameResult.groupBy.mockResolvedValue([]);
    db.lesson.findMany.mockResolvedValue([{ id: "L1", titleEn: "Photosynthesis", titleAr: "التمثيل الضوئي", lessonNumber: 1, resources: [] }, { id: "L2", titleEn: "English only", titleAr: null, lessonNumber: 2, resources: [] }]);
    const ar = await service.list("S1", "ar");
    expect(ar.lessons.map((l) => l.title)).toEqual(["التمثيل الضوئي", "English only"]);
    expect((await service.list("S1", "en")).lessons[0].title).toBe("Photosynthesis");
  });

  it("an unknown student is a 404", async () => {
    const { db, service } = setup();
    db.student.findUnique.mockResolvedValue(null);
    await expect(service.list("nope", "en")).rejects.toMatchObject({ status: 404 });
  });
});

describe("PracticeService.quiz", () => {
  it("never leaks correct flags, accepted answers or explanations", async () => {
    const { service } = setup();
    const out = await service.quiz("S1", "L1", "en");
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/correct|acceptedAnswers|explanation|chlorophyll is green|Plants use CO2|It is chlorophyll/i);
    expect(out).toMatchObject({ lessonId: "L1", lessonTitle: "Photosynthesis" });
    expect(out.questions.map((q) => q.id)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
    expect(Object.keys(out.questions[0]).sort()).toEqual(["id", "options", "pairs", "prompt", "timeLimitSec", "type"]);
    expect(out.questions[2]).toMatchObject({ type: "short", options: null, pairs: null });
  });

  it("shuffles multiple-choice options and matching columns, identically on every request for the same student and lesson", async () => {
    const { service } = setup();
    const a = await service.quiz("S1", "L1", "en");
    const b = await service.quiz("S1", "L1", "en");
    expect(a).toEqual(b);
    expect([...(a.questions[0].options as string[])].sort()).toEqual(["Carbon dioxide", "Helium", "Nitrogen", "Oxygen"]);
    expect(a.questions[1].options).toEqual(["True", "False"]); // true/false keeps its natural order
    const rows = a.questions[3].pairs as { left: string; right: string }[];
    expect(rows.map((p) => p.left)).toEqual(["Root", "Leaf", "Stem"]);
    expect(rows.map((p) => p.right).sort()).toEqual(["Light", "Support", "Water"]);
    for (const [i, p] of quiz.questions[3].pairs!.entries()) expect(rows[i].right).not.toBe(p.right); // no row shows its own answer
  });

  it("is class-scoped: a lesson of another class (or a lesson with no ready quiz) is a 404", async () => {
    const { db, service } = setup();
    db.lesson.findFirst.mockResolvedValue(null);
    await expect(service.quiz("S1", "OTHER", "en")).rejects.toMatchObject({ status: 404 });
    expect(db.lesson.findFirst.mock.calls[0][0].where).toMatchObject({ id: "OTHER", classId: "C1", status: { in: ["READY", "PARTIAL"] } });
    db.lesson.findFirst.mockResolvedValue({ titleEn: "x", titleAr: null, resources: [] });
    await expect(service.quiz("S1", "L1", "en")).rejects.toMatchObject({ status: 404 });
  });
});

describe("PracticeService.submit", () => {
  it("grades on the server, maps the shuffled option position back, and returns a full review with answers and explanations", async () => {
    const { service } = setup();
    const out = await service.submit("S1", "L1", await perfect(service), "en");
    expect(out).toMatchObject({ score: 1, correct: 4, total: 4, xp: 8 });
    expect(out.review).toEqual([
      { questionId: "Q1", correct: true, explanation: "Plants use CO2.", correctAnswer: "Carbon dioxide" },
      { questionId: "Q2", correct: true, explanation: "Chlorophyll is green.", correctAnswer: "True" },
      { questionId: "Q3", correct: true, explanation: "It is chlorophyll.", correctAnswer: "chlorophyll" },
      { questionId: "Q4", correct: true, explanation: "Each organ has a job.", correctAnswer: "Root → Water; Leaf → Light; Stem → Support" },
    ]);
  });

  it("wrong, missing and malformed answers are incorrect; an honest attempt earns 1 XP and a skipped question nothing", async () => {
    const { service } = setup();
    const shown = await service.quiz("S1", "L1", "en");
    const wrong = (shown.questions[0].options as string[]).indexOf("Helium");
    const out = await service.submit("S1", "L1", { answers: [{ questionId: "Q1", optionIndex: wrong }, { questionId: "Q2", optionIndex: 9 }, { questionId: "NOPE", optionIndex: 0 }, { questionId: "Q1", optionIndex: 0 }], durationSec: 5 }, "en");
    expect(out).toMatchObject({ score: 0, correct: 0, total: 4, xp: 1 }); // Q1 wrong (1), Q2 out of range (ungradable), the duplicate and unknown ids ignored
    expect(out.review.map((r) => r.correct)).toEqual([false, false, false, false]);
    expect(out.review[2].correctAnswer).toBe("chlorophyll");
  });

  it("awards practice XP through the XP path with reason practice:<lesson> and keeps the streak alive", async () => {
    const { db, service } = setup();
    await service.submit("S1", "L1", await perfect(service), "en");
    expect(db.xpEvent.create).toHaveBeenCalledWith({ data: { studentId: "S1", classId: "C1", amount: 8, reason: "practice:L1" } });
    expect(db.student.update).toHaveBeenCalledWith({ where: { id: "S1" }, data: { xp: { increment: 8 } } });
    expect(db.xpEvent.aggregate.mock.calls[0][0].where).toMatchObject({ studentId: "S1", reason: "practice:L1", createdAt: { gte: expect.any(Date) } });
    expect(db.$transaction).toHaveBeenCalled();
  });

  it("caps practice XP at 20 per lesson per day", async () => {
    const { db, service } = setup();
    const body = await perfect(service);
    db.xpEvent.aggregate.mockResolvedValue({ _sum: { amount: 15 } });
    expect((await service.submit("S1", "L1", body, "en")).xp).toBe(5);
    expect(db.xpEvent.create.mock.calls[0][0].data.amount).toBe(5);
    db.xpEvent.create.mockClear();
    db.xpEvent.aggregate.mockResolvedValue({ _sum: { amount: 20 } });
    const out = await service.submit("S1", "L1", body, "en");
    expect(out).toMatchObject({ xp: 0, correct: 4 }); // still graded and reviewed, just no more XP
    expect(db.xpEvent.create).not.toHaveBeenCalled();
    expect(db.student.update.mock.calls.filter((c: [{ data: { xp?: unknown } }]) => c[0].data.xp)).toHaveLength(1); // only the first call incremented xp
  });

  it("no XP when the class has points turned off, and none for an empty submission", async () => {
    const { db, service } = setup();
    const body = await perfect(service);
    db.student.findUnique.mockResolvedValue({ ...student, classRoom: { ...student.classRoom, pointsEnabled: false } });
    expect((await service.submit("S1", "L1", body, "en")).xp).toBe(0);
    db.student.findUnique.mockResolvedValue({ ...student, classRoom: { ...student.classRoom } });
    expect(await service.submit("S1", "L1", { answers: [], durationSec: 0 }, "en")).toMatchObject({ score: 0, correct: 0, total: 4, xp: 0 });
    expect(db.xpEvent.create).not.toHaveBeenCalled();
  });

  it("never creates Participant or Answer rows, so class results and mastery are untouched", async () => {
    const { db, service } = setup();
    await service.submit("S1", "L1", await perfect(service), "en");
    for (const model of ["participant", "answer"]) {
      for (const method of ["create", "createMany", "upsert", "update", "updateMany"]) expect(db[model][method]).not.toHaveBeenCalled();
    }
    expect(db.activitySession.create).not.toHaveBeenCalled();
    expect(db.gameResult.create).not.toHaveBeenCalled();
  });

  it("is class-scoped: another class's lesson is a 404 and nothing is written", async () => {
    const { db, service } = setup();
    db.lesson.findFirst.mockResolvedValue(null);
    await expect(service.submit("S1", "OTHER", { answers: [], durationSec: 1 }, "en")).rejects.toMatchObject({ status: 404 });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.xpEvent.create).not.toHaveBeenCalled();
  });
});

describe("practice helpers", () => {
  it("seededRng is deterministic per seed and stays in [0, 1)", () => {
    const a = seededRng("abc");
    const b = seededRng("abc");
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(seededRng("abd")()).not.toBe(seededRng("abc")());
  });

  it("optionOrder is a permutation for mcq and the identity otherwise; scrambledPairs copes with a single pair", () => {
    const [mcq, tf, short, matching] = quiz.questions as never[];
    expect([...optionOrder(mcq, "s")].sort()).toEqual([0, 1, 2, 3]);
    expect(optionOrder(tf, "s")).toEqual([0, 1]);
    expect(optionOrder(short, "s")).toEqual([]);
    expect(scrambledPairs({ ...(matching as object), pairs: [{ left: "a", right: "b" }] } as never, "s")).toEqual([{ left: "a", right: "b" }]);
    expect(correctAnswerText({ ...(short as object), acceptedAnswers: null } as never)).toBe("");
  });

  it("the submit route is limited to 20 a minute per student, and a student cookie keys the limiter instead of the shared IP", async () => {
    const meta = Reflect.getMetadata(RATE_LIMIT_KEY, PlayController.prototype.practiceSubmit);
    expect(meta).toEqual({ bucket: "practice", max: 20, windowMs: 60_000, by: "student" });

    process.env.STUDENT_COOKIE_SECRET = "test-secret-0123456789";
    const cookie = (id: string) => `${STUDENT_COOKIE}=${signStudentToken({ studentId: id, classId: "C1", exp: Math.floor(Date.now() / 1000) + 600 })}`;
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(meta) };
    const guard = new RateLimitGuard(reflector as never);
    const ctx = (cookieHeader: string | undefined) => ({ getHandler: jest.fn(), getClass: jest.fn(), switchToHttp: () => ({ getRequest: () => ({ headers: { cookie: cookieHeader }, ip: "10.0.0.1" }) }) }) as never;
    for (let i = 0; i < 20; i++) expect(await guard.canActivate(ctx(cookie("S1")))).toBe(true);
    await expect(guard.canActivate(ctx(cookie("S1")))).rejects.toMatchObject({ status: 429 }); // the 21st in the minute
    expect(await guard.canActivate(ctx(cookie("S2")))).toBe(true); // a classmate on the same IP is not affected
    expect(await guard.canActivate(ctx(undefined))).toBe(true); // no cookie: falls back to the IP key
  });
});
