import type { ZodType } from "zod";
import {
  CardsContentSchema,
  GameContentSchema,
  LIMITS,
  QuizContentSchema,
  SlidesContentSchema,
  WorksheetContentSchema,
  type Blueprint,
  type CardsContent,
  type GameContent,
  type QuizContent,
  type ResourceKind,
  type SlidesContent,
  type WorksheetContent,
} from "@helpo/shared";

export type ResourceContent = SlidesContent | WorksheetContent | QuizContent | GameContent | CardsContent;

export const CONTENT_SCHEMAS: Record<ResourceKind, ZodType<ResourceContent>> = {
  SLIDES: SlidesContentSchema,
  WORKSHEET: WorksheetContentSchema,
  QUIZ: QuizContentSchema,
  GAME: GameContentSchema,
  CARDS: CardsContentSchema,
};

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Lower-case, no punctuation, single spaces: the key for duplicate and grounding comparisons. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Worksheet items are addressed as A1, A2... across all sections. */
export function worksheetItems(w: WorksheetContent) {
  return w.sections.flatMap((s) => s.items);
}

/** Business rules the structured-output subset cannot express. Returns problems; empty means fine. */
export function contentProblems(kind: ResourceKind, content: ResourceContent, opts: { quizCount?: number } = {}): string[] {
  const out: string[] = [];
  switch (kind) {
    case "SLIDES": {
      const s = (content as SlidesContent).slides;
      if (s.length < LIMITS.slides.min || s.length > LIMITS.slides.max) out.push(`Expected ${LIMITS.slides.min} to ${LIMITS.slides.max} slides, got ${s.length}.`);
      s.forEach((x, i) => {
        if (!x.title.trim()) out.push(`Slide ${i + 1} has no title.`);
        if (x.bullets.length > LIMITS.slides.bullets) out.push(`Slide ${i + 1} has more than ${LIMITS.slides.bullets} bullets.`);
        if (x.bullets.some((b) => words(b) > LIMITS.slides.bulletWords + 6)) out.push(`Slide ${i + 1} has a bullet that is too long.`);
      });
      break;
    }
    case "WORKSHEET": {
      const w = content as WorksheetContent;
      const items = worksheetItems(w);
      if (w.sections.length < 2) out.push("Expected at least 2 sections.");
      if (items.length < 6) out.push(`Expected at least 6 items, got ${items.length}.`);
      items.forEach((it, i) => {
        if (!it.prompt.trim() || !it.answer.trim()) out.push(`Item ${i + 1} needs a prompt and an answer.`);
      });
      w.sections.forEach((s, i) => {
        if (s.type === "mcq" && s.items.some((it) => !it.options || it.options.length < 3)) out.push(`Section ${i + 1} (mcq) needs options on every item.`);
      });
      break;
    }
    case "QUIZ": {
      const qs = (content as QuizContent).questions;
      const want = opts.quizCount;
      if (qs.length < LIMITS.quiz.min || qs.length > LIMITS.quiz.max) out.push(`Expected ${LIMITS.quiz.min} to ${LIMITS.quiz.max} questions, got ${qs.length}.`);
      else if (want && Math.abs(qs.length - want) > 1) out.push(`Expected about ${want} questions, got ${qs.length}.`);
      qs.forEach((q) => {
        if (!q.prompt.trim()) out.push(`${q.id} has an empty prompt.`);
        if (q.type === "mcq" || q.type === "tf") {
          const n = q.options?.length ?? 0;
          const correct = q.options?.filter((o) => o.correct).length ?? 0;
          if (q.type === "mcq" && n < 3) out.push(`${q.id} (mcq) needs 4 options.`);
          if (q.type === "tf" && n !== 2) out.push(`${q.id} (tf) needs exactly 2 options.`);
          if (correct !== 1) out.push(`${q.id} must have exactly one correct option, has ${correct}.`);
          if (q.options?.some((o) => !o.text.trim())) out.push(`${q.id} has an empty option.`);
        } else if (q.type === "short") {
          if (!q.acceptedAnswers?.length) out.push(`${q.id} (short) needs acceptedAnswers.`);
        } else if ((q.pairs?.length ?? 0) < 3) out.push(`${q.id} (matching) needs at least 3 pairs.`);
      });
      break;
    }
    case "GAME": {
      const g = content as GameContent;
      if (g.pairs.length < 6) out.push("Expected at least 6 pairs.");
      if (g.sortItems.length < 6) out.push("Expected at least 6 sort items.");
      if (g.equationTiles.length < 4) out.push("Expected at least 4 equation tiles.");
      if (g.statements.length < 6) out.push("Expected at least 6 true/false statements.");
      break;
    }
    case "CARDS": {
      const cs = (content as CardsContent).cards;
      if (cs.length < LIMITS.cards.min || cs.length > LIMITS.cards.max) out.push(`Expected ${LIMITS.cards.min} to ${LIMITS.cards.max} cards, got ${cs.length}.`);
      cs.forEach((c, i) => {
        if (!c.front.trim() || !c.back.trim()) out.push(`Card ${i + 1} is empty.`);
        if (words(c.front) > LIMITS.cards.frontWords + 4) out.push(`Card ${i + 1} front is too long.`);
        if (words(c.back) > LIMITS.cards.backWords + 10) out.push(`Card ${i + 1} back is too long.`);
      });
      break;
    }
  }
  return out;
}

