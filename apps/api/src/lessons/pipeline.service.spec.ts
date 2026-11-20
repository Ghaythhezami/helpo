import { DemoAiProvider } from "../ai/demo.provider";
import { AnalysisService, MAP_REDUCE_SHARE, mapLimit, normalizeBlueprint } from "./analysis.service";
import { DocumentsService, sha256Hex } from "../documents/documents.service";
import { InlineJobQueue } from "../jobs/job-queue";
import { mockPrisma } from "../testing/mock-prisma";
import { PipelineService, UploadLimiter, shortTitle } from "./pipeline.service";

const lessonFull = (over: Record<string, unknown> = {}) => ({
  id: "L1",
  teacherId: "T1",
  classId: "C1",
  status: "UPLOADED",
  contentLocale: "en",
  titleEn: "Notes",
  titleAr: null,
  unitTitleEn: null,
  unitTitleAr: null,
  descriptionEn: null,
  descriptionAr: null,
  objectivesEn: [],
  objectivesAr: [],
  translationStatus: { en: "ready", ar: "missing" },
  standard: null,
  language: "English",
  durationMin: 45,
  sourceText: "Plants make food from light. ".repeat(20),
  tokenCount: 200,
  prompt: null,
  blueprint: null,
  generationOptions: { autoGenerate: true },
  classRoom: { name: "6B", grade: 6, band: "NAVIGATOR" },
  ...over,
});

function setup() {
  const db = mockPrisma();
  const ai = new DemoAiProvider();
  const documents = new DocumentsService();
  const analysis = new AnalysisService(ai);
  const generation = { startInternal: jest.fn().mockResolvedValue(true) };
  const storage = { put: jest.fn().mockResolvedValue(null) };
  const queue = new InlineJobQueue();
  const service = new PipelineService(db, documents, analysis, generation as never, storage as never, queue, ai);
  db.classRoom.findFirst.mockResolvedValue({ id: "C1" });
  db.lesson.count.mockResolvedValue(0);
  db.lesson.create.mockResolvedValue({ id: "L1" });
  db.lesson.update.mockResolvedValue({});
  db.lesson.findUnique.mockResolvedValue(lessonFull());
  db.lesson.findUniqueOrThrow.mockResolvedValue(lessonFull());
  const schedule = jest.spyOn(queue, "schedule").mockReturnValue(true);
  return { db, ai, documents, generation, storage, queue, schedule, service };
}

const body = (over: Record<string, unknown> = {}) => ({ classId: "C1", durationMin: 45, reuse: true, autoGenerate: true, ...over }) as never;
const txt = (text: string, name = "notes.txt") => ({ buffer: Buffer.from(text), originalname: name });
const updates = (db: ReturnType<typeof mockPrisma>): Record<string, any>[] => db.lesson.update.mock.calls.map((c: unknown[]) => (c[0] as { data: Record<string, unknown> }).data);

