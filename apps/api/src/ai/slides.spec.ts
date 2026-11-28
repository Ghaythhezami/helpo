import { SlidesContentSchema, type Slide, type SlidesContent } from "@helpo/shared";
import { PROMPT_VERSIONS, taskFor } from "./prompts/index";
import type { LessonContext } from "./ai.provider";
import { contentProblems, getItemText, postProcessSlides, setItemText, slidesProblems } from "./content";
import { DemoAiProvider } from "./demo.provider";
import { generateWithRepair } from "./generators";

const demo = new DemoAiProvider();
const objectives = [
  { code: "O1", text: "Name the inputs and outputs of photosynthesis.", bloom: "remember" as const, sourcePage: 1 },
  { code: "O2", text: "Explain how plants make food.", bloom: "understand" as const, sourcePage: 2 },
];
const ctx = (over: Partial<LessonContext> = {}): LessonContext => ({ title: "Photosynthesis: how plants make food", grade: 6, band: "NAVIGATOR", locale: "en", language: "English", durationMin: 45, standard: null, objectives, sourceText: "", ...over });
const deck = async (c = ctx()) => (await demo.generateResource("SLIDES", c)).content as SlidesContent;

const blank: Slide = { layout: "bullets", title: "T", subtitle: null, keyIdea: null, bullets: ["a b"], columns: null, term: null, definition: null, example: null, steps: null, question: null, options: null, answerIndex: null, takeaways: null, speakerNotes: "n", imagePrompt: null, emoji: null, objectiveCodes: ["O1"] };
const s = (over: Partial<Slide>): Slide => ({ ...blank, ...over });

describe("slides.v2 prompt", () => {
  it("is versioned and describes the teaching arc", () => {
    expect(PROMPT_VERSIONS.SLIDES).toBe("slides.v2");
    const t = taskFor("SLIDES", {});
    for (const w of ["hook question", "I can", "definition", "process", "twoColumn", "quizBreak", "exit-ticket", "At most 5 bullets", "12 words", "misconception"]) expect(t).toContain(w);
  });
});

describe("demo slides", () => {
  it("is a valid v2 deck in English and Arabic (plants and generic topics)", async () => {
    const cases = [ctx(), ctx({ locale: "ar", language: "Arabic" }), ctx({ title: "The water cycle", sourceText: "Water evaporates. Clouds form. Rain falls." }), ctx({ title: "The water cycle", locale: "ar", language: "Arabic" })];
    for (const c of cases) {
      const d = await deck(c);
      expect(SlidesContentSchema.safeParse(d).success).toBe(true);
      expect(slidesProblems(d, c.objectives.map((o) => o.code))).toEqual([]);
      expect(d.slides[0].layout).toBe("title");
      expect(d.slides.at(-1)?.layout).toBe("summary");
      expect(new Set(d.slides.map((x) => x.layout)).size).toBeGreaterThanOrEqual(6);
    }
  });
  it("covers all seven layouts for the plants lesson and passes the repair loop first time", async () => {
    const r = await generateWithRepair(demo, "SLIDES", ctx());
    const d = r.content as SlidesContent;
    expect(new Set(d.slides.map((x) => x.layout)).size).toBe(7);
    expect(r.attempts).toBe(1);
  });
  it("works without objectives", async () => {
    const d = await deck(ctx({ objectives: [] }));
    expect(slidesProblems(d)).toEqual([]);
  });
});

describe("slidesProblems", () => {
  it("accepts a valid deck and finds each problem", async () => {
    const d = await deck();
    expect(contentProblems("SLIDES", d, { objectiveCodes: ["O1", "O2"] })).toEqual([]);
    const text = (m: (x: SlidesContent) => void) => {
      const c = structuredClone(d);
      m(c);
      return slidesProblems(c, ["O1", "O2"]).join(" | ");
    };
    expect(text((c) => (c.slides = c.slides.slice(0, 3)))).toMatch(/8 to 14/);
    expect(text((c) => (c.slides[0].layout = "bullets"))).toMatch(/first slide must use the title/);
    expect(text((c) => (c.slides[c.slides.length - 1].layout = "bullets"))).toMatch(/last slide must use the summary/);
    expect(text((c) => c.slides.forEach((x) => x.layout === "quizBreak" && (x.layout = "bullets")))).toMatch(/at least one quizBreak/);
    expect(text((c) => (c.slides[1].objectiveCodes = ["O9"]))).toMatch(/unknown objective codes: O9/);
    expect(text((c) => (c.slides[1].bullets = ["one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen"]))).toMatch(/longer than 12 words/);
    expect(text((c) => (c.slides[1].bullets = ["x", "x1", "x2", "x3", "x4", "x5"]))).toMatch(/more than 5 bullets/);
    expect(
      text((c) => {
        c.slides[1].bullets = ["Same thing"];
        c.slides[2].bullets = ["same   thing!"];
      }),
    ).toMatch(/repeats a bullet from slide 2/);
    expect(text((c) => (c.slides[1].title = " "))).toMatch(/has no title/);
    expect(text((c) => (c.slides[1].keyIdea = Array(30).fill("w").join(" ")))).toMatch(/keyIdea is too long/);
    expect(text((c) => (c.slides[0].question = null))).toMatch(/hook question/);
    expect(text((c) => (c.slides[1].bullets = []))).toMatch(/needs at least one bullet/);
  });
  it("checks the fields each layout needs", () => {
    const p = (slide: Slide) =>
      slidesProblems({ deckTitle: "d", slides: [slide] })
        .filter((x) => !/Expected|first slide|last slide|quizBreak slide/.test(x))
        .join(" | ");
    expect(p(s({ layout: "twoColumn", columns: null }))).toMatch(/exactly 2 columns/);
    expect(p(s({ layout: "twoColumn", columns: [{ heading: "", points: [] }, { heading: "B", points: ["x"] }] }))).toMatch(/heading and 1 to 5/);
    expect(p(s({ layout: "definition" }))).toMatch(/term and a definition/);
    expect(p(s({ layout: "process", steps: [{ title: "a", detail: "b" }] }))).toMatch(/2 to 6 steps/);
    expect(p(s({ layout: "process", steps: [{ title: "a", detail: "" }, { title: "b", detail: "c" }] }))).toMatch(/empty step/);
    expect(p(s({ layout: "quizBreak", question: null, options: ["a", "a"], answerIndex: 5 }))).toMatch(/needs a question.*3 or 4 options.*repeated option.*answerIndex/);
    expect(p(s({ layout: "quizBreak", question: "q", options: ["a", "b", "c"], answerIndex: null }))).toMatch(/answerIndex/);
    expect(p(s({ layout: "summary", takeaways: ["a"], question: null }))).toMatch(/exactly 3 takeaways.*exit-ticket/);
    expect(p(s({ bullets: [""] }))).toMatch(/empty bullet/);
    expect(p(s({ layout: "summary", takeaways: [Array(40).fill("w").join(" "), "b", "c"], question: "q" }))).toMatch(/takeaway that is too long/);
  });
});

