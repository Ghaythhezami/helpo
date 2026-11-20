import { DemoAiProvider } from "../ai/demo.provider";
import type { AiProvider } from "../ai/ai.provider";
import { mockPrisma } from "../testing/mock-prisma";
import { TranslationService } from "./translation.service";

const lesson = (status: unknown = { en: "ready", ar: "missing" }, over: Record<string, unknown> = {}) => ({
  id: "L1",
  status: "READY",
  contentLocale: "en",
  translationStatus: status,
  titleEn: "Photosynthesis: how plants make food",
  titleAr: null,
  unitTitleEn: "Plants and energy",
  unitTitleAr: null,
  descriptionEn: null,
  descriptionAr: null,
  objectivesEn: [],
  objectivesAr: [],
  sourceText: "",
  language: "English",
  durationMin: 45,
  standard: null,
  classRoom: { name: "6B", grade: 6, band: "NAVIGATOR" },
  ...over,
});

async function quizAndSheet() {
  const demo = new DemoAiProvider();
  const ctx = { title: "Photosynthesis: how plants make food", grade: 6, band: "NAVIGATOR" as const, locale: "en" as const, language: "English", durationMin: 45, standard: null, objectives: [], sourceText: "" };
  return { quiz: (await demo.generateResource("QUIZ", ctx)).content, sheet: (await demo.generateResource("WORKSHEET", ctx)).content };
}