describe("PipelineService.create", () => {
  it("needs a file or a prompt", async () => {
    const { service } = setup();
    await expect(service.create("T1", body())).rejects.toMatchObject({ status: 400 });
    await expect(service.create("T1", body({ prompt: "short" }))).rejects.toMatchObject({ status: 400 });
  });

  it("prompt-only lessons are AI-written, strip control characters and return the id at once", async () => {
    const { db, service, schedule } = setup();
    const out = await service.create("T1", body({ prompt: "Teach photosynthesis\u0007 to grade 6 students." }));
    expect(out).toEqual({ lessonId: "L1" });
    const data = db.lesson.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ aiWritten: true, prompt: "Teach photosynthesis to grade 6 students.", status: "UPLOADED", titleEn: "Photosynthesis to grade 6 students" });
    expect(schedule).toHaveBeenCalledWith("L1:pipeline", expect.any(Function));
  });

  it("a file upload is not AI-written, remembers the hash and type, and stores the original when storage is on", async () => {
    const { db, service, storage } = setup();
    db.lesson.findFirst.mockResolvedValue(null);
    const file = txt("Plants make food from light.");
    await service.create("T1", body(), file);
    expect(db.lesson.create.mock.calls[0][0].data).toMatchObject({ aiWritten: false, sourceType: "txt", sourceSha256: sha256Hex(file.buffer), titleEn: "notes", sourceFileName: "notes.txt" });
    expect(storage.put).toHaveBeenCalledWith("lessons/L1/source.txt", file.buffer);
  });

  it("scopes the class by teacher and enforces the monthly quota", async () => {
    const { db, service } = setup();
    db.classRoom.findFirst.mockResolvedValue(null);
    await expect(service.create("T2", body({ prompt: "Teach photosynthesis please." }))).rejects.toMatchObject({ status: 404 });
    expect(db.classRoom.findFirst).toHaveBeenCalledWith({ where: { id: "C1", teacherId: "T2" }, select: { id: true } });
    db.classRoom.findFirst.mockResolvedValue({ id: "C1" });
    db.lesson.count.mockResolvedValue(100);
    await expect(service.create("T1", body({ prompt: "Teach photosynthesis please." }))).rejects.toMatchObject({ status: 429, extensions: { type: "quota-exceeded", used: 100, limit: 100 } });
    expect(await service.quota("T1")).toEqual({ used: 100, limit: 100 });
    process.env.MONTHLY_LESSON_QUOTA = "5";
    expect((await service.quota("T1")).limit).toBe(5);
    delete process.env.MONTHLY_LESSON_QUOTA;
  });

  it("magic bytes are checked before anything is created", async () => {
    const { db, service } = setup();
    await expect(service.create("T1", body(), txt("plain text", "report.pdf"))).rejects.toMatchObject({ status: 400 });
    expect(db.lesson.create).not.toHaveBeenCalled();
  });

  it("cache by hash: the same file from the same teacher reuses clean text and blueprint (reuse=true)", async () => {
    const { db, service, schedule } = setup();
    db.lesson.findFirst.mockResolvedValue({ cleanText: "cached text", tokenCount: 9, sourcePages: 3, sourceLocale: "ar", blueprint: { title: "cached" } });
    const file = txt("whatever");
    await service.create("T1", body(), file);
    expect(db.lesson.findFirst.mock.calls[0][0].where).toEqual({ teacherId: "T1", sourceSha256: sha256Hex(file.buffer), cleanText: { not: null } });
    expect(db.lesson.create.mock.calls[0][0].data.contentLocale).toBe("ar"); // from the cached detection
    const job = schedule.mock.calls[0];
    expect(job[0]).toBe("L1:pipeline");
    db.lesson.findFirst.mockClear();
    await service.create("T1", body({ reuse: false }), txt("whatever"));
    expect(db.lesson.findFirst).not.toHaveBeenCalled();
  });

  it("limits uploads to 10 per hour per teacher", () => {
    const l = new UploadLimiter();
    for (let i = 0; i < 10; i++) l.check("T1", 1000 + i);
    expect(() => l.check("T1", 2000)).toThrow(expect.objectContaining({ status: 429 }) as never);
    expect(() => l.check("T2", 2000)).not.toThrow();
    expect(() => l.check("T1", 1000 + 3_600_001)).not.toThrow();
  });
});

