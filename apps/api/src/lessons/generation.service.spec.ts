import type { ResourceKind } from "@helpo/shared";
import type { AiProvider, GenerateOptions, LessonContext } from "../ai/ai.provider";
import { AiRefusalError } from "../ai/errors";
import { DemoAiProvider } from "../ai/demo.provider";
import { InlineJobQueue, PollEventBus } from "../jobs/job-queue";
import { mockPrisma } from "../testing/mock-prisma";
import { friendlyError, GenerationService, lessonStatusFor, readOptions } from "./generation.service";
import { lessonContext } from "./lesson-context";

const ALL = ["SLIDES", "WORKSHEET", "QUIZ", "GAME", "CARDS"];

const lessonRow = (over: Record<string, unknown> = {}) => ({
  id: "L1",
  teacherId: "T1",
  classId: "C1",
  titleEn: "Photosynthesis: how plants make food",
  titleAr: null,
  objectivesEn: [],
  objectivesAr: [],
  contentLocale: "en",
  translationStatus: { en: "ready", ar: "missing" },
  requestedKinds: ALL,
  status: "DRAFT",
  sourceText: "",
  language: "English",
  durationMin: 45,
  standard: null,
  generationStartedAt: null,
  generationOptions: null,
  blueprint: null,
  prompt: null,
  classRoom: { name: "6B", grade: 6, band: "NAVIGATOR" },
  ...over,
});

function setup(ai: AiProvider = new DemoAiProvider()) {
  const db = mockPrisma();
  const queue = new InlineJobQueue();
  const events = new PollEventBus();
  const views = { findOwned: jest.fn(), detail: jest.fn().mockResolvedValue({ id: "L1" }), detailOf: jest.fn().mockResolvedValue({ id: "L1" }) };
  db.lesson.updateMany.mockResolvedValue({ count: 1 });
  db.resource.update.mockResolvedValue({ id: "R1" });
  const service = new GenerationService(db, views as never, queue, events, ai);
  return { db, views, queue, service };
}

/** Records every resource status write, in order. */
function trackResources(db: ReturnType<typeof mockPrisma>) {
  const log: { kind: ResourceKind; status?: string; data: Record<string, unknown> }[] = [];
  db.resource.update.mockImplementation(async ({ where, data }: { where: { lessonId_kind: { kind: ResourceKind } }; data: Record<string, unknown> }) => {
    log.push({ kind: where.lessonId_kind.kind, status: data.status as string | undefined, data });
    return { id: `R-${where.lessonId_kind.kind}` };
  });
  return log;
}

