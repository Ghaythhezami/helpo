import type { PracticeQuiz, Question } from "@helpo/shared";
import { shuffle } from "../ai/content";

/** Practice XP: small on purpose. A correct answer earns 2, an honest attempt 1, and a lesson earns at most 20 a day. */
export const PRACTICE_XP_CORRECT = 2;
export const PRACTICE_XP_ATTEMPT = 1;
export const DAILY_PRACTICE_XP_CAP_PER_LESSON = 20;

/** The XpEvent reason of one lesson's practice, so the daily cap can be counted per lesson. Always starts with "practice". */
export const practiceReason = (lessonId: string) => `practice:${lessonId}`;

/** Small deterministic PRNG (mulberry32) seeded from a string, so a shuffle can be repeated by the server at grading time. */
export function seededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = Math.imul(h ^ (h >>> 16), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Presentation order of a multiple-choice question's options, as indexes into the stored options. Seeded by
 * student + lesson + question, so the order a student was shown is exactly the order the server grades against.
 * True/false keeps its natural order.
 */
export function optionOrder(q: Question, seed: string): number[] {
  const identity = (q.options ?? []).map((_, i) => i);
  return q.type === "mcq" ? shuffle(identity, seededRng(`${seed}:${q.id}`)) : identity;
}

/** Matching rows with the right-hand column shuffled so that no row shows its own answer (a pair is never left in place). */
export function scrambledPairs(q: Question, seed: string): { left: string; right: string }[] {
  const pairs = q.pairs ?? [];
  const rights = shuffle(pairs.map((p) => p.right), seededRng(`${seed}:${q.id}:pairs`));
  const n = rights.length;
  for (let i = 0; i < n && n > 1; i++) {
    if (rights[i] === pairs[i].right) {
      const j = (i + 1) % n;
      [rights[i], rights[j]] = [rights[j], rights[i]];
    }
  }
  return pairs.map((p, i) => ({ left: p.left, right: rights[i] }));
}

/** One question as the student may see it: no correct flags, no accepted answers, no explanation. */
export function toPracticeQuestion(q: Question, seed: string): PracticeQuiz["questions"][number] {
  const options = q.options ? optionOrder(q, seed).map((i) => (q.options as NonNullable<Question["options"]>)[i].text) : null;
  return { id: q.id, type: q.type, prompt: q.prompt, options, pairs: q.type === "matching" && q.pairs ? scrambledPairs(q, seed) : null, timeLimitSec: q.timeLimitSec };
}

/** The correct answer as readable text, for the review after submission. */
export function correctAnswerText(q: Question): string {
  if (q.type === "matching") return (q.pairs ?? []).map((p) => `${p.left} → ${p.right}`).join("; ");
  if (q.type === "short") return q.acceptedAnswers?.[0] ?? "";
  return q.options?.find((o) => o.correct)?.text ?? "";
}