/** Blueprint rules (spec section 5). */
export function blueprintProblems(b: Blueprint): string[] {
  const L = LIMITS.blueprint;
  const out: string[] = [];
  if (b.objectives.length < L.objectivesMin || b.objectives.length > L.objectivesMax) out.push(`Expected ${L.objectivesMin} to ${L.objectivesMax} objectives.`);
  if (b.keyConcepts.length < L.conceptsMin || b.keyConcepts.length > L.conceptsMax) out.push(`Expected ${L.conceptsMin} to ${L.conceptsMax} key concepts.`);
  if (b.vocabulary.length > L.vocabularyMax) out.push(`At most ${L.vocabularyMax} vocabulary terms.`);
  if (b.commonMisconceptions.length > L.misconceptionsMax) out.push(`At most ${L.misconceptionsMax} misconceptions.`);
  return out;
}

/* ------------------------------ grounding & duplicates ------------------------------ */

/** Names a generated item may legitimately be about. */
export function groundingSet(b: Blueprint): Set<string> {
  return new Set([...b.keyConcepts.map((c) => normalizeText(c.name)), ...b.vocabulary.map((v) => normalizeText(v.term))]);
}

const grounded = (concept: string, set: Set<string>) => {
  const n = normalizeText(concept);
  if (set.has(n)) return true;
  // tolerate "the stomata" vs "stomata": one contains the other
  for (const g of set) if (g && (n.includes(g) || g.includes(n)) && n.length > 2) return true;
  return false;
};

/** Drops quiz questions and cards whose `concept` is not in the blueprint. Returns the cleaned content and how many were dropped. */
export function dropUngrounded(kind: ResourceKind, content: ResourceContent, b: Blueprint): { content: ResourceContent; dropped: number } {
  const set = groundingSet(b);
  if (kind === "QUIZ") {
    const q = content as QuizContent;
    const kept = q.questions.filter((x) => grounded(x.concept, set));
    return { content: { questions: kept }, dropped: q.questions.length - kept.length };
  }
  if (kind === "CARDS") {
    const c = content as CardsContent;
    const kept = c.cards.filter((x) => grounded(x.concept, set));
    return { content: { cards: kept }, dropped: c.cards.length - kept.length };
  }
  return { content, dropped: 0 };
}

