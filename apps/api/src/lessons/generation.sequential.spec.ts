import type { ResourceKind } from "@helpo/shared";
import type { AiProvider, GenerateOptions, LessonContext } from "../ai/ai.provider";
import { DemoAiProvider } from "../ai/demo.provider";
import { InlineJobQueue, PollEventBus } from "../jobs/job-queue";
import { mockPrisma } from "../testing/mock-prisma";
import { GenerationService } from "./generation.service";

const ALL = ["SLIDES", "WORKSHEET", "QUIZ", "GAME", "CARDS"] as ResourceKind[];

const lessonRow = (over: Record<string, unknown> = {}) => ({
  id: "L1",
  teacherId: "T1",
  classId: "C1",
  titleEn: "Cyber security measures",
  titleAr: null,
  objectivesEn: [],
  objectivesAr: [],
  contentLocale: "en",
  translationStatus: { en: "ready", ar: "missing" },
  requestedKinds: ALL,
  status: "GENERATING",
  sourceText: "",
  language: "English",
  durationMin: 45,
  standard: null,
  curriculum: "GENERAL",
  generationStartedAt: null,
  generationOptions: null,
  blueprint: null,
  prompt: "Grade 11 Science, 45-minute lesson on cyber security measures.",
  classRoom: { name: "11A", grade: 11, band: "STUDIO" },
  ...over,
});

/** A demo provider that counts every Claude-shaped request, in order. */
function countingAi(failKinds: ResourceKind[] = []) {
  const demo = new DemoAiProvider();
  const calls: string[] = [];
  const ai: AiProvider = Object.assign(Object.create(demo), {
    analyze: jest.fn(async (ctx: LessonContext) => {
      calls.push("analysis");
      return demo.analyze(ctx);
    }),
    generateResource: jest.fn(async (kind: ResourceKind, ctx: LessonContext, o: GenerateOptions) => {
      calls.push(kind);
      if (failKinds.includes(kind)) throw new Error("model overloaded");
      return demo.generateResource(kind, ctx, o);
    }),
    generateChecks: jest.fn(async (ctx: LessonContext, r: Parameters<AiProvider["generateChecks"]>[1]) => {
      calls.push("checks");
      return demo.generateChecks(ctx, r);
    }),
  });
  return { ai, calls };
}

function setup(ai: AiProvider) {
  const db = mockPrisma();
  const queue = new InlineJobQueue();
  const emitted: [string, string, Record<string, unknown>][] = [];
  const events = Object.assign(new PollEventBus(), { emit: (room: string, event: string, payload: Record<string, unknown>) => void emitted.push([room, event, payload]) });
  const views = { findOwned: jest.fn(), detail: jest.fn(), detailOf: jest.fn() };
  const service = new GenerationService(db, views as never, queue, events as never, ai);
  db.lesson.update.mockResolvedValue({});
  db.lesson.updateMany.mockResolvedValue({ count: 1 });
  db.lesson.findUnique.mockResolvedValue(lessonRow());
  const log: { kind: ResourceKind; status?: string }[] = [];
  db.resource.update.mockImplementation(async ({ where, data }: { where: { lessonId_kind: { kind: ResourceKind } }; data: { status?: string } }) => {
    log.push({ kind: where.lessonId_kind.kind, status: data.status });
    return { id: `R-${where.lessonId_kind.kind}` };
  });
  return { db, service, emitted, log };
}

const statusLog = (log: { kind: ResourceKind; status?: string }[]) => log.filter((l) => l.status).map((l) => `${l.kind}:${l.status}`);

