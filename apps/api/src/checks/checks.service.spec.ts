import type { QuizContent } from "@helpo/shared";
import { DemoAiProvider } from "../ai/demo.provider";
import { mockPrisma } from "../testing/mock-prisma";
import { ChecksService } from "./checks.service";

async function setup() {
  const demo = new DemoAiProvider();
  const ctx = { title: "Photosynthesis: how plants make food", grade: 6, band: "NAVIGATOR" as const, locale: "en" as const, language: "English", durationMin: 45, standard: null, objectives: [], sourceText: "" };
  const quiz = (await demo.generateResource("QUIZ", ctx)).content as QuizContent;
  const db = mockPrisma();
  const check = {
    id: "ck1", lessonId: "L1", resource: "QUIZ", itemRef: "Q9", kind: "READING_LEVEL", status: "OPEN", sourcePage: null,
    messageEn: "Too hard", messageAr: null, suggestionEn: "Which input gives a plant energy?", suggestionAr: null,
    editedTextEn: null, editedTextAr: null, originalTextEn: null, originalTextAr: null,
  };
  db.aiCheck.findFirst.mockResolvedValue(check);
  db.resource.findUnique.mockResolvedValue({ id: "r1", contentEn: quiz, contentAr: null });
  db.aiCheck.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...check, ...data }));
  return { db, quiz, check, service: new ChecksService(db) };
}

const lastContent = (db: ReturnType<typeof mockPrisma>) => db.resource.update.mock.calls.at(-1)[0].data.contentEn as QuizContent;

describe("ChecksService", () => {
  it("ACCEPTED applies the suggestion to the referenced item and remembers the original", async () => {
    const { db, quiz, service } = await setup();
    const view = await service.resolve("T1", "ck1", "ACCEPTED", "en");
    expect(view).toMatchObject({ status: "ACCEPTED", suggestion: "Which input gives a plant energy?" });
    expect(lastContent(db).questions[8].prompt).toBe("Which input gives a plant energy?");
    expect(db.aiCheck.update.mock.calls[0][0].data.originalTextEn).toBe(quiz.questions[8].prompt);
  });

  it("EDITED applies the teacher's text", async () => {
    const { db, service } = await setup();
    await service.resolve("T1", "ck1", "EDITED", "en", "My own wording?");
    expect(lastContent(db).questions[8].prompt).toBe("My own wording?");
    expect(db.aiCheck.update.mock.calls[0][0].data.editedTextEn).toBe("My own wording?");
  });

  it("OPEN undoes an applied change using the stored original", async () => {
    const { db, quiz, check, service } = await setup();
    const original = quiz.questions[8].prompt;
    db.aiCheck.findFirst.mockResolvedValue({ ...check, status: "ACCEPTED", originalTextEn: original });
    db.resource.findUnique.mockResolvedValue({ id: "r1", contentEn: { questions: quiz.questions.map((q, i) => (i === 8 ? { ...q, prompt: "changed" } : q)) }, contentAr: null });
    const view = await service.resolve("T1", "ck1", "OPEN", "en");
    expect(view.status).toBe("OPEN");
    expect(lastContent(db).questions[8].prompt).toBe(original);
    expect(db.aiCheck.update.mock.calls[0][0].data).toMatchObject({ originalTextEn: null, resolvedAt: null });
  });

  it("DISMISSED leaves the content alone", async () => {
    const { db, service } = await setup();
    await service.resolve("T1", "ck1", "DISMISSED", "en");
    expect(db.resource.update).not.toHaveBeenCalled();
  });

  it("applies to the language being viewed, using the Arabic column and suggestion", async () => {
    const { db, quiz, check, service } = await setup();
    const arCheck = { ...check, messageAr: "صعب", suggestionAr: "ما المُدخل؟" };
    db.aiCheck.findFirst.mockResolvedValue(arCheck);
    db.aiCheck.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...arCheck, ...data }));
    db.resource.findUnique.mockResolvedValue({ id: "r1", contentEn: quiz, contentAr: quiz });
    const view = await service.resolve("T1", "ck1", "ACCEPTED", "ar");
    expect(view.message).toBe("صعب");
    const data = db.resource.update.mock.calls.at(-1)[0].data;
    expect(data.contentAr.questions[8].prompt).toBe("ما المُدخل؟");
    expect(data.contentEn).toBeUndefined();
  });

  it("rejects accepting without a suggestion, editing without text, and unknown checks", async () => {
    const { db, check, service } = await setup();
    db.aiCheck.findFirst.mockResolvedValue({ ...check, suggestionEn: null });
    await expect(service.resolve("T1", "ck1", "ACCEPTED", "en")).rejects.toMatchObject({ status: 400 });
    await expect(service.resolve("T1", "ck1", "EDITED", "en", "  ")).rejects.toMatchObject({ status: 400 });
    db.aiCheck.findFirst.mockResolvedValue(null);
    await expect(service.resolve("T2", "ck1", "ACCEPTED", "en")).rejects.toMatchObject({ status: 404 });
  });

  it("is scoped by teacher", async () => {
    const { db, service } = await setup();
    await service.resolve("T9", "ck1", "DISMISSED", "en");
    expect(db.aiCheck.findFirst).toHaveBeenCalledWith({ where: { id: "ck1", lesson: { teacherId: "T9" } } });
  });
});