describe("TranslationService", () => {
  function setup(ai: AiProvider = new DemoAiProvider()) {
    const db = mockPrisma();
    const views = { findOwned: jest.fn(), detail: jest.fn().mockResolvedValue({}), detailOf: jest.fn().mockResolvedValue({}) };
    return { db, views, service: new TranslationService(db, views as never, ai) };
  }

  it("start: missing -> working, returns the detail and refuses while generating", async () => {
    const { db, views, service } = setup();
    views.findOwned.mockResolvedValue(lesson());
    db.lesson.findUnique.mockResolvedValue(null); // background job exits immediately
    await service.start("T1", "L1", "ar", "en");
    expect(db.lesson.update).toHaveBeenCalledWith({ where: { id: "L1" }, data: { translationStatus: { en: "ready", ar: "working" } } });
    expect(views.detail).toHaveBeenCalled();

    views.findOwned.mockResolvedValue(lesson(undefined, { status: "GENERATING" }));
    await expect(service.start("T1", "L1", "ar", "en")).rejects.toMatchObject({ status: 409 });
  });

  it("start: an already-working translation is not started twice", async () => {
    const { db, views, service } = setup();
    views.findOwned.mockResolvedValue(lesson({ en: "ready", ar: "working" }));
    await service.start("T1", "L1", "ar", "en");
    expect(db.lesson.update).not.toHaveBeenCalled();
    expect(views.detailOf).toHaveBeenCalled();
  });

  it("run: translates title, objectives, resources and checks, then working -> ready", async () => {
    const { db, service } = setup();
    const { quiz, sheet } = await quizAndSheet();
    db.lesson.findUnique.mockImplementation(async (a: { select?: unknown }) => (a.select ? { translationStatus: { en: "ready", ar: "working" }, contentLocale: "en" } : lesson({ en: "ready", ar: "working" })));
    db.resource.findMany.mockResolvedValue([
      { id: "r1", kind: "QUIZ", contentEn: quiz, contentAr: null },
      { id: "r2", kind: "WORKSHEET", contentEn: sheet, contentAr: null },
    ]);
    db.aiCheck.findMany.mockResolvedValue([{ id: "c1", itemRef: "Q9", messageEn: "m", suggestionEn: "s" }]);
    await service.run("L1", "ar");

    const lessonWrites = db.lesson.update.mock.calls.map((c: unknown[]) => (c[0] as { data: Record<string, unknown> }).data);
    expect(lessonWrites[0]).toMatchObject({ titleAr: expect.stringMatching(/[؀-ۿ]/), unitTitleAr: "النباتات والطاقة" });
    expect(lessonWrites[0].objectivesAr).toHaveLength(4);
    const resourceWrites = db.resource.update.mock.calls.map((c: unknown[]) => c[0] as { data: Record<string, unknown> });
    expect(resourceWrites).toHaveLength(2);
    expect(resourceWrites.every((w: { data: Record<string, unknown> }) => "contentAr" in w.data)).toBe(true);
    expect(db.aiCheck.update.mock.calls[0][0].data.messageAr).toMatch(/[؀-ۿ]/);
    expect(lessonWrites.at(-1)).toEqual({ translationStatus: { en: "ready", ar: "ready" } });
  });

  it("run: any failure leaves the language missing so it can be retried", async () => {
    const demo = new DemoAiProvider();
    const ai: AiProvider = Object.assign(Object.create(demo), { translateContent: jest.fn().mockRejectedValue(new Error("rate limited")) });
    const { db, service } = setup(ai);
    const { quiz } = await quizAndSheet();
    db.lesson.findUnique.mockImplementation(async (a: { select?: unknown }) => (a.select ? { translationStatus: { en: "ready", ar: "working" }, contentLocale: "en" } : lesson({ en: "ready", ar: "working" })));
    db.resource.findMany.mockResolvedValue([{ id: "r1", kind: "QUIZ", contentEn: quiz, contentAr: null }]);
    db.aiCheck.findMany.mockResolvedValue([]);
    await service.run("L1", "ar");
    expect(db.lesson.update.mock.calls.at(-1)[0].data).toEqual({ translationStatus: { en: "ready", ar: "missing" } });
  });

  it("run: output that does not match the schema is rejected", async () => {
    const demo = new DemoAiProvider();
    const ai: AiProvider = Object.assign(Object.create(demo), { translateContent: jest.fn().mockResolvedValue({ nope: true }) });
    const { db, service } = setup(ai);
    const { quiz } = await quizAndSheet();
    db.lesson.findUnique.mockImplementation(async (a: { select?: unknown }) => (a.select ? { translationStatus: { en: "ready", ar: "working" }, contentLocale: "en" } : lesson()));
    db.resource.findMany.mockResolvedValue([{ id: "r1", kind: "QUIZ", contentEn: quiz, contentAr: null }]);
    db.aiCheck.findMany.mockResolvedValue([]);
    await service.run("L1", "ar");
    expect(db.resource.update).not.toHaveBeenCalled();
    expect(db.lesson.update.mock.calls.at(-1)[0].data.translationStatus.ar).toBe("missing");
  });

  it("run: translating Arabic back to English reads the Ar columns", async () => {
    const { db, service } = setup();
    const { quiz } = await quizAndSheet();
    db.lesson.findUnique.mockImplementation(async (a: { select?: unknown }) =>
      a.select ? { translationStatus: { en: "working", ar: "ready" }, contentLocale: "ar" } : lesson({ en: "working", ar: "ready" }, { contentLocale: "ar", titleEn: null, titleAr: "التمثيل الضوئي: كيف تصنع النباتات غذاءها" }),
    );
    db.resource.findMany.mockResolvedValue([{ id: "r1", kind: "QUIZ", contentEn: null, contentAr: quiz }, { id: "r2", kind: "CARDS", contentEn: null, contentAr: null }]);
    db.aiCheck.findMany.mockResolvedValue([]);
    await service.run("L1", "en");
    expect(db.resource.update).toHaveBeenCalledTimes(1);
    expect(db.resource.update.mock.calls[0][0].data).toHaveProperty("contentEn");
    expect(db.lesson.update.mock.calls.at(-1)[0].data).toEqual({ translationStatus: { en: "ready", ar: "ready" } });
  });

  it("run: a missing lesson or a crash never throws", async () => {
    const { db, service } = setup();
    db.lesson.findUnique.mockResolvedValue(null);
    await expect(service.run("L1", "ar")).resolves.toBeUndefined();
    db.lesson.findUnique.mockRejectedValue(new Error("db"));
    await expect(service.run("L1", "ar")).resolves.toBeUndefined();
  });
});
