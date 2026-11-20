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
