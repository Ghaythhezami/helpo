import { playableTemplates, type CardsContent, type GameContent, type QuizContent, type ResourceKind, type WorksheetContent } from "@helpo/shared";
import { PROMPT_VERSIONS, taskFor } from "./prompts/index";
import type { AiProvider, GenerateOptions, GeneratedResource, LessonContext } from "./ai.provider";
import {
  blueprintProblems,
  collectTexts,
  contentProblems,
  dedupe,
  dropUngrounded,
  languageMatches,
  normalizeText,
  oddOneOutProblems,
  postProcessGame,
  postProcessQuiz,
  postProcessWorksheet,
  seededRng,
  shuffle,
  type ResourceContent,
} from "./content";
import { DemoAiProvider } from "./demo.provider";
import { AiOutputError, AiRefusalError } from "./errors";
import { MAX_ATTEMPTS, generateWithRepair } from "./generators";

const demo = new DemoAiProvider();
const ctx: LessonContext = { title: "Photosynthesis: how plants make food", grade: 6, band: "NAVIGATOR", locale: "en", language: "English", durationMin: 45, standard: null, objectives: [], sourceText: "" };
const quizOf = async () => (await demo.generateResource("QUIZ", ctx)).content as QuizContent;
const bp = async () => demo.analyze(ctx);

describe("validators", () => {
  it("quiz: exactly one correct option, option counts, accepted answers, matching pairs", async () => {
    const q = await quizOf();
    expect(contentProblems("QUIZ", q)).toEqual([]);
    const two = structuredClone(q);
    two.questions[0].options = two.questions[0].options!.map((o) => ({ ...o, correct: true }));
    expect(contentProblems("QUIZ", two).join(" ")).toMatch(/exactly one correct option, has 4/);
    const none = structuredClone(q);
    none.questions[1].options = none.questions[1].options!.map((o) => ({ ...o, correct: false }));
    expect(contentProblems("QUIZ", none).join(" ")).toMatch(/has 0/);
    const short = structuredClone(q);
    short.questions[9].acceptedAnswers = [];
    expect(contentProblems("QUIZ", short).join(" ")).toMatch(/needs acceptedAnswers/);
    const match = structuredClone(q);
    match.questions[2] = { ...match.questions[2], type: "matching", options: null, pairs: [{ left: "a", right: "b" }] };
    expect(contentProblems("QUIZ", match).join(" ")).toMatch(/at least 3 pairs/);
    expect(contentProblems("QUIZ", { questions: q.questions.slice(0, 3) }).join(" ")).toMatch(/5 to 20/);
    expect(contentProblems("QUIZ", q, { quizCount: 20 }).join(" ")).toMatch(/about 20/);
  });

  it("counts for slides, worksheet, cards and game", async () => {
    expect(contentProblems("SLIDES", { deckTitle: "t", slides: [] }).join(" ")).toMatch(/8 to 14/);
    expect(contentProblems("WORKSHEET", { title: "t", instructions: "i", sections: [], totalPoints: 0 }).join(" ")).toMatch(/at least 2 sections/);
    expect(contentProblems("CARDS", { cards: [] }).join(" ")).toMatch(/8 to 15/);
    const long = { cards: Array.from({ length: 8 }, (_, i) => ({ front: `word ${i} `.repeat(30), back: "b", emoji: null, tag: "fact" as const, concept: "c", objectiveCode: "O1" })) };
    expect(contentProblems("CARDS", long).join(" ")).toMatch(/too long/);
    expect(contentProblems("GAME", { type: "matching", title: "", instructions: "", timeLimitSec: null, pairs: [], gridSize: null, sortBaskets: { yes: "", no: "" }, sortItems: [], equationTiles: [], statements: [], oddOneOut: [] })).toHaveLength(5);
    const ws = (await demo.generateResource("WORKSHEET", ctx)).content as WorksheetContent;
    expect(contentProblems("WORKSHEET", ws)).toEqual([]);
  });

  it("blueprint limits", async () => {
    const b = await bp();
    expect(blueprintProblems(b)).toEqual([]);
    expect(blueprintProblems({ ...b, keyConcepts: [] }).join(" ")).toMatch(/key concepts/);
    expect(blueprintProblems({ ...b, objectives: [], commonMisconceptions: Array(6).fill("x") }).length).toBe(2);
  });
});