/** Removes duplicate questions and cards by normalized text (first one wins). */
export function dedupe(kind: ResourceKind, content: ResourceContent): { content: ResourceContent; removed: number } {
  if (kind === "QUIZ") {
    const seen = new Set<string>();
    const q = content as QuizContent;
    const kept = q.questions.filter((x) => {
      const k = normalizeText(x.prompt);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return { content: { questions: kept }, removed: q.questions.length - kept.length };
  }
  if (kind === "CARDS") {
    const seen = new Set<string>();
    const c = content as CardsContent;
    const kept = c.cards.filter((x) => {
      const k = normalizeText(x.front);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return { content: { cards: kept }, removed: c.cards.length - kept.length };
  }
  return { content, removed: 0 };
}

/** Script check: does the text look like the language the blueprint asked for? */
export function languageMatches(texts: string[], language: string): boolean {
  const joined = texts.join(" ");
  const arabic = (joined.match(/[؀-ۿ]/g) ?? []).length;
  const latin = (joined.match(/[A-Za-z]/g) ?? []).length;
  if (arabic + latin < 20) return true; // too little text to judge
  const ratio = arabic / (arabic + latin);
  return language.toLowerCase().startsWith("ar") ? ratio > 0.5 : ratio < 0.3;
}

/** Every human-readable string in a content object (used by the language check). */
export function collectTexts(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectTexts(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectTexts(v, out));
  return out;
}

/* --------------------------------- post-processing --------------------------------- */

/** Mulberry32, so tests (and the demo) can shuffle deterministically. */
export function seededRng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates that returns a new array. */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 } as const;

/**
 * Quiz post-processing: trim text, shuffle mcq options (tf keeps True/False order), keep exactly one correct option
 * (the first flagged one wins), order questions easy to hard and renumber the ids.
 */
export function postProcessQuiz(quiz: QuizContent, rng: () => number = Math.random): QuizContent {
  const questions = quiz.questions.map((q) => {
    let options = q.options?.map((o) => ({ text: o.text.trim(), correct: o.correct })) ?? null;
    if (options && (q.type === "mcq" || q.type === "tf")) {
      const first = options.findIndex((o) => o.correct);
      options = options.map((o, i) => ({ ...o, correct: i === (first < 0 ? 0 : first) }));
      if (q.type === "mcq") options = shuffle(options, rng);
    }
    return { ...q, prompt: q.prompt.trim(), explanation: q.explanation.trim(), options };
  });
  const sorted = questions
    .map((q, i) => ({ q, i }))
    .sort((a, b) => DIFFICULTY_ORDER[a.q.difficulty] - DIFFICULTY_ORDER[b.q.difficulty] || a.i - b.i)
    .map(({ q }, n) => ({ ...q, id: `Q${n + 1}` }));
  return { questions: sorted };
}

export function postProcessWorksheet(w: WorksheetContent): WorksheetContent {
  const total = worksheetItems(w).reduce((n, it) => n + it.points, 0);
  return { ...w, title: w.title.trim(), instructions: w.instructions.trim(), totalPoints: total };
}

export function postProcessSlides(s: SlidesContent): SlidesContent {
  return { ...s, slides: s.slides.map((x) => ({ ...x, title: x.title.trim(), bullets: x.bullets.slice(0, LIMITS.slides.bullets).map((b) => b.trim()) })) };
}

/** Index of the correct option of a question (mcq / tf), or null. */
export function correctIndex(q: { options: { correct: boolean }[] | null }): number | null {
  const i = q.options?.findIndex((o) => o.correct) ?? -1;
  return i < 0 ? null : i;
}

/* ---- item addressing: which text a check refers to ("Q4", "A5", "S3", "C2", "G1") ---- */

function indexOf(ref: string, prefix: string): number | null {
  const m = new RegExp(`^${prefix}(\\d+)$`, "i").exec(ref.trim());
  return m ? Number(m[1]) - 1 : null;
}

/** The single text a check can replace for each resource kind. */
export function getItemText(kind: ResourceKind, content: ResourceContent, ref: string): string | null {
  switch (kind) {
    case "QUIZ": {
      const qs = (content as QuizContent).questions;
      return (qs.find((x) => x.id.toLowerCase() === ref.toLowerCase()) ?? qs[indexOf(ref, "Q") ?? -1])?.prompt ?? null;
    }
    case "WORKSHEET":
      return worksheetItems(content as WorksheetContent)[indexOf(ref, "A") ?? -1]?.prompt ?? null;
    case "SLIDES":
      return (content as SlidesContent).slides[indexOf(ref, "S") ?? -1]?.bullets[0] ?? null;
    case "CARDS":
      return (content as CardsContent).cards[indexOf(ref, "C") ?? -1]?.front ?? null;
    case "GAME":
      return (content as GameContent).pairs[indexOf(ref, "G") ?? -1]?.right ?? null;
  }
}

/** Returns new content with the item's text replaced, or null when the item cannot be found. Never mutates. */
export function setItemText(kind: ResourceKind, content: ResourceContent, ref: string, text: string): ResourceContent | null {
  if (getItemText(kind, content, ref) === null) return null;
  const copy = structuredClone(content);
  switch (kind) {
    case "QUIZ": {
      const qs = (copy as QuizContent).questions;
      (qs.find((x) => x.id.toLowerCase() === ref.toLowerCase()) ?? qs[indexOf(ref, "Q") ?? -1]).prompt = text;
      break;
    }
    case "WORKSHEET":
      worksheetItems(copy as WorksheetContent)[indexOf(ref, "A") ?? -1].prompt = text;
      break;
    case "SLIDES":
      (copy as SlidesContent).slides[indexOf(ref, "S") ?? -1].bullets[0] = text;
      break;
    case "CARDS":
      (copy as CardsContent).cards[indexOf(ref, "C") ?? -1].front = text;
      break;
    case "GAME":
      (copy as GameContent).pairs[indexOf(ref, "G") ?? -1].right = text;
      break;
  }
  return copy;
}

/** Number of statements a teacher-facing review covers (used for the "traced" counter). */
export function countStatements(kind: ResourceKind, content: ResourceContent): number {
  switch (kind) {
    case "QUIZ":
      return (content as QuizContent).questions.length;
    case "WORKSHEET":
      return worksheetItems(content as WorksheetContent).length;
    case "SLIDES":
      return (content as SlidesContent).slides.length;
    case "CARDS":
      return (content as CardsContent).cards.length;
    case "GAME":
      return (content as GameContent).pairs.length;
  }
}
