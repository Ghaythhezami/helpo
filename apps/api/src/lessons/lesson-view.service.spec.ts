import { DemoAiProvider } from "../ai/demo.provider";
import { mockPrisma } from "../testing/mock-prisma";
import { LessonViewService, parseBlueprint } from "./lesson-view.service";

const ctx = { title: "Photosynthesis: how plants make food", grade: 6, band: "NAVIGATOR" as const, locale: "en" as const, language: "English", durationMin: 45, standard: null, objectives: [], sourceText: "" };

const row = (over: Record<string, unknown> = {}) => ({
  id: "L1",
  teacherId: "T1",
  classId: "C1",
  titleEn: "Photosynthesis",
  titleAr: "التمثيل الضوئي",
  unitTitleEn: "Plants and energy",
  unitTitleAr: null,
  lessonNumber: 4,
  status: "READY",
  createdAt: new Date("2026-11-19T09:00:00Z"),
  durationMin: 45,
  language: "English",
  standard: "NGSS MS-LS1-6",
  objectivesEn: [{ code: "O1", text: "Name the inputs.", bloom: "remember", sourcePage: 2 }],
  objectivesAr: [],
  sourceFileName: "plants.pdf",
  sourceText: "x".repeat(1234),
  sourceType: "pdf",
  sourcePages: 12,
  sourceSha256: "a".repeat(64),
  sourceLocale: "en",
  blueprint: null,
  prompt: null,
  aiWritten: false,
  tokenCount: 321,
  approvedAt: new Date("2026-11-19T10:00:00Z"),
  tracedStatements: 13,
  totalStatements: 16,
  generationStartedAt: new Date("2026-11-19T09:10:00Z"),
  generationFinishedAt: new Date("2026-11-19T09:10:47Z"),
  contentLocale: "en",
  translationStatus: { en: "ready", ar: "working" },
  classRoom: { name: "6B", grade: 6, band: "NAVIGATOR" },
  ...over,
});

function setup() {
  const db = mockPrisma();
  db.aiCheck.groupBy.mockResolvedValue([]);
  db.aiCheck.findMany.mockResolvedValue([]);
  db.resource.findMany.mockResolvedValue([]);
  db.activitySession.findMany.mockResolvedValue([]);
  db.lesson.count.mockResolvedValue(3);
  return { db, service: new LessonViewService(db) };
}

const resRow = (kind: string, over: Record<string, unknown> = {}) => ({ id: `R-${kind}`, lessonId: "L1", kind, status: "READY", contentEn: { x: 1 }, contentAr: null, error: null, progress: 100, version: 1, promptVersion: `${kind.toLowerCase()}.v1`, model: "demo", tokensIn: 5, tokensOut: 9, updatedAt: new Date("2026-11-19T09:10:47Z"), ...over });

describe("LessonViewService.findOwned", () => {
  it("scopes by teacher and returns 404 for someone else's lesson", async () => {
    const { db, service } = setup();
    db.lesson.findFirst.mockResolvedValue(row());
    expect((await service.findOwned("T1", "L1")).id).toBe("L1");
    expect(db.lesson.findFirst.mock.calls[0][0].where).toEqual({ id: "L1", teacherId: "T1" });
    db.lesson.findFirst.mockResolvedValue(null);
    await expect(service.findOwned("T2", "L1")).rejects.toMatchObject({ status: 404 });
  });
});