describe("grounding and duplicates", () => {
  it("drops quiz questions and cards whose concept is not in the blueprint", async () => {
    const b = await bp();
    const q = await quizOf();
    q.questions[0].concept = "Quantum chromodynamics";
    const out = dropUngrounded("QUIZ", q, b);
    expect(out.dropped).toBe(1);
    expect((out.content as QuizContent).questions).toHaveLength(9);
    const cards = (await demo.generateResource("CARDS", ctx)).content as CardsContent;
    cards.cards[2].concept = "Nonsense";
    expect(dropUngrounded("CARDS", cards, b).dropped).toBe(1);
    expect(dropUngrounded("SLIDES", { deckTitle: "", slides: [] }, b).dropped).toBe(0);
  });

  it("keeps a concept that only differs by an article", async () => {
    const b = await bp();
    const q = await quizOf();
    q.questions[0].concept = `the ${b.keyConcepts[0].name}`;
    expect(dropUngrounded("QUIZ", q, b).dropped).toBe(0);
  });

  it("removes duplicate questions and cards by normalized text", async () => {
    const q = await quizOf();
    q.questions.push({ ...q.questions[0], id: "Q11", prompt: `  ${q.questions[0].prompt.toUpperCase()}!! ` });
    const out = dedupe("QUIZ", q);
    expect(out.removed).toBe(1);
    const cards = (await demo.generateResource("CARDS", ctx)).content as CardsContent;
    cards.cards.push({ ...cards.cards[0], front: `${cards.cards[0].front}.` });
    expect(dedupe("CARDS", cards).removed).toBe(1);
    expect(dedupe("GAME", cards).removed).toBe(0);
    expect(normalizeText("  Hello,   WORLD! ")).toBe("hello world");
  });

  it("language check by script ratio", () => {
    expect(languageMatches(["This is a long enough English sentence for the check."], "en")).toBe(true);
    expect(languageMatches(["This is a long enough English sentence for the check."], "ar")).toBe(false);
    expect(languageMatches(["هذه جملة عربية طويلة بما يكفي للتحقق من اللغة المطلوبة"], "ar")).toBe(true);
    expect(languageMatches(["hi"], "ar")).toBe(true);
    expect(collectTexts({ a: ["x", { b: "y" }], n: 1 })).toEqual(["x", "y"]);
  });
});

describe("post-processing", () => {
  it("shuffles mcq options but the right answer stays right", async () => {
    const q = await quizOf();
    const before = q.questions[0].options!.find((o) => o.correct)!.text;
    const out = postProcessQuiz(q, seededRng(7));
    const mcq = out.questions.find((x) => x.prompt === q.questions[0].prompt)!;
    expect(mcq.options!.filter((o) => o.correct)).toHaveLength(1);
    expect(mcq.options!.find((o) => o.correct)!.text).toBe(before);
    expect(new Set(mcq.options!.map((o) => o.text))).toEqual(new Set(q.questions[0].options!.map((o) => o.text)));
    expect(contentProblems("QUIZ", out)).toEqual([]);
  });

  it("tf options keep their True/False order, one correct is enforced and the first flag wins", async () => {
    const q = await quizOf();
    const tf = q.questions.find((x) => x.type === "tf")!;
    tf.options = tf.options!.map((o) => ({ ...o, correct: true }));
    const out = postProcessQuiz(q, seededRng(1));
    const same = out.questions.find((x) => x.prompt === tf.prompt)!;
    expect(same.options!.map((o) => o.text)).toEqual(tf.options!.map((o) => o.text));
    expect(same.options!.filter((o) => o.correct)).toHaveLength(1);
    expect(same.options![0].correct).toBe(true);
  });

  it("orders easy to hard and renumbers ids; totals points on worksheets", async () => {
    const q = await quizOf();
    q.questions.reverse();
    const out = postProcessQuiz(q, seededRng(3));
    expect(out.questions.map((x) => x.id)).toEqual(Array.from({ length: 10 }, (_, i) => `Q${i + 1}`));
    const rank = { easy: 0, medium: 1, hard: 2 };
    expect(out.questions.every((x, i, a) => i === 0 || rank[a[i - 1].difficulty] <= rank[x.difficulty])).toBe(true);
    const ws = (await demo.generateResource("WORKSHEET", ctx)).content as WorksheetContent;
    expect(postProcessWorksheet({ ...ws, totalPoints: 0 }).totalPoints).toBe(ws.totalPoints);
  });

  it("shuffle returns a new array with the same members", () => {
    const a = [1, 2, 3, 4, 5, 6];
    const s = shuffle(a, seededRng(9));
    expect(s).not.toBe(a);
    expect([...s].sort()).toEqual(a);
  });
});

