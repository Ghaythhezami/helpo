import type Anthropic from "@anthropic-ai/sdk";
import { ClaudeAiProvider } from "../ai/claude.provider";
import { DemoAiProvider } from "../ai/demo.provider";
import type { AiProvider, LessonContext } from "../ai/ai.provider";
import { DocumentsService } from "../documents/documents.service";
import { InlineJobQueue } from "../jobs/job-queue";
import { mockPrisma } from "../testing/mock-prisma";
import { AnalysisService } from "./analysis.service";
import { PipelineService } from "./pipeline.service";

/**
 * Regression for the production bug: a prompt-only lesson whose prompt was "Grade 11 Science, 45-minute lesson on cyber
 * security measures..." came out as "Chemical Reactions", because (a) lessonContext never passed the prompt, so the
 * analysis saw only the provisional title, and (b) the title was "Grade 11 Science".
 *
 * The fake AI records exactly the text Claude would receive.
 */
const PROMPT = "Grade 11 Science, 45-minute lesson on cyber security measures. Key concepts: phishing, strong passwords, two-factor authentication, malware.";

/** A real ClaudeAiProvider over a fake SDK client: the captured payload is the request text. */
function claudeWithCapture() {
  const demo = new DemoAiProvider();
  const parse = jest.fn(async () => ({
    parsed_output: await demo.analyze({ title: "Cyber security measures", grade: 11, band: "STUDIO", locale: "en", language: "English", durationMin: 45, standard: null, objectives: [], sourceText: "", prompt: PROMPT }),
    stop_reason: "end_turn",
    usage: { input_tokens: 1, output_tokens: 1 },
  }));
  const client = { beta: { messages: { parse } }, messages: { create: jest.fn(), countTokens: jest.fn() } };
  const ai = new ClaudeAiProvider(client as unknown as Anthropic);
  const requestText = (n = 0) => {
    const call = parse.mock.calls[n] as unknown as { messages: { content: { text: string }[] }[] }[];
    return call[0].messages[0].content.map((c) => c.text).join("\n");
  };
  return { ai, parse, requestText };
}

function setup(ai: AiProvider) {
  const db = mockPrisma();
  const generation = { startInternal: jest.fn().mockResolvedValue(true) };
  const queue = new InlineJobQueue();
  jest.spyOn(queue, "schedule").mockReturnValue(true);
  const service = new PipelineService(db, new DocumentsService(), new AnalysisService(ai), generation as never, { put: jest.fn() } as never, queue, ai);
  db.classRoom.findFirst.mockResolvedValue({ id: "C1" });
  db.lesson.count.mockResolvedValue(0);
  db.lesson.create.mockResolvedValue({ id: "L1" });
  db.lesson.update.mockResolvedValue({});
  return { db, service, generation };
}

const body = (over: Record<string, unknown> = {}) => ({ classId: "C1", durationMin: 45, reuse: true, autoGenerate: true, curriculum: "GENERAL", ...over }) as never;

/** The lesson row as the database would return what `create` stored. */
function storedLesson(db: ReturnType<typeof mockPrisma>) {
  const data = db.lesson.create.mock.calls[0][0].data as Record<string, unknown>;
  return {
    id: "L1",
    teacherId: "T1",
    classId: "C1",
    status: "UPLOADED",
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
    sourceText: null,
    tokenCount: null,
    blueprint: null,
    ...data,
    classRoom: { name: "11A", grade: 11, band: "STUDIO" },
  };
}