describe("PipelineService.run (UPLOADED -> EXTRACTING -> ANALYZING -> ANALYZED -> generation)", () => {
  it("extracts, analyzes and chains generation when autoGenerate is on", async () => {
    const { db, service, generation } = setup();
    const file = txt("Plants make food from light and water in the leaves. ".repeat(10));
    await service.run({ lessonId: "L1", file, type: "txt", cached: null, explicitLocale: false });
    const statuses = updates(db).map((d) => d.status).filter(Boolean);
    expect(statuses).toEqual(["EXTRACTING", "ANALYZING", "ANALYZED"]);
    const saved = updates(db).find((d) => d.cleanText);
    expect(saved).toMatchObject({ sourceLocale: "en", sourceSha256: sha256Hex(file.buffer) });
    expect(updates(db).find((d) => d.blueprint)).toBeTruthy();
    expect(generation.startInternal).toHaveBeenCalledWith("L1");
  });

  it("does NOT generate when autoGenerate is false", async () => {
    const { db, service, generation } = setup();
    db.lesson.findUnique.mockResolvedValue(lessonFull({ generationOptions: { autoGenerate: false } }));
    await service.run({ lessonId: "L1", type: null, cached: null, explicitLocale: false });
    expect(generation.startInternal).not.toHaveBeenCalled();
    expect(updates(db).map((d) => d.status).filter(Boolean)).toContain("ANALYZED");
  });

  it("a prompt-only lesson skips extraction and analyzes the prompt", async () => {
    const { db, ai, service, generation } = setup();
    const analyze = jest.spyOn(ai, "analyze");
    db.lesson.findUnique.mockResolvedValue(lessonFull({ prompt: "Teach photosynthesis to grade 6.", sourceText: null, aiWritten: true }));
    await service.run({ lessonId: "L1", type: null, cached: null, explicitLocale: false });
    expect(updates(db).some((d) => d.status === "EXTRACTING")).toBe(false);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(generation.startInternal).toHaveBeenCalled();
  });

  it("a cache hit skips extraction AND the analysis call", async () => {
    const { db, ai, service, generation } = setup();
    const analyze = jest.spyOn(ai, "analyze");
    const extract = jest.spyOn(DocumentsService.prototype, "extract");
    const cached = { cleanText: "cached text", tokenCount: 9, sourcePages: 3, sourceLocale: "en", blueprint: { title: "cached" } };
    await service.run({ lessonId: "L1", file: txt("x"), type: "txt", cached, explicitLocale: false });
    expect(analyze).not.toHaveBeenCalled();
    expect(extract).not.toHaveBeenCalled();
    expect(updates(db).find((d) => d.sourceText === "cached text")).toBeTruthy();
    expect(updates(db).find((d) => d.status === "ANALYZED")).toBeTruthy();
    expect(generation.startInternal).toHaveBeenCalled();
    extract.mockRestore();
  });

  it("a cached extraction without a blueprint still analyzes", async () => {
    const { ai, service } = setup();
    const analyze = jest.spyOn(ai, "analyze");
    await service.run({ lessonId: "L1", file: txt("x"), type: "txt", cached: { cleanText: "c", tokenCount: 1, sourcePages: null, sourceLocale: "en", blueprint: null }, explicitLocale: false });
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it("an extraction failure marks the lesson FAILED with the reason and never throws", async () => {
    const { db, service, generation } = setup();
    await expect(service.run({ lessonId: "L1", file: txt("   \n "), type: "txt", cached: null, explicitLocale: false })).resolves.toBeUndefined();
    expect(updates(db).at(-1)).toMatchObject({ status: "FAILED", errorMessage: expect.stringMatching(/No readable text/) });
    expect(generation.startInternal).not.toHaveBeenCalled();
  });

  it("the document's language wins when the teacher did not choose one", async () => {
    const { db, service } = setup();
    db.lesson.findUnique.mockResolvedValue(lessonFull({ titleEn: "ملاحظات" }));
    await service.saveExtraction("L1", { type: "txt", text: "النباتات تصنع غذاءها", pages: null, detectedLocale: "ar", sha256: "h", tokenCount: 5 }, false);
    expect(updates(db)[0]).toMatchObject({ contentLocale: "ar", titleAr: "ملاحظات", titleEn: null, translationStatus: { en: "missing", ar: "ready" } });
    db.lesson.update.mockClear();
    await service.saveExtraction("L1", { type: "txt", text: "x", pages: null, detectedLocale: "ar", sha256: "h", tokenCount: 1 }, true);
    expect(updates(db)[0].contentLocale).toBeUndefined();
  });
});

describe("AnalysisService", () => {
  const ctx = { title: "t", grade: 6, band: "NAVIGATOR" as const, locale: "en" as const, language: "English", durationMin: 45, standard: null, objectives: [], sourceText: "" };

  it("one call for a normal document", async () => {
    const ai = new DemoAiProvider();
    const analyze = jest.spyOn(ai, "analyze");
    const chunk = jest.spyOn(ai, "analyzeChunk");
    const bp = await new AnalysisService(ai).build({ ...ctx, sourceText: "short" }, 100);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(chunk).not.toHaveBeenCalled();
    expect(bp.objectives.length).toBeGreaterThanOrEqual(3);
  });

  it("map-reduce above 60% of the budget: chunks in parallel (at most 3), then one reduce call", async () => {
    process.env.ANALYSIS_BUDGET_TOKENS = "1000";
    const ai = new DemoAiProvider();
    let live = 0;
    let peak = 0;
    jest.spyOn(ai, "analyzeChunk").mockImplementation(async (c, text) => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 10));
      live -= 1;
      return DemoAiProvider.prototype.analyze.call(ai, { ...c, sourceText: text });
    });
    const reduce = jest.spyOn(ai, "reduceBlueprints");
    const analyze = jest.spyOn(ai, "analyze");
    const text = ("Paragraph about plants and light. ".repeat(100) + "\n\n").repeat(30);
    await new AnalysisService(ai).build({ ...ctx, sourceText: text }, Math.ceil(1000 * MAP_REDUCE_SHARE) + 1);
    expect(analyze).not.toHaveBeenCalled();
    expect((ai.analyzeChunk as jest.Mock).mock.calls.length).toBeGreaterThan(3);
    expect(peak).toBeLessThanOrEqual(3);
    expect(reduce).toHaveBeenCalledTimes(1);
    delete process.env.ANALYSIS_BUDGET_TOKENS;
  });

  it("trims a blueprint to the spec limits and mapLimit keeps order", async () => {
    const bp = await new DemoAiProvider().analyze(ctx);
    const big = { ...bp, keyConcepts: Array(20).fill(bp.keyConcepts[0]), vocabulary: Array(20).fill(bp.vocabulary[0]), commonMisconceptions: Array(9).fill("x"), objectives: Array(9).fill(bp.objectives[0]) };
    const n = normalizeBlueprint(big);
    expect([n.keyConcepts.length, n.vocabulary.length, n.commonMisconceptions.length, n.objectives.length]).toEqual([15, 15, 5, 6]);
    expect(await mapLimit([3, 1, 2], 2, async (x) => x * 2)).toEqual([6, 2, 4]);
  });
});