/** A provider whose generateResource is scripted. */
function scripted(steps: (kind: ResourceKind, o: GenerateOptions) => Promise<GeneratedResource> | GeneratedResource): { provider: AiProvider; calls: GenerateOptions[] } {
  const calls: GenerateOptions[] = [];
  const provider = Object.assign(Object.create(demo), {
    generateResource: jest.fn(async (kind: ResourceKind, _c: LessonContext, o: GenerateOptions = {}) => {
      calls.push(o);
      return steps(kind, o);
    }),
  }) as AiProvider;
  return { provider, calls };
}

const usage = (n: number) => ({ model: "m", promptVersion: "quiz.v1", tokensIn: n, tokensOut: n * 2 });

describe("repair loop", () => {
  it("returns on the first valid answer and reports tokens", async () => {
    const good = await quizOf();
    const { provider, calls } = scripted(() => ({ content: good, usage: usage(10) }));
    const out = await generateWithRepair(provider, "QUIZ", { ...ctx, blueprint: await bp() }, {}, { rng: seededRng(1) });
    expect(out.attempts).toBe(1);
    expect(out.usage).toMatchObject({ tokensIn: 10, tokensOut: 20, model: "m" });
    expect(calls).toHaveLength(1);
  });

  it("retries with the problems appended and the attempt number, then succeeds", async () => {
    const good = await quizOf();
    const bad = structuredClone(good);
    bad.questions[0].options = bad.questions[0].options!.map((o) => ({ ...o, correct: true }));
    // post-processing keeps the first flag, so break something it cannot repair: too few questions
    bad.questions = bad.questions.slice(0, 3);
    let n = 0;
    const { provider, calls } = scripted(() => ({ content: ++n === 1 ? bad : good, usage: usage(5) }));
    const out = await generateWithRepair(provider, "QUIZ", { ...ctx, blueprint: await bp() }, {}, { rng: seededRng(1) });
    expect(out.attempts).toBe(2);
    expect(calls[0]).toMatchObject({ attempt: 1, problems: [] });
    expect(calls[1].attempt).toBe(2);
    expect(calls[1].problems?.join(" ")).toMatch(/5 to 20/);
    expect(out.usage.tokensIn).toBe(10); // both attempts are counted
  });

  it("gives up after 3 attempts with a typed error that lists the problems", async () => {
    const bad = { questions: (await quizOf()).questions.slice(0, 2) };
    const { provider, calls } = scripted(() => ({ content: bad, usage: usage(1) }));
    await expect(generateWithRepair(provider, "QUIZ", ctx, {}, {})).rejects.toBeInstanceOf(AiOutputError);
    expect(calls).toHaveLength(MAX_ATTEMPTS);
  });

  it("a schema violation is repaired too", async () => {
    const good = await quizOf();
    let n = 0;
    const { provider, calls } = scripted(() => ({ content: (++n === 1 ? { nope: true } : good) as unknown as ResourceContent, usage: usage(1) }));
    const out = await generateWithRepair(provider, "QUIZ", ctx, {}, {});
    expect(out.attempts).toBe(2);
    expect(calls[1].problems?.length).toBeGreaterThan(0);
  });

  it("grounding drops ungrounded questions and regenerates when that leaves too few", async () => {
    const b = await bp();
    const good = await quizOf();
    const ungrounded = structuredClone(good);
    ungrounded.questions.forEach((q, i) => {
      if (i < 6) q.concept = "Totally unrelated";
    });
    let n = 0;
    const { provider } = scripted(() => ({ content: ++n === 1 ? ungrounded : good, usage: usage(1) }));
    const out = await generateWithRepair(provider, "QUIZ", { ...ctx, blueprint: b }, {}, { rng: seededRng(2) });
    expect(out.attempts).toBe(2);
    expect((out.content as QuizContent).questions).toHaveLength(10);
  });

  it("a wrong output language is retried", async () => {
    const good = await quizOf();
    const arabic = JSON.parse(JSON.stringify(good).replace(/"prompt":"[^"]*"/g, '"prompt":"سؤال عربي طويل بما يكفي للتحقق من اللغة المطلوبة هنا"').replace(/"explanation":"[^"]*"/g, '"explanation":"شرح عربي طويل بما يكفي للتحقق"'));
    let n = 0;
    const { provider } = scripted(() => ({ content: ++n === 1 ? arabic : good, usage: usage(1) }));
    const out = await generateWithRepair(provider, "QUIZ", { ...ctx, blueprint: await bp() }, {}, { rng: seededRng(2) });
    expect(out.attempts).toBe(2);
  });

  it("a provider error is retried (stronger model on later attempts), a refusal never", async () => {
    const good = await quizOf();
    let n = 0;
    const flaky = scripted(() => {
      if (++n === 1) throw new Error("rate limited");
      return { content: good, usage: usage(1) };
    });
    const out = await generateWithRepair(flaky.provider, "QUIZ", ctx, {}, {});
    expect(out.attempts).toBe(2);
    expect(flaky.calls[1].attempt).toBe(2);

    const refused = scripted(() => {
      throw new AiRefusalError({ category: "x" });
    });
    await expect(generateWithRepair(refused.provider, "QUIZ", ctx, {}, {})).rejects.toBeInstanceOf(AiRefusalError);
    expect(refused.calls).toHaveLength(1);
  });

  it("calls onAttempt before every attempt", async () => {
    const good = await quizOf();
    const seen: number[] = [];
    const { provider } = scripted(() => ({ content: good, usage: usage(1) }));
    await generateWithRepair(provider, "QUIZ", ctx, {}, { onAttempt: (a) => void seen.push(a) });
    expect(seen).toEqual([1]);
  });
});