describe("GenerationService.start", () => {
  it("claims the lesson atomically, upserts WAITING rows, clears checks and the approval", async () => {
    const { db, views, queue, service } = setup();
    views.findOwned.mockResolvedValue(lessonRow());
    db.lesson.findUnique.mockResolvedValue(lessonRow());
    const schedule = jest.spyOn(queue, "schedule").mockReturnValue(true);
    await service.start("T1", "L1", "en", { quizCount: 12, difficulty: "hard" });
    const claim = db.lesson.updateMany.mock.calls[0][0];
    expect(claim.where).toMatchObject({ id: "L1" });
    expect(claim.data).toMatchObject({ status: "GENERATING", approvedAt: null, cancelRequested: false, generationOptions: { quizCount: 12, difficulty: "hard" } });
    expect(db.resource.upsert).toHaveBeenCalledTimes(5);
    expect(db.resource.upsert.mock.calls[0][0].create.status).toBe("WAITING");
    expect(db.aiCheck.deleteMany).toHaveBeenCalledWith({ where: { lessonId: "L1" } });
    expect(schedule).toHaveBeenCalledWith("L1:generate", expect.any(Function));
    expect(views.detail).toHaveBeenCalledWith("T1", "L1", "en");
  });

  it("a double click starts nothing twice: the second claim fails and no jobs are created", async () => {
    const { db, views, queue, service } = setup();
    views.findOwned.mockResolvedValue(lessonRow());
    db.lesson.findUnique.mockResolvedValue(lessonRow());
    db.lesson.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const schedule = jest.spyOn(queue, "schedule").mockReturnValue(true);
    expect(await service.startInternal("L1")).toBe(true);
    expect(await service.startInternal("L1")).toBe(false);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(db.resource.upsert).toHaveBeenCalledTimes(5);
  });

  it("two parallel jobs for the same lesson:kind run once (inline idempotency key)", async () => {
    const queue = new InlineJobQueue();
    let runs = 0;
    const work = async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 20));
    };
    const [a, b] = await Promise.all([queue.guard("L1:QUIZ", work), queue.guard("L1:QUIZ", work)]);
    expect([a.ran, b.ran].sort()).toEqual([false, true]);
    expect(runs).toBe(1);
    expect(queue.isRunning("L1:QUIZ")).toBe(false);
  });

  it("stored options are merged with the request and chosen kinds are generated", async () => {
    const { db, views, queue, service } = setup();
    views.findOwned.mockResolvedValue(lessonRow());
    db.lesson.findUnique.mockResolvedValue(lessonRow({ generationOptions: { quizCount: 8, resources: ["QUIZ"] } }));
    jest.spyOn(queue, "schedule").mockReturnValue(true);
    await service.start("T1", "L1", "en", { difficulty: "easy" });
    expect(db.lesson.updateMany.mock.calls[0][0].data.generationOptions).toEqual({ quizCount: 8, resources: ["QUIZ"], difficulty: "easy" });
    expect(db.resource.upsert).toHaveBeenCalledTimes(1);
    expect(readOptions(null)).toEqual({});
  });

  it("retry resets only the chosen kind; cancel sets the flag", async () => {
    const { db, views, queue, service } = setup();
    views.findOwned.mockResolvedValue(lessonRow());
    jest.spyOn(queue, "schedule").mockReturnValue(true);
    await service.retry("T1", "L1", "QUIZ", "en");
    expect(db.resource.upsert).toHaveBeenCalledTimes(1);
    expect(db.resource.upsert.mock.calls[0][0].where.lessonId_kind.kind).toBe("QUIZ");
    await service.cancel("T1", "L1", "en");
    expect(db.lesson.update.mock.calls.at(-1)[0].data).toEqual({ cancelRequested: true });
  });
});