describe("postProcessSlides", () => {
  it("trims, dedupes bullets, caps lists and keeps answerIndex inside the options", () => {
    const out = postProcessSlides({
      deckTitle: "  Deck ",
      slides: [
        s({
          title: " T ",
          bullets: [" a  b ", "A B", "", "c", "d", "e", "f", "g"],
          keyIdea: "  ",
          subtitle: " sub ",
          options: [" x ", "", "y", "z", "w", "v"],
          answerIndex: 9,
          takeaways: [" 1 ", "2", "3", "4"],
          columns: [{ heading: " H ", points: [" p ", ""] }],
          steps: [{ title: " t ", detail: " d " }],
          speakerNotes: " n ",
          emoji: " ",
        }),
        s({ options: ["a", "b", "c"], answerIndex: 2 }),
        s({ options: null, answerIndex: 1, columns: null, steps: null, takeaways: null }),
      ],
    });
    const x = out.slides[0];
    expect(out.deckTitle).toBe("Deck");
    expect(x.title).toBe("T");
    expect(x.bullets).toEqual(["a b", "c", "d", "e", "f"]);
    expect(x.keyIdea).toBeNull();
    expect(x.subtitle).toBe("sub");
    expect(x.options).toEqual(["x", "y", "z", "w"]);
    expect(x.answerIndex).toBeNull();
    expect(x.takeaways).toEqual(["1", "2", "3"]);
    expect(x.columns).toEqual([{ heading: "H", points: ["p"] }]);
    expect(x.steps).toEqual([{ title: "t", detail: "d" }]);
    expect(x.speakerNotes).toBe("n");
    expect(x.emoji).toBeNull();
    expect(out.slides[1].answerIndex).toBe(2);
    expect(out.slides[2].answerIndex).toBeNull();
  });
});

describe("check text addressing for v2 slides", () => {
  it("reads and replaces the layout's main text", async () => {
    const d = await deck();
    for (const layout of ["bullets", "definition", "quizBreak", "summary", "twoColumn", "process"] as const) {
      const ref = `S${d.slides.findIndex((x) => x.layout === layout) + 1}`;
      expect(getItemText("SLIDES", d, ref)).toBeTruthy();
      const next = setItemText("SLIDES", d, ref, "NEW TEXT") as SlidesContent;
      expect(getItemText("SLIDES", next, ref)).toBe("NEW TEXT");
    }
    const bare: SlidesContent = { deckTitle: "d", slides: [s({ bullets: [] })] };
    expect(getItemText("SLIDES", bare, "S1")).toBeNull();
    expect(setItemText("SLIDES", bare, "S1", "x")).toBeNull();
    expect(getItemText("SLIDES", bare, "S9")).toBeNull();
    const col = structuredClone(bare);
    col.slides[0].columns = [{ heading: "h", points: ["p1"] }];
    expect(getItemText("SLIDES", col, "S1")).toBe("p1");
    const st = structuredClone(bare);
    st.slides[0].steps = [{ title: "t", detail: "d1" }];
    expect(getItemText("SLIDES", st, "S1")).toBe("d1");
    expect((setItemText("SLIDES", st, "S1", "z") as SlidesContent).slides[0].steps?.[0].detail).toBe("z");
  });
});

describe("demo change request on slides", () => {
  it("simplifies bullets, definitions and takeaways", async () => {
    const d = await deck();
    const out = await demo.changeRequest(ctx(), "SLIDES", d, "make it simpler");
    expect(SlidesContentSchema.safeParse(out.content).success).toBe(true);
  });
});