describe("odd one out (game.v2)", () => {
  const round = (over: Record<string, unknown> = {}) => ({ items: ["Phishing", "Malware", "Firewall", "Sandwich"], oddIndex: 3, explanation: "A sandwich is not a security measure.", ...over });
  const game = async () => (await demo.generateResource("GAME", ctx)).content as GameContent;

  it("the game prompt is game.v2 and asks for 4 to 6 rounds of exactly 4 items", () => {
    expect(PROMPT_VERSIONS.GAME).toBe("game.v2");
    const text = taskFor("GAME", { suggestedGame: "matching" });
    expect(text).toMatch(/oddOneOut \(4 to 6 rounds/);
    expect(text).toMatch(/EXACTLY 4/);
    expect(text).toMatch(/oddIndex/);
    expect(text).toMatch(/blueprint/);
  });

  it("the demo game fills valid rounds that pass every rule", async () => {
    const g = await game();
    expect(g.oddOneOut.length).toBeGreaterThanOrEqual(4);
    expect(oddOneOutProblems(g)).toEqual([]);
    expect(contentProblems("GAME", g)).toEqual([]);
    expect(new Set(g.oddOneOut.map((r) => r.oddIndex)).size).toBeGreaterThan(1); // the odd item moves around
    expect(playableTemplates(g, "NAVIGATOR")).toContain("ODD_ONE_OUT");
  });

  it("validators: round count, exactly 4 items, oddIndex 0..3, no duplicates or blanks, an explanation", async () => {
    const g = await game();
    const make = (rounds: unknown[]) => ({ ...g, oddOneOut: rounds }) as GameContent;
    expect(oddOneOutProblems(make([round(), round(), round()])).join(" ")).toMatch(/4 to 6 odd-one-out rounds, got 3/);
    expect(oddOneOutProblems(make(Array.from({ length: 7 }, () => round()))).join(" ")).toMatch(/got 7/);
    const four = (r: unknown) => make([round(), round(), round(), r]);
    expect(oddOneOutProblems(four(round({ items: ["a", "b", "c"] }))).join(" ")).toMatch(/round 4 needs exactly 4 items, has 3/);
    expect(oddOneOutProblems(four(round({ items: ["a", "b", "c", "d", "e"] }))).join(" ")).toMatch(/exactly 4 items, has 5/);
    expect(oddOneOutProblems(four(round({ oddIndex: 4 }))).join(" ")).toMatch(/oddIndex between 0 and 3/);
    expect(oddOneOutProblems(four(round({ oddIndex: -1 }))).join(" ")).toMatch(/oddIndex/);
    expect(oddOneOutProblems(four(round({ oddIndex: 1.5 }))).join(" ")).toMatch(/oddIndex/);
    expect(oddOneOutProblems(four(round({ items: ["Malware", "malware!", "Firewall", "Sandwich"] }))).join(" ")).toMatch(/duplicate/);
    expect(oddOneOutProblems(four(round({ items: ["a", " ", "c", "d"] }))).join(" ")).toMatch(/empty item/);
    expect(oddOneOutProblems(four(round({ explanation: "  " }))).join(" ")).toMatch(/needs an explanation/);
    expect(oddOneOutProblems(four(round()))).toEqual([]);
    expect(oddOneOutProblems({ ...g, oddOneOut: undefined } as unknown as GameContent).join(" ")).toMatch(/got 0/); // older content without the field
  });

  it("post-processing keeps only playable rounds and at most 6", async () => {
    const g = await game();
    const out = postProcessGame({ ...g, oddOneOut: [round(), round({ items: ["a", "b", "c"] }), round({ oddIndex: 9 }), round({ items: ["x", "x", "y", "z"] }), ...Array.from({ length: 8 }, (_, i) => round({ items: [`a${i}`, `b${i}`, `c${i}`, `d${i}`] }))] });
    expect(out.oddOneOut).toHaveLength(6);
    expect(out.oddOneOut.every((r) => r.items.length === 4)).toBe(true);
    expect(postProcessGame({ ...g, oddOneOut: undefined } as unknown as GameContent).oddOneOut).toEqual([]);
  });

  it("the repair loop retries a game with a bad round and then accepts the fixed one", async () => {
    const good = await game();
    const bad = { ...good, oddOneOut: good.oddOneOut.slice(0, 2) };
    const calls: (string[] | undefined)[] = [];
    const provider: AiProvider = Object.assign(Object.create(demo), {
      generateResource: jest.fn(async (_k: ResourceKind, _c: LessonContext, o: GenerateOptions): Promise<GeneratedResource> => {
        calls.push(o.problems);
        return { content: calls.length === 1 ? bad : good, usage: { model: "m", promptVersion: "game.v2", tokensIn: 1, tokensOut: 1 } };
      }),
    });
    const out = await generateWithRepair(provider, "GAME", ctx);
    expect(out.attempts).toBe(2);
    expect(calls[1]?.join(" ")).toMatch(/odd-one-out rounds/);
  });
});
