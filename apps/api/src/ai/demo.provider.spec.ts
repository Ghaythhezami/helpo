import { RESOURCE_KINDS, type QuizContent, type ResourceKind, type WorksheetContent } from "@helpo/shared";
import { isDemoMode, type LessonContext } from "./ai.provider";
import { CONTENT_SCHEMAS, contentProblems, countStatements, dropUngrounded, getItemText, setItemText, worksheetItems, type ResourceContent } from "./content";
import { DemoAiProvider, placeholderTranslate, simplifyText } from "./demo.provider";

const ctx = (title: string, locale: "en" | "ar" = "en"): LessonContext => ({
  title,
  grade: 6,
  band: "NAVIGATOR",
  locale,
  language: locale === "ar" ? "Arabic (Modern Standard Arabic)" : "English",
  durationMin: 45,
  standard: null,
  objectives: [{ code: "O1", text: "Explain it.", bloom: "understand", sourcePage: 1 }],
  sourceText: "Plants make food. This sentence is long enough to be used as a source line.",
});

const PLANTS = "Photosynthesis: how plants make food";
const ai = new DemoAiProvider();
const gen = async (kind: ResourceKind, c: LessonContext) => (await ai.generateResource(kind, c)).content;

describe("DemoAiProvider", () => {
  it.each([PLANTS, "The Roman Republic"])("generates schema-valid, rule-valid content for every kind (%s)", async (title) => {
    for (const kind of RESOURCE_KINDS) {
      const content = await gen(kind, ctx(title));
      expect(CONTENT_SCHEMAS[kind].safeParse(content).success).toBe(true);
      expect(contentProblems(kind, content)).toEqual([]);
    }
  });

  it("reports usage with the prompt version", async () => {
    const r = await ai.generateResource("QUIZ", ctx(PLANTS));
    expect(r.usage).toEqual({ model: "demo", promptVersion: "quiz.v1", tokensIn: 0, tokensOut: 0 });
  });

  it("the quiz has 10 questions, exactly one correct option, a mix of types and every concept grounded in the blueprint", async () => {
    const c = ctx(PLANTS);
    const bp = await ai.analyze(c);
    const quiz = (await gen("QUIZ", c)) as QuizContent;
    expect(quiz.questions).toHaveLength(10);
    expect(new Set(quiz.questions.map((q) => q.type))).toEqual(new Set(["mcq", "tf", "short"]));
    for (const q of quiz.questions.filter((x) => x.options)) expect(q.options?.filter((o) => o.correct)).toHaveLength(1);
    const names = new Set([...bp.keyConcepts.map((k) => k.name), ...bp.vocabulary.map((v) => v.term)]);
    expect(quiz.questions.every((q) => names.has(q.concept))).toBe(true);
    expect(quiz.questions[8].prompt.length).toBeGreaterThan(quiz.questions[0].prompt.length * 2);
  });

  it("fills every game field so all templates can play it", async () => {
    const g = (await gen("GAME", ctx(PLANTS))) as { pairs: unknown[]; sortItems: unknown[]; equationTiles: unknown[]; statements: unknown[]; gridSize: number | null };
    expect(g.pairs.length).toBeGreaterThanOrEqual(6);
    expect(g.sortItems.length).toBeGreaterThanOrEqual(6);
    expect(g.equationTiles.length).toBeGreaterThanOrEqual(4);
    expect(g.statements.length).toBeGreaterThanOrEqual(6);
    expect(g.gridSize).toBe(14);
  });

  it("analyzes into a spec-shaped blueprint", async () => {
    const bp = await ai.analyze(ctx(PLANTS));
    expect(bp).toMatchObject({ gradeLevel: "Grade 6", language: "en", suggestedGameType: "matching", standard: "NGSS MS-LS1-6" });
    expect(bp.objectives.length).toBeGreaterThanOrEqual(3);
    expect(bp.keyConcepts.length).toBeGreaterThanOrEqual(5);
    expect(bp.vocabulary[0]).toHaveProperty("meaning");
    expect(bp.commonMisconceptions.length).toBeGreaterThan(0);
    expect((await ai.analyze(ctx("Rome", "ar"))).objectives[0].text.startsWith("[ar]")).toBe(true);
    expect((await ai.analyzeChunk(ctx(PLANTS), "chunk")).title).toBeTruthy();
    const parts = [bp];
    expect(await ai.reduceBlueprints(ctx(PLANTS), parts)).toBe(bp);
    expect(await ai.countTokens("12345678")).toBe(2);
    expect(await ai.transcribePdf()).toBe("");
  });

  it("returns the three honest checks mirroring the brief", async () => {
    const c = ctx(PLANTS);
    const checks = await ai.generateChecks(c, { QUIZ: await gen("QUIZ", c), WORKSHEET: await gen("WORKSHEET", c) });
    expect(checks.map((x) => [x.itemRef, x.kind])).toEqual([
      ["Q4", "FACT_CHECK"],
      ["Q9", "READING_LEVEL"],
      ["A5", "ORDER"],
    ]);
    expect(checks[0].sourcePage).toBe(6);
    expect(checks[1].suggestion).toBeTruthy();
    expect(checks[2].suggestion).toContain("Hint");
  });

  it("writes hand-made Arabic for the photosynthesis kit and its checks", async () => {
    const c = ctx("التمثيل الضوئي: كيف تصنع النباتات غذاءها", "ar");
    const quiz = (await gen("QUIZ", c)) as QuizContent;
    const sheet = (await gen("WORKSHEET", c)) as WorksheetContent;
    expect(quiz.questions[0].prompt).toMatch(/[؀-ۿ]/);
    for (const kind of RESOURCE_KINDS) expect(CONTENT_SCHEMAS[kind].safeParse(await gen(kind, c)).success).toBe(true);
    const checks = await ai.generateChecks(c, { QUIZ: quiz, WORKSHEET: sheet });
    expect(checks).toHaveLength(3);
    expect(checks[1].message).toMatch(/[؀-ۿ]/);
  });

  it("translates the plant kit and marks other lessons with placeholders", async () => {
    const en = ctx(PLANTS);
    const arQuiz = (await ai.translateContent("QUIZ", await gen("QUIZ", en), en, "ar")) as QuizContent;
    expect(arQuiz.questions[0].prompt).toMatch(/[؀-ۿ]/);

    const other = ctx("The Roman Republic");
    const otherQuiz = (await gen("QUIZ", other)) as QuizContent;
    const ph = (await ai.translateContent("QUIZ", otherQuiz, other, "ar")) as QuizContent;
    expect(CONTENT_SCHEMAS.QUIZ.safeParse(ph).success).toBe(true);
    expect(ph.questions[0].prompt.startsWith("[ar] ")).toBe(true);
    expect(ph.questions[0].id).toBe("Q1");
    expect(ph.questions[0].difficulty).toBe(otherQuiz.questions[0].difficulty);
    expect(ph.questions[0].options?.[0].correct).toBe(otherQuiz.questions[0].options?.[0].correct);
    const arGeneric = (await gen("CARDS", ctx("The Roman Republic", "ar"))) as { cards: { front: string; tag: string }[] };
    expect(arGeneric.cards[0].front.startsWith("[ar] ")).toBe(true);
    expect(arGeneric.cards[0].tag).toBe("concept");
  });

  it("translates lesson meta and checks", async () => {
    const en = ctx(PLANTS);
    const meta = await ai.translateMeta({ title: en.title, unitTitle: "Plants and energy", description: null, objectives: [] }, en, "ar");
    expect(meta.title).toMatch(/[؀-ۿ]/);
    expect(meta.unitTitle).toBe("النباتات والطاقة");
    const out = await ai.translateChecks([{ itemRef: "Q9", message: "m", suggestion: "s" }, { itemRef: "Z1", message: "x", suggestion: null }], en, "ar");
    expect(out[0].message).toMatch(/[؀-ۿ]/);
    expect(out[1].message).toBe("[ar] x");
    expect((await ai.translateMeta({ title: "Rome", unitTitle: null, description: "d", objectives: [] }, ctx("Rome"), "ar")).title).toBe("[ar] Rome");
  });

  it("rewrites, changes and reteaches", async () => {
    expect(await ai.rewrite(ctx("Rome"), "Utilize approximately ten words, subsequently.", "simpler")).not.toMatch(/utilize/i);
    expect(await ai.rewrite(ctx("Rome"), "Hello.", "example")).toContain("For example");
    expect(await ai.rewrite(ctx("Rome"), "Hello.", "translate", "Arabic")).toContain("[Arabic]");
    expect(await ai.rewrite(ctx("Rome"), "Hello.", "regenerate")).toContain("another way");
    const quiz = await gen("QUIZ", ctx("Rome"));
    expect((await ai.changeRequest(ctx("Rome"), "QUIZ", quiz, "make it easier")).summary).toMatch(/simpler/);
    expect((await ai.changeRequest(ctx("Rome"), "QUIZ", quiz, "add a rainbow")).content).toBe(quiz);
    for (const kind of RESOURCE_KINDS) {
      const changed = await ai.changeRequest(ctx("Rome"), kind, await gen(kind, ctx("Rome")), "simpler please");
      expect(CONTENT_SCHEMAS[kind].safeParse(changed.content).success).toBe(true);
    }
    expect((await ai.reteachPlan(ctx("Rome"), { objectiveCode: "O1", objectiveText: "Explain it.", misconception: "mix-up" })).targetObjectiveCode).toBe("O1");
  });

  it("refines a rough prompt deterministically, in English or Arabic, within 600 characters", async () => {
    const a = await ai.refinePrompt({ prompt: "photosynthesis lesson for kids pls", locale: "en", grade: 6, subject: "Science", durationMin: 45 });
    const b = await ai.refinePrompt({ prompt: "photosynthesis lesson for kids pls", locale: "en", grade: 6, subject: "Science", durationMin: 45 });
    expect(a).toEqual(b);
    expect(a.prompt).toContain("Grade 6");
    expect(a.prompt.length).toBeLessThanOrEqual(600);
    expect(a.suggestions).toHaveLength(3);
    const ar = await ai.refinePrompt({ prompt: "درس عن التمثيل الضوئي", locale: "ar" });
    expect(ar.prompt).toMatch(/[؀-ۿ]/);
    expect((await ai.refinePrompt({ prompt: "x".repeat(2000), locale: "en" })).prompt.length).toBeLessThanOrEqual(600);
  });

  it("helpers", () => {
    expect(simplifyText("We utilize a very long sentence that keeps going and going well past sixteen words in total length.")).toMatch(/\.$/);
    expect(placeholderTranslate({ id: "Q1", text: "hi", list: ["a"], correct: true }, "ar")).toEqual({ id: "Q1", text: "[ar] hi", list: ["[ar] a"], correct: true });
    expect(isDemoMode({} as NodeJS.ProcessEnv)).toBe(true);
    expect(isDemoMode({ ANTHROPIC_API_KEY: "k" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isDemoMode({ ANTHROPIC_API_KEY: "k", AI_MODE: "demo" } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });
});

describe("content helpers", () => {
  it("reads, replaces (without mutating) and counts item text", async () => {
    const quiz = (await gen("QUIZ", ctx("Rome"))) as ResourceContent;
    const before = getItemText("QUIZ", quiz, "Q9");
    const next = setItemText("QUIZ", quiz, "Q9", "Short?") as QuizContent;
    expect(next.questions[8].prompt).toBe("Short?");
    expect(getItemText("QUIZ", quiz, "Q9")).toBe(before);
    expect(setItemText("QUIZ", quiz, "Q99", "x")).toBeNull();
    expect(countStatements("QUIZ", quiz)).toBe(10);

    const sheet = (await gen("WORKSHEET", ctx("Rome"))) as WorksheetContent;
    const changed = setItemText("WORKSHEET", sheet, "A5", "New") as WorksheetContent;
    expect(worksheetItems(changed)[4].prompt).toBe("New");
    expect(countStatements("WORKSHEET", sheet)).toBe(worksheetItems(sheet).length);
    for (const kind of ["SLIDES", "CARDS", "GAME"] as const) {
      const c = await gen(kind, ctx("Rome"));
      const ref = kind === "SLIDES" ? "S2" : kind === "CARDS" ? "C2" : "G2";
      expect(getItemText(kind, c, ref)).toBeTruthy();
      expect(getItemText(kind, setItemText(kind, c, ref, "zzz") as ResourceContent, ref)).toBe("zzz");
      expect(countStatements(kind, c)).toBeGreaterThan(5);
    }
  });
});

describe("DemoAiProvider grounding (any topic)", () => {
  it.each(["Water cycle grade 4", "Fractions: adding unlike denominators", "Photosynthesis"])(
    "keeps every card and question grounded in its own blueprint for %s",
    async (title) => {
      const c = ctx(title);
      const bp = await ai.analyze(c);
      for (const kind of ["CARDS", "QUIZ"] as const) {
        const content = await gen(kind, { ...c, blueprint: bp } as LessonContext);
        expect(dropUngrounded(kind, content, bp).dropped).toBe(0);
      }
    },
  );
});

describe("DemoAiProvider grounding after an auto title change", () => {
  it("keeps cards grounded when generation runs with a different title than analysis", async () => {
    const bp = await ai.analyze(ctx("Grade 4 science, 45 min: the water cycle (evaporation, condensation, precipitation)"));
    const cards = await gen("CARDS", { ...ctx("Water cycle grade 4"), blueprint: bp } as LessonContext);
    expect(dropUngrounded("CARDS", cards, bp).dropped).toBe(0);
  });
});