describe("GenerationService.run", () => {
  it("every kind goes WORKING then READY with progress, tokens, prompt version and a stored version 1", async () => {
    const { db, service } = setup();
    db.lesson.findUnique.mockResolvedValue(lessonRow({ blueprint: undefined }));
    const log = trackResources(db);
    const demo = new DemoAiProvider();
    const dctx = lessonContext(lessonRow() as never, "en");
    const quiz = (await demo.generateResource("QUIZ", dctx)).content;
    const sheet = (await demo.generateResource("WORKSHEET", dctx)).content;
    db.resource.findMany.mockImplementation(async (a: { select: Record<string, boolean> }) =>
      a.select.kind ? [{ kind: "QUIZ", contentEn: quiz, contentAr: null }, { kind: "WORKSHEET", contentEn: sheet, contentAr: null }] : a.select.status ? [{ status: "READY" }] : [],
    );
    db.aiCheck.count.mockResolvedValue(3);
    await service.run("L1", ["SLIDES", "WORKSHEET", "QUIZ", "GAME", "CARDS"] as ResourceKind[], true);

    for (const kind of ALL as ResourceKind[]) {
      const seq = log.filter((l) => l.kind === kind && l.status).map((l) => l.status);
      expect(seq).toEqual(["WORKING", "READY"]);
    }
    const ready = log.find((l) => l.kind === "QUIZ" && l.status === "READY")!;
    expect(ready.data).toMatchObject({ progress: 100, version: 1, promptVersion: "quiz.v1", model: "demo", tokensIn: 0 });
    expect(ready.data).toHaveProperty("contentEn");
    expect(db.resourceVersion.upsert).toHaveBeenCalledTimes(5);
    const created = db.aiCheck.createMany.mock.calls[0][0].data;
    expect(created).toHaveLength(3);
    expect(created[0]).toMatchObject({ itemRef: "Q4", messageEn: expect.any(String) });
    const lessonUpdates = db.lesson.update.mock.calls.map((c: unknown[]) => (c[0] as { data: Record<string, unknown> }).data);
    expect(lessonUpdates.find((d: Record<string, unknown>) => d.totalStatements)).toMatchObject({ tracedStatements: expect.any(Number) });
    expect(lessonUpdates.at(-1)).toMatchObject({ status: "READY" });
  });

  it("runs the single analysis call first and stores the blueprint when there is none", async () => {
    const demo = new DemoAiProvider();
    const analyze = jest.spyOn(demo, "analyze");
    const { db, service } = setup(demo);
    db.lesson.findUnique.mockResolvedValue(lessonRow());
    trackResources(db);
    db.resource.findMany.mockResolvedValue([{ status: "READY" }]);
    await service.run("L1", ["QUIZ"], false);
    expect(analyze).toHaveBeenCalledTimes(1);
    const stored = db.lesson.update.mock.calls.map((c: unknown[]) => (c[0] as { data: Record<string, unknown> }).data).find((d: Record<string, unknown>) => d.blueprint);
    expect(stored?.objectivesEn).toHaveLength(4);
  });

  it("all five generators receive the SAME blueprint", async () => {
    const demo = new DemoAiProvider();
    const seen: unknown[] = [];
    const ai: AiProvider = Object.assign(Object.create(demo), {
      generateResource: jest.fn(async (kind: ResourceKind, ctx: LessonContext, o: GenerateOptions) => {
        seen.push(ctx.blueprint);
        return demo.generateResource(kind, ctx, o);
      }),
    });
    const { db, service } = setup(ai);
    db.lesson.findUnique.mockResolvedValue(lessonRow());
    trackResources(db);
    db.resource.findMany.mockResolvedValue([{ status: "READY" }]);
    await service.run("L1", ALL as ResourceKind[], true);
    expect(seen).toHaveLength(5);
    expect(new Set(seen.map((b) => JSON.stringify(b))).size).toBe(1);
    expect(seen[0]).toBeTruthy();
  });

  it("generation options reach the generators", async () => {
    const demo = new DemoAiProvider();
    const ai: AiProvider = Object.assign(Object.create(demo), { generateResource: jest.fn((k: ResourceKind, c: LessonContext, o: GenerateOptions) => demo.generateResource(k, c, o)) });
    const { db, service } = setup(ai);
    db.lesson.findUnique.mockResolvedValue(lessonRow({ generationOptions: { quizCount: 10, difficulty: "hard" } }));
    trackResources(db);
    db.resource.findMany.mockResolvedValue([{ status: "READY" }]);
    await service.run("L1", ["QUIZ"], false);
    expect((ai.generateResource as jest.Mock).mock.calls[0][2]).toMatchObject({ quizCount: 10, difficulty: "hard", attempt: 1 });
  });

  it("Arabic lessons write the Ar columns", async () => {
    const { db, service } = setup();
    db.lesson.findUnique.mockResolvedValue(lessonRow({ contentLocale: "ar", titleEn: null, titleAr: "التمثيل الضوئي: كيف تصنع النباتات غذاءها", translationStatus: { en: "missing", ar: "ready" } }));
    const log = trackResources(db);
    db.resource.findMany.mockResolvedValue([]);
    await service.run("L1", ["QUIZ"], true);
    const ready = log.find((l) => l.status === "READY")!;
    expect(ready.data).toHaveProperty("contentAr");
    expect(ready.data).not.toHaveProperty("contentEn");
  });

  it("a failing kind becomes FAILED with a friendly error, the others finish and the lesson is PARTIAL", async () => {
    const demo = new DemoAiProvider();
    const ai: AiProvider = Object.assign(Object.create(demo), {
      generateResource: jest.fn(async (kind: ResourceKind, ctx: LessonContext, o: GenerateOptions) => {
        if (kind === "GAME") throw new AiRefusalError({ category: "x" });
        return demo.generateResource(kind, ctx, o);
      }),
    });
    const { db, service } = setup(ai);
    db.lesson.findUnique.mockResolvedValue(lessonRow());
    const log = trackResources(db);
    db.resource.findMany.mockResolvedValue([{ status: "READY" }, { status: "FAILED" }]);
    await service.run("L1", ["GAME", "QUIZ", "WORKSHEET"], true);
    expect(log.filter((l) => l.kind === "GAME" && l.status).map((l) => l.status)).toEqual(["WORKING", "FAILED"]);
    expect(log.find((l) => l.kind === "GAME" && l.status === "FAILED")!.data.error).toMatch(/declined/);
    expect(log.filter((l) => l.kind === "QUIZ" && l.status).map((l) => l.status)).toEqual(["WORKING", "READY"]);
    expect(db.lesson.update.mock.calls.at(-1)[0].data.status).toBe("PARTIAL");
  });

  it("all resources failed makes the lesson FAILED and writes no checks", async () => {
    const demo = new DemoAiProvider();
    const ai: AiProvider = Object.assign(Object.create(demo), { generateResource: jest.fn().mockRejectedValue(new Error("down")) });
    const { db, service } = setup(ai);
    db.lesson.findUnique.mockResolvedValue(lessonRow({ blueprint: undefined }));
    trackResources(db);
    db.resource.findMany.mockResolvedValue([{ status: "FAILED" }, { status: "FAILED" }]);
    await service.run("L1", ["QUIZ", "GAME"], true);
    expect(db.lesson.update.mock.calls.at(-1)[0].data.status).toBe("FAILED");
    expect(db.aiCheck.createMany).not.toHaveBeenCalled();
    expect((ai.generateResource as jest.Mock).mock.calls.length).toBe(6); // 3 attempts per kind
  });

  it("a cancelled lesson fails its remaining resources without calling the AI", async () => {
    const demo = new DemoAiProvider();
    const gen = jest.spyOn(demo, "generateResource");
    const { db, service } = setup(demo);
    db.lesson.findUnique.mockImplementation(async (a: { select?: unknown }) => (a.select ? { cancelRequested: true } : lessonRow({ blueprint: undefined })));
    const log = trackResources(db);
    db.resource.findMany.mockResolvedValue([{ status: "FAILED" }]);
    await service.run("L1", ["QUIZ"], true);
    expect(gen).not.toHaveBeenCalled();
    expect(log[0].data).toMatchObject({ status: "FAILED", error: expect.stringMatching(/Cancelled/) });
  });

  it("a crash marks the lesson FAILED instead of throwing", async () => {
    const { db, service } = setup();
    db.lesson.findUnique.mockRejectedValue(new Error("db down"));
    db.lesson.update.mockResolvedValue({});
    await expect(service.run("L1", ["QUIZ"], true)).resolves.toBeUndefined();
    expect(db.lesson.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }));
  });

  it("a checks failure does not fail the lesson", async () => {
    const demo = new DemoAiProvider();
    const ai: AiProvider = Object.assign(Object.create(demo), { generateChecks: jest.fn().mockRejectedValue(new Error("nope")) });
    const { db, service } = setup(ai);
    db.lesson.findUnique.mockResolvedValue(lessonRow());
    trackResources(db);
    db.resource.findMany.mockResolvedValue([{ status: "READY" }]);
    await service.run("L1", ["QUIZ", "WORKSHEET"], true);
    expect(db.lesson.update.mock.calls.at(-1)[0].data.status).toBe("READY");
  });

  it("lessonStatusFor: READY, PARTIAL for 1 to 4 failures, FAILED for all", () => {
    expect(lessonStatusFor(0, 5)).toBe("READY");
    expect(lessonStatusFor(1, 5)).toBe("PARTIAL");
    expect(lessonStatusFor(4, 5)).toBe("PARTIAL");
    expect(lessonStatusFor(5, 5)).toBe("FAILED");
  });

  it("friendlyError hides internals", () => {
    expect(friendlyError(new AiRefusalError(null))).toMatch(/declined/);
    expect(friendlyError(new Error("secret stack"))).not.toContain("secret");
  });
});