describe("LessonViewService.detail", () => {
  it("builds the full view: localized texts, source metadata, trace, timing, quota, approval", async () => {
    const { db, service } = setup();
    db.lesson.findFirst.mockResolvedValue(row());
    db.aiCheck.findMany.mockResolvedValue([{ id: "K1", resource: "QUIZ", itemRef: "Q4", kind: "FACT_CHECK", messageEn: "Check p.6", messageAr: null, suggestionEn: null, suggestionAr: null, sourcePage: 6, status: "OPEN" }]);
    db.aiCheck.groupBy.mockResolvedValue([{ lessonId: "L1", _count: { _all: 1 } }]);
    const d = await service.detail("T1", "L1", "ar");
    expect(d).toMatchObject({
      id: "L1",
      title: "التمثيل الضوئي",
      unitTitle: "Plants and energy", // Arabic missing: falls back to English
      className: "6B",
      grade: 6,
      band: "NAVIGATOR",
      status: "READY",
      openChecks: 1,
      durationMin: 45,
      standard: "NGSS MS-LS1-6",
      sourceFileName: "plants.pdf",
      sourceChars: 1234,
      tokenCount: 321,
      aiWritten: false,
      detectedLanguage: "en",
      approvedAt: "2026-11-19T10:00:00.000Z",
      contentLocale: "en",
      translations: { en: "ready", ar: "working" },
      trace: { traced: 13, total: 16 },
      generation: { startedAt: "2026-11-19T09:10:00.000Z", finishedAt: "2026-11-19T09:10:47.000Z", seconds: 47 },
      quota: { used: 3, limit: 100 },
      source: { fileName: "plants.pdf", type: "pdf", pages: 12, chars: 1234, detectedLocale: "en", sha256: "a".repeat(64) },
    });
    expect(d.objectives).toHaveLength(1); // Arabic empty: falls back
    expect(d.checks[0]).toMatchObject({ kind: "FACT_CHECK", message: "Check p.6", status: "OPEN" });
    expect(d.blueprint).toBeNull();
  });

  it("resources come in kit order and carry version, progress, model and tokens", async () => {
    const { db, service } = setup();
    db.lesson.findFirst.mockResolvedValue(row());
    db.resource.findMany.mockResolvedValue([resRow("CARDS"), resRow("QUIZ", { version: 3 }), resRow("SLIDES"), resRow("GAME", { status: "FAILED", contentEn: null, error: "Try again." }), resRow("WORKSHEET")]);
    const d = await service.detail("T1", "L1", "en");
    expect(d.resources.map((r) => r.kind)).toEqual(["SLIDES", "WORKSHEET", "QUIZ", "GAME", "CARDS"]);
    expect(d.resources[2]).toMatchObject({ version: 3, progress: 100, promptVersion: "quiz.v1", model: "demo", tokensIn: 5, tokensOut: 9 });
    expect(d.resources[3]).toMatchObject({ status: "FAILED", error: "Try again.", content: null });
    expect(d.resources[0].translations).toEqual({ en: "ready", ar: "working" }); // Arabic is being translated
  });

  it("a lesson without a source, trace or timing reports nulls; the blueprint is parsed when valid", async () => {
    const { db, service } = setup();
    const bp = await new DemoAiProvider().analyze(ctx);
    db.lesson.findFirst.mockResolvedValue(row({ sourceFileName: null, sourceText: null, sourceLocale: "zz", tracedStatements: null, totalStatements: null, generationStartedAt: null, generationFinishedAt: null, approvedAt: null, blueprint: bp }));
    const d = await service.detail("T1", "L1", "en");
    expect(d).toMatchObject({ source: null, sourceChars: 0, trace: null, approvedAt: null, generation: { startedAt: null, finishedAt: null, seconds: null } });
    expect(d.blueprint?.title).toBe(bp.title);
    expect(parseBlueprint({ nope: true })).toBeNull();
  });
});

describe("LessonViewService summaries and averages", () => {
  it("summaries carry open checks and the latest finished quiz average per lesson", async () => {
    const { db, service } = setup();
    db.aiCheck.groupBy.mockResolvedValue([{ lessonId: "L1", _count: { _all: 3 } }]);
    const quiz = { questions: Array.from({ length: 4 }, (_, i) => ({ id: `Q${i + 1}` })) };
    db.resource.findMany.mockResolvedValue([{ lessonId: "L1", contentEn: quiz, contentAr: null }]);
    db.activitySession.findMany.mockResolvedValue([
      // newest first: only SE2 counts for L1
      { id: "SE2", lessonId: "L1" },
      { id: "SE1", lessonId: "L1" },
    ]);
    // ONE grouped count of the latest session's answers: P1 has 2 correct, P2 has 1 correct
    db.answer.groupBy.mockResolvedValue([
      { sessionId: "SE2", participantId: "P1", correct: true, partial: false, _count: { _all: 2 } },
      { sessionId: "SE2", participantId: "P2", correct: true, partial: false, _count: { _all: 1 } },
      { sessionId: "SE2", participantId: "P2", correct: false, partial: false, _count: { _all: 1 } },
    ]);
    const out = await service.summaries([row() as never, row({ id: "L2", titleEn: "Seeds", titleAr: null }) as never], "en");
    expect(out[0]).toMatchObject({ id: "L1", title: "Photosynthesis", openChecks: 3, lessonNumber: 4, createdAt: "2026-11-19T09:00:00.000Z" });
    expect(out[0].averageScore).toBeCloseTo((2 / 4 + 1 / 4) / 2); // P1 scored 2/4, P2 1/4
    expect(out[1]).toMatchObject({ id: "L2", openChecks: 0, averageScore: null });
    expect(db.activitySession.findMany.mock.calls[0][0].where).toMatchObject({ lessonId: { in: ["L1", "L2"] }, type: "LIVE_QUIZ", status: "ENDED" });
    // bounded reads: sessions carry no answers, and only the latest session's answers are counted (grouped, not loaded)
    expect(db.activitySession.findMany.mock.calls[0][0].select).toEqual({ id: true, lessonId: true });
    expect(db.answer.groupBy.mock.calls[0][0].where).toEqual({ sessionId: { in: ["SE2"] } });
    expect(db.answer.findMany).not.toHaveBeenCalled();
    expect(db.resource.findMany.mock.calls[0][0].where.lessonId).toEqual({ in: ["L1"] }); // only lessons that have a finished quiz
  });

  it("no lessons means no queries; a lesson without answers has no average", async () => {
    const { db, service } = setup();
    expect(await service.summaries([], "en")).toEqual([]);
    expect(db.aiCheck.groupBy).not.toHaveBeenCalled();
    db.resource.findMany.mockResolvedValue([{ lessonId: "L1", contentEn: { questions: [{}] }, contentAr: null }]);
    db.activitySession.findMany.mockResolvedValue([{ id: "SE1", lessonId: "L1" }]);
    db.answer.groupBy.mockResolvedValue([]);
    expect((await service.summary(row() as never, "en")).averageScore).toBeNull();
  });

  it("quota counts this month's lessons against MONTHLY_LESSON_QUOTA", async () => {
    const { db, service } = setup();
    process.env.MONTHLY_LESSON_QUOTA = "25";
    expect(await service.quota("T1")).toEqual({ used: 3, limit: 25 });
    expect(db.lesson.count.mock.calls[0][0].where.teacherId).toBe("T1");
    expect(db.lesson.count.mock.calls[0][0].where.createdAt.gte).toBeInstanceOf(Date);
    delete process.env.MONTHLY_LESSON_QUOTA;
    expect((await service.quota("T1")).limit).toBe(100);
  });
});

