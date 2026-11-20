import { XP_RULES, type BadgeKey, type GameKind, type Question } from "@helpo/shared";
import { correctIndex, normalizeText, shuffle } from "../ai/content";

export interface Grade {
  correct: boolean;
  partial: boolean;
}

export interface AnswerInput {
  optionIndex?: number;
  text?: string;
  pairs?: { left: string; right: string }[];
}

/**
 * Normalization for typed answers: lower case, no accents or Arabic diacritics, Arabic letter variants folded
 * (alef forms, ya, ta marbuta), punctuation removed, leading articles dropped, single spaces.
 */
export function normalizeAnswer(s: string): string {
  return normalizeText(
    s
      .normalize("NFKD")
      .replace(/[̀-ًͯ-ٰٟـ]/g, "")
      .replace(/[إأآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه"),
  )
    .replace(/^(the|a|an)\s+/, "")
    .replace(/^ال(?=\p{L}{3,})/u, "");
}

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "is", "are", "it", "they", "that", "for", "with", "by", "on", "as"]);
const keywords = (s: string) => normalizeAnswer(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w));

/** Server-side grading. Returns null when the submission does not fit the question type. */
export function gradeAnswer(question: Question, input: AnswerInput): Grade | null {
  if (question.type === "short") {
    const text = input.text?.trim();
    if (!text) return null;
    const given = normalizeAnswer(text);
    const accepted = question.acceptedAnswers ?? [];
    if (accepted.some((a) => normalizeAnswer(a) === given)) return { correct: true, partial: false };
    if (accepted.length === 0) return { correct: false, partial: true }; // open question: effort counts
    const have = new Set(keywords(text));
    const best = Math.max(
      ...accepted.map((a) => {
        const want = [...new Set(keywords(a))];
        return want.length ? want.filter((w) => have.has(w)).length / want.length : 0;
      }),
    );
    return { correct: best >= 0.8, partial: best >= 0.3 && best < 0.8 };
  }
  if (question.type === "matching") {
    const want = question.pairs ?? [];
    if (!input.pairs?.length || want.length === 0) return null;
    const right = new Map(want.map((p) => [normalizeAnswer(p.left), normalizeAnswer(p.right)]));
    const ok = input.pairs.filter((p) => right.get(normalizeAnswer(p.left)) === normalizeAnswer(p.right)).length;
    return { correct: ok === want.length && input.pairs.length === want.length, partial: ok > 0 && ok < want.length };
  }
  const i = input.optionIndex;
  const options = question.options ?? [];
  if (i === undefined || !Number.isInteger(i) || i < 0 || i >= options.length) return null;
  return { correct: options[i].correct, partial: false };
}

/** What a student may see of a question: no correct flags, no accepted answers, matching columns shuffled. */
export interface StudentQuestion {
  id: string;
  type: Question["type"];
  prompt: string;
  options: string[] | null;
  matching: { lefts: string[]; rights: string[] } | null;
  timeLimitSec: number;
}

export function stripForStudent(q: Question, rng: () => number = Math.random): StudentQuestion {
  return {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    options: q.options?.map((o) => o.text) ?? null,
    matching: q.pairs ? { lefts: q.pairs.map((p) => p.left), rights: shuffle(q.pairs.map((p) => p.right), rng) } : null,
    timeLimitSec: q.timeLimitSec,
  };
}

/** The type names of the student-facing contract (StudentQuizState). Matching is only played in self-paced quizzes. */
export function studentType(q: Question): "mcq" | "true_false" | "short" {
  return q.type === "tf" ? "true_false" : q.type === "mcq" ? "mcq" : "short";
}

export { correctIndex };

/** XP for a first submission. */
export function firstAnswerXp(grade: Grade): number {
  return grade.correct ? XP_RULES.answerCorrectFirstTry : XP_RULES.answerAttempt;
}

/** Retry: only a fix of a wrong answer earns the retry amount, and the total per question never exceeds the cap. */
export function retryXpDelta(alreadyAwarded: number, nowCorrect: boolean): number {
  if (!nowCorrect) return 0;
  return Math.max(0, Math.min(XP_RULES.answerCorrectAfterRetry, XP_RULES.maxPerQuizQuestion) - alreadyAwarded);
}

export const DAILY_GAME_XP_CAP = 400;
export const NEVER_GIVES_UP_AT = 5;

export function badgeForGame(game: GameKind, stars: number): BadgeKey | null {
  return game === "MATCH" && stars === 3 ? "PLANT_SCOUT" : null;
}

export function neverGivesUpEarned(retriedAnswers: number, retriedGames: number): boolean {
  return retriedAnswers + retriedGames >= NEVER_GIVES_UP_AT;
}

export const AVATAR_UNLOCKS: Record<string, number> = { scarf: 1, hat: 2, glasses: 3, backpack: 4, lavender: 1, meadow: 2, sky: 3 };

export function unlockedAvatar(level: number): string[] {
  return Object.entries(AVATAR_UNLOCKS).filter(([, at]) => level >= at).map(([k]) => k);
}
