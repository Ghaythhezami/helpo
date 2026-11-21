import type { LessonContext } from "./ai.provider";
import { SYSTEM_PROMPT, analyzeTask, documentBlock, isPromptOnly } from "./prompts";
import { shortTitle } from "../lessons/pipeline.service";

const base: LessonContext = {
  title: "Volcanoes",
  grade: 7,
  band: "NAVIGATOR",
  language: "English",
  locale: "en",
  durationMin: 45,
  standard: null,
  objectives: [],
  sourceText: "",
  prompt: "Lesson brief: Volcanoes for Grade 7, 45 minutes, magma vs lava, a matching game.",
} as unknown as LessonContext;

describe("prompt-only lessons (no uploaded document)", () => {
  it("are detected when there is no source text or the source text is the prompt itself", () => {
    expect(isPromptOnly(base)).toBe(true);
    expect(isPromptOnly({ ...base, sourceText: base.prompt ?? "" })).toBe(true);
    expect(isPromptOnly({ ...base, sourceText: "Page 1: Volcanoes form where magma rises." })).toBe(false);
  });

  it("send the teacher's text as a topic, not as the only allowed source of facts", () => {
    const block = documentBlock(base);
    expect(block).toContain("there is NO document");
    expect(block).toContain("<topic>");
    expect(block).not.toContain("the only allowed source of facts");
  });

  it("use topic instructions that forbid an empty blueprint", () => {
    expect(analyzeTask(base)).toContain("There is no document");
    expect(analyzeTask(base)).toContain("Never leave it empty");
    const withFile = { ...base, sourceText: "Page 1: Volcanoes form where magma rises." };
    expect(analyzeTask(withFile)).toContain("use only what the document says");
    expect(documentBlock(withFile)).toContain("<document>");
  });

  it("keep student content about the topic, never about the tool", () => {
    expect(SYSTEM_PROMPT).toContain("never mention Nibras");
  });

  it("get a clean provisional title from a refined brief", () => {
    expect(shortTitle("Lesson brief: Volcanoes for Grade 7 (science)")).toBe("Volcanoes for Grade 7 (science)");
    expect(shortTitle("Lesson plan: The water cycle")).toBe("The water cycle");
  });
});

describe("prompt-only topic priority", () => {
  it("drops Topic/Subject labels so the provisional title is the real topic", () => {
    expect(shortTitle("Topic: Volcanoes. Grade: 7. Subject: Science")).toBe("Volcanoes");
    expect(shortTitle("Subject: Fractions, grade 5")).toBe("Fractions");
  });
  it("tells Claude the topic text outranks a provisional title", () => {
    expect(documentBlock({ ...base, title: "Topic" })).toContain("The topic text below is authoritative");
  });
});