describe("LessonViewService.status (the light poll target)", () => {
  it("is ONE teacher-scoped query with no resource content, in generation order, with the latest updatedAt", async () => {
    const { db, service } = setup();
    db.lesson.findFirst.mockResolvedValue({
      status: "GENERATING",
      updatedAt: new Date("2026-11-27T10:00:00Z"),
      contentLocale: "en",
      translationStatus: { en: "ready", ar: "missing" },
      resources: [
        { kind: "GAME", status: "WAITING", progress: 0, error: null, updatedAt: new Date("2026-11-27T10:00:00Z") },
        { kind: "QUIZ", status: "WORKING", progress: 35, error: null, updatedAt: new Date("2026-11-27T10:00:09Z") },
        { kind: "SLIDES", status: "READY", progress: 100, error: null, updatedAt: new Date("2026-11-27T10:00:05Z") },
        { kind: "WORKSHEET", status: "FAILED", progress: 0, error: "Try again.", updatedAt: new Date("2026-11-27T10:00:07Z") },
      ],
    });
    const out = await service.status("T1", "L1");
    expect(out).toEqual({
      status: "GENERATING",
      resources: [
        { kind: "SLIDES", status: "READY", progress: 100, error: null },
        { kind: "WORKSHEET", status: "FAILED", progress: 0, error: "Try again." },
        { kind: "QUIZ", status: "WORKING", progress: 35, error: null },
        { kind: "GAME", status: "WAITING", progress: 0, error: null },
      ],
      translations: { en: "ready", ar: "missing" },
      updatedAt: "2026-11-27T10:00:09.000Z",
    });
    expect(db.lesson.findFirst).toHaveBeenCalledTimes(1);
    expect(db.lesson.findFirst.mock.calls[0][0].where).toEqual({ id: "L1", teacherId: "T1" });
    const select = db.lesson.findFirst.mock.calls[0][0].select;
    expect(select.resources.select).not.toHaveProperty("contentEn");
    expect(select.resources.select).not.toHaveProperty("contentAr");
    expect(db.resource.findMany).not.toHaveBeenCalled();
    expect(db.aiCheck.findMany).not.toHaveBeenCalled();
  });

  it("someone else's lesson is a 404; a lesson with no resources uses its own updatedAt", async () => {
    const { db, service } = setup();
    db.lesson.findFirst.mockResolvedValue(null);
    await expect(service.status("T2", "L1")).rejects.toMatchObject({ status: 404 });
    db.lesson.findFirst.mockResolvedValue({ status: "ANALYZING", updatedAt: new Date("2026-11-27T09:00:00Z"), contentLocale: "ar", translationStatus: { en: "missing", ar: "ready" }, resources: [] });
    expect(await service.status("T1", "L1")).toMatchObject({ status: "ANALYZING", resources: [], updatedAt: "2026-11-27T09:00:00.000Z", translations: { en: "missing", ar: "ready" } });
  });

  it("the full detail carries the lesson's curriculum, GENERAL when unknown", async () => {
    const { db, service } = setup();
    db.lesson.findFirst.mockResolvedValue(row({ curriculum: "BRITISH" }));
    expect((await service.detail("T1", "L1", "en")).curriculum).toBe("BRITISH");
    db.lesson.findFirst.mockResolvedValue(row({ curriculum: "martian" }));
    expect((await service.detail("T1", "L1", "en")).curriculum).toBe("GENERAL");
    db.lesson.findFirst.mockResolvedValue(row());
    expect((await service.detail("T1", "L1", "en")).curriculum).toBe("GENERAL");
  });
});