describe("prompt-only lessons keep the teacher's topic (production regression)", () => {
  it("the stored title is the topic, not 'Grade 11 Science'", async () => {
    const { db, service } = setup(new DemoAiProvider());
    await service.create("T1", body({ prompt: PROMPT }));
    const data = db.lesson.create.mock.calls[0][0].data;
    expect(data.titleEn).toBe("Cyber security measures");
    expect(data.titleEn).not.toBe("Grade 11 Science");
    expect(data.prompt).toBe(PROMPT);
    expect(data.aiWritten).toBe(true);
  });

  it("the analysis request Claude receives contains the cyber security topic, and the title is not the class metadata", async () => {
    const { ai, parse, requestText } = claudeWithCapture();
    const { db, service } = setup(ai);
    await service.create("T1", body({ prompt: PROMPT }));
    db.lesson.findUnique.mockResolvedValue(storedLesson(db));

    await service.analyze("L1");

    expect(parse).toHaveBeenCalledTimes(1); // ONE analysis call
    const text = requestText();
    expect(text).toMatch(/cyber security/i);
    expect(text).toContain("<topic>");
    expect(text).toContain(PROMPT); // the whole prompt, key concepts included
    expect(text).toContain("Title: Cyber security measures");
    expect(text).not.toContain("Title: Grade 11 Science");
    expect(text).toContain("there is NO document");
    expect(text).toContain("There is no document: build the lesson blueprint from the teacher's topic"); // the topic task
    expect(text.split(PROMPT)).toHaveLength(2); // sent once, not twice
  });

  it("lessonContext hands the prompt and the curriculum to the AI, so a prompt-only lesson never falls back to its title", async () => {
    const seen: LessonContext[] = [];
    class Spy extends DemoAiProvider {
      async analyze(ctx: LessonContext) {
        seen.push(ctx);
        return super.analyze(ctx);
      }
    }
    const { db, service } = setup(new Spy());
    await service.create("T1", body({ prompt: PROMPT, curriculum: "AMERICAN" }));
    expect(db.lesson.create.mock.calls[0][0].data.curriculum).toBe("AMERICAN");
    db.lesson.findUnique.mockResolvedValue(storedLesson(db));
    await service.analyze("L1");
    expect(seen[0]).toMatchObject({ prompt: PROMPT, curriculum: "AMERICAN", title: "Cyber security measures", sourceText: "" });
  });

  it("curriculum shows in the request as one line, and GENERAL means no national curriculum", async () => {
    const american = claudeWithCapture();
    const a = setup(american.ai);
    await a.service.create("T1", body({ prompt: PROMPT, curriculum: "AMERICAN" }));
    a.db.lesson.findUnique.mockResolvedValue(storedLesson(a.db));
    await a.service.analyze("L1");
    expect(american.requestText()).toContain("Curriculum: American (Common Core / NGSS). Use its terminology, standard codes and examples where they apply.");

    const general = claudeWithCapture();
    const g = setup(general.ai);
    await g.service.create("T1", body({ prompt: PROMPT }));
    g.db.lesson.findUnique.mockResolvedValue(storedLesson(g.db));
    await g.service.analyze("L1");
    expect(general.requestText()).toContain("Curriculum: no national curriculum.");
  });

  it("the offline demo derives its topic from the prompt: cyber security is not a plants lesson", async () => {
    const { db, service } = setup(new DemoAiProvider());
    await service.create("T1", body({ prompt: PROMPT }));
    db.lesson.findUnique.mockResolvedValue(storedLesson(db));
    await service.analyze("L1");
    const update = db.lesson.update.mock.calls.map((c: { data: Record<string, unknown> }[]) => c[0].data).find((d: Record<string, unknown>) => d.blueprint) as { blueprint: { title: string; keyConcepts: { name: string }[]; summary: string } };
    const text = JSON.stringify(update.blueprint).toLowerCase();
    expect(update.blueprint.title).toMatch(/cyber security/i);
    expect(text).not.toMatch(/photosynth|chlorophyll|plant/);
    expect(update.blueprint.keyConcepts.map((c) => c.name)).toEqual(expect.arrayContaining(["Phishing", "Strong passwords", "Two-factor authentication", "Malware"]));
  });

  it("a demo prompt whose title is only class metadata still gets the topic from the prompt text", async () => {
    const demo = new DemoAiProvider();
    const ctx: LessonContext = { title: "Grade 11 Science", grade: 11, band: "STUDIO", locale: "en", language: "English", durationMin: 45, standard: null, objectives: [], sourceText: "", prompt: PROMPT };
    const bp = await demo.analyze(ctx);
    expect(bp.title).toMatch(/cyber security/i);
    const quiz = JSON.stringify((await demo.generateResource("QUIZ", { ...ctx, title: bp.title, blueprint: bp })).content).toLowerCase();
    expect(quiz).toContain("cyber security");
    expect(quiz).not.toContain("photosynthesis");
  });
});