describe("lesson titles", () => {
  it("a short cleaned title before analysis: no lead-in, first clause, at most 60 characters", () => {
    expect(shortTitle("Lesson on: Photosynthesis for grade 6, 45 minutes, focus on vocabulary")).toBe("Photosynthesis for grade 6");
    expect(shortTitle("Teach me a lesson about the water cycle. Include a quiz.")).toBe("The water cycle");
    expect(shortTitle("please teach fractions to kids")).toBe("Fractions to kids");
    expect(shortTitle("x".repeat(30) + " " + "y".repeat(50)).length).toBeLessThanOrEqual(60);
    expect(shortTitle("Lesson on: ")).toBe("New lesson");
  });

  it("a prompt without a title starts with the short title and marks it for replacement", async () => {
    const { db, service } = setup();
    await service.create("T1", body({ prompt: "Lesson on: Photosynthesis for grade 6, 45 minutes, focus on vocabulary" }));
    const data = db.lesson.create.mock.calls[0][0].data;
    expect(data.titleEn).toBe("Photosynthesis for grade 6");
    expect(data.generationOptions).toMatchObject({ autoTitle: true });
  });

  it("analysis replaces an automatic title with the blueprint's title, once", async () => {
    const { db, service } = setup();
    db.lesson.findUnique.mockResolvedValue(lessonFull({ generationOptions: { autoTitle: true } }));
    await service.analyze("L1");
    const data = updates(db).find((d) => d.blueprint)!;
    expect(data.titleEn).toBeTruthy();
    expect(data.generationOptions).toMatchObject({ autoTitle: false });
  });

  it("a title the teacher typed is never replaced", async () => {
    const { db, service } = setup();
    db.lesson.findUnique.mockResolvedValue(lessonFull({ generationOptions: { autoTitle: false } }));
    await service.analyze("L1");
    expect(updates(db).find((d) => d.blueprint)!.titleEn).toBeUndefined();
    await service.create("T1", body({ prompt: "Teach photosynthesis to grade 6 students.", title: "My title" }));
    const created = db.lesson.create.mock.calls.at(-1)[0].data;
    expect(created.titleEn).toBe("My title");
    expect(created.generationOptions.autoTitle).toBe(false);
  });
});