describe("sequential generation (GENERATION_MODE=sequential, the default)", () => {
  const keep = process.env.GENERATION_MODE;
  afterEach(() => {
    if (keep === undefined) delete process.env.GENERATION_MODE;
    else process.env.GENERATION_MODE = keep;
  });

  it("makes SLIDES, WORKSHEET, QUIZ, CARDS, GAME one after another, each WORKING then READY, whatever order was asked", async () => {
    delete process.env.GENERATION_MODE;
    const { ai } = countingAi();
    const { db, service, log } = setup(ai);
    db.resource.findMany.mockResolvedValue([{ status: "READY" }]);
    await service.run("L1", ["GAME", "CARDS", "QUIZ", "WORKSHEET", "SLIDES"], true);
    expect(statusLog(log)).toEqual([
      "SLIDES:WORKING", "SLIDES:READY",
      "WORKSHEET:WORKING", "WORKSHEET:READY",
      "QUIZ:WORKING", "QUIZ:READY",
      "CARDS:WORKING", "CARDS:READY",
      "GAME:WORKING", "GAME:READY",
    ]);
  });

  it("one kit is 1 analysis + 5 generators + 1 review: seven Claude requests, not one per slide", async () => {
    delete process.env.GENERATION_MODE;
    const { ai, calls } = countingAi();
    const { db, service } = setup(ai);
    const demo = new DemoAiProvider();
    const quiz = (await demo.generateResource("QUIZ", { title: "Cyber", grade: 11, band: "STUDIO", locale: "en", language: "English", durationMin: 45, standard: null, objectives: [], sourceText: "" })).content;
    db.resource.findMany.mockImplementation(async (a: { select: Record<string, boolean> }) => (a.select.kind ? [{ kind: "QUIZ", contentEn: quiz, contentAr: null }] : [{ status: "READY" }]));
    await service.run("L1", ALL, true);
    expect(calls).toEqual(["analysis", "SLIDES", "WORKSHEET", "QUIZ", "CARDS", "GAME", "checks"]);
    expect(calls).toHaveLength(7);
  });

  it("a failed step does not block the next one; the lesson ends PARTIAL and the failure is recorded on its row", async () => {
    const { ai, calls } = countingAi(["WORKSHEET"]);
    const { db, service, emitted, log } = setup(ai);
    db.resource.findMany.mockResolvedValue([{ status: "FAILED" }, { status: "READY" }, { status: "READY" }, { status: "READY" }, { status: "READY" }]);
    await service.run("L1", ALL, true);
    expect(statusLog(log)).toContain("WORKSHEET:FAILED");
    expect(statusLog(log)).toEqual(expect.arrayContaining(["QUIZ:READY", "CARDS:READY", "GAME:READY"]));
    expect(calls.filter((c) => c === "WORKSHEET")).toHaveLength(3); // the repair loop tried three times, then moved on
    expect(db.lesson.update.mock.calls.at(-1)[0].data).toMatchObject({ status: "PARTIAL" });
    const failed = emitted.find(([, e]) => e === "resource.failed");
    expect(failed?.[2]).toMatchObject({ kind: "WORKSHEET" });
  });

  it("emits resource.progress, resource.ready and lesson.status to the lesson room as each step runs", async () => {
    const { ai } = countingAi();
    const { db, service, emitted } = setup(ai);
    db.resource.findMany.mockResolvedValue([{ status: "READY" }]);
    await service.run("L1", ["SLIDES", "QUIZ"], true);
    const events = emitted.map(([room, event, p]) => `${room} ${event} ${p.kind ?? p.status ?? ""}`);
    expect(events).toEqual(expect.arrayContaining(["lesson:L1 resource.progress SLIDES", "lesson:L1 resource.ready SLIDES", "lesson:L1 resource.ready QUIZ", "lesson:L1 lesson.status READY"]));
    const order = emitted.filter(([, e]) => e === "resource.ready").map(([, , p]) => p.kind);
    expect(order).toEqual(["SLIDES", "QUIZ"]);
    expect(emitted.find(([, e]) => e === "resource.progress")?.[2]).toMatchObject({ status: "WORKING", percent: 5 });
  });

  it("the teacher cancelling mid-run stops every step that has not started (each is marked, none calls the model)", async () => {
    const { ai, calls } = countingAi();
    const { db, service, log } = setup(ai);
    db.lesson.findUnique.mockResolvedValue(lessonRow({ cancelRequested: true, blueprint: undefined }));
    db.resource.findMany.mockResolvedValue([{ status: "FAILED" }]);
    await service.run("L1", ALL, true);
    expect(calls.filter((c) => ALL.includes(c as ResourceKind))).toEqual([]);
    expect(statusLog(log).every((s) => s.endsWith(":FAILED"))).toBe(true);
  });
});

describe("parallel generation (GENERATION_MODE=parallel)", () => {
  const keep = process.env.GENERATION_MODE;
  afterEach(() => {
    if (keep === undefined) delete process.env.GENERATION_MODE;
    else process.env.GENERATION_MODE = keep;
  });

  it("starts every kind at once", async () => {
    process.env.GENERATION_MODE = "parallel";
    const { ai } = countingAi();
    const { db, service, log } = setup(ai);
    db.resource.findMany.mockResolvedValue([{ status: "READY" }]);
    await service.run("L1", ALL, true);
    const firstFive = statusLog(log).slice(0, 5);
    expect(firstFive.every((s) => s.endsWith(":WORKING"))).toBe(true); // all five were WORKING before the first one finished
  });
});
