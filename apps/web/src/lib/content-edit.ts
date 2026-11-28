import type { QuizContent, SlidesContent } from "@helpo/shared";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Replaces the first string value that contains `from` with the same string where `from` is swapped for `to`. */
export function replaceTextInContent<T>(content: T, from: string, to: string): { content: T; changed: boolean } {
  let changed = false;
  const walk = (node: Json): Json => {
    if (changed) return node;
    if (typeof node === "string") {
      if (node.includes(from)) {
        changed = true;
        return node.replace(from, () => to);
      }
      return node;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out: { [key: string]: Json } = {};
      for (const [k, v] of Object.entries(node)) out[k] = walk(v);
      return out;
    }
    return node;
  };
  const next = walk(content as unknown as Json) as unknown as T;
  return { content: next, changed };
}

export function updateSlide(content: SlidesContent, index: number, patch: Partial<SlidesContent["slides"][number]>): SlidesContent {
  return { ...content, slides: content.slides.map((s, i) => (i === index ? { ...s, ...patch } : s)) };
}

type Slide = SlidesContent["slides"][number];

/** Form state for the slide fields in the right margin (multi-line fields are plain text, one item per line). */
export interface SlideDraft {
  title: string;
  subtitle: string;
  question: string;
  keyIdea: string;
  bullets: string;
  columns: { heading: string; points: string }[];
  term: string;
  definition: string;
  example: string;
  steps: string;
  options: string;
  answerIndex: number | null;
  takeaways: string;
  speakerNotes: string;
}

export function slideDraft(s: Slide): SlideDraft {
  const col = (i: number) => ({ heading: s.columns?.[i]?.heading ?? "", points: (s.columns?.[i]?.points ?? []).join("\n") });
  return {
    title: s.title,
    subtitle: s.subtitle ?? "",
    question: s.question ?? "",
    keyIdea: s.keyIdea ?? "",
    bullets: s.bullets.join("\n"),
    columns: [col(0), col(1)],
    term: s.term ?? "",
    definition: s.definition ?? "",
    example: s.example ?? "",
    steps: (s.steps ?? []).map((x) => `${x.title} | ${x.detail}`).join("\n"),
    options: (s.options ?? []).join("\n"),
    answerIndex: s.answerIndex,
    takeaways: (s.takeaways ?? []).join("\n"),
    speakerNotes: s.speakerNotes,
  };
}

const orNull = (text: string): string | null => text.trim() || null;

/** Turns the form back into a slide patch for the slide's layout: trims, drops empty lines and keeps answerIndex inside the options. */
export function buildSlidePatch(s: Slide, d: SlideDraft): Partial<Slide> {
  const patch: Partial<Slide> = { title: d.title.trim() || s.title, speakerNotes: d.speakerNotes.trim() };
  switch (s.layout) {
    case "title":
      patch.subtitle = orNull(d.subtitle);
      patch.question = orNull(d.question);
      break;
    case "bullets":
      patch.keyIdea = orNull(d.keyIdea);
      patch.bullets = toLines(d.bullets);
      break;
    case "twoColumn": {
      patch.keyIdea = orNull(d.keyIdea);
      const cols = d.columns.map((c) => ({ heading: c.heading.trim(), points: toLines(c.points) }));
      patch.columns = !s.columns && cols.every((c) => !c.heading && c.points.length === 0) ? null : cols;
      break;
    }
    case "definition":
      patch.term = orNull(d.term);
      patch.definition = orNull(d.definition);
      patch.example = orNull(d.example);
      break;
    case "process": {
      const steps = toLines(d.steps).map((line) => {
        const cut = line.indexOf("|");
        return cut < 0 ? { title: line, detail: "" } : { title: line.slice(0, cut).trim(), detail: line.slice(cut + 1).trim() };
      });
      patch.steps = steps.length > 0 ? steps : null;
      break;
    }
    case "quizBreak": {
      const options = toLines(d.options);
      patch.question = orNull(d.question);
      patch.keyIdea = orNull(d.keyIdea);
      patch.options = options.length > 0 ? options : null;
      patch.answerIndex = d.answerIndex !== null && d.answerIndex >= 0 && d.answerIndex < options.length ? d.answerIndex : null;
      break;
    }
    case "summary":
      patch.takeaways = toLines(d.takeaways);
      patch.question = orNull(d.question);
      break;
  }
  return patch;
}

export function updateQuestion(content: QuizContent, index: number, patch: Partial<QuizContent["questions"][number]>): QuizContent {
  return { questions: content.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)) };
}

/** Lines in a textarea to a clean list of bullets. */
export function toLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function moveInArray<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function duplicateInArray<T>(items: T[], index: number): T[] {
  if (index < 0 || index >= items.length) return items;
  const next = [...items];
  next.splice(index + 1, 0, structuredClone(items[index]));
  return next;
}
