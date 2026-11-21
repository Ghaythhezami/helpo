import { GAME_KINDS, playableTemplates, type Band, type GameContent, type GameKind, type PracticeQuiz, type PracticeResult, type QuizContent } from "@helpo/shared";
import type { SelfQuestion } from "@/components/student/question-body";
import { shuffleSeeded } from "./games/shuffle";
import type { SelfPacedAnswer } from "./self-paced";

/** What the quiz runner shows after the last question: from the server (practice) or computed locally (teacher preview). */
export interface QuizReview {
  questionId: string;
  correct: boolean;
  explanation: string;
  correctAnswer: string;
}
export interface QuizOutcome {
  score: number;
  correct: number;
  total: number;
  /** Null when no XP is earned (the teacher preview). */
  xp: number | null;
  review: QuizReview[];
}

export function outcomeFromPractice(result: PracticeResult): QuizOutcome {
  return { score: result.score, correct: result.correct, total: result.total, xp: result.xp, review: result.review };
}

/** Matching rights are shuffled with a fixed seed so the right column never lines up with the left one. */
function matchingOf(id: string, pairs: { left: string; right: string }[] | null) {
  return pairs && pairs.length > 0 ? { lefts: pairs.map((p) => p.left), rights: shuffleSeeded(pairs.map((p) => p.right), id) } : null;
}

export function practiceQuestions(quiz: PracticeQuiz): SelfQuestion[] {
  return quiz.questions.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, options: q.options, matching: q.type === "matching" ? matchingOf(q.id, q.pairs) : null }));
}

/** The teacher's own quiz, shaped like what a student sees. */
export function previewQuestions(content: QuizContent): SelfQuestion[] {
  return content.questions.map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    options: q.options ? q.options.map((o) => o.text) : null,
    matching: q.type === "matching" ? matchingOf(q.id, q.pairs) : null,
  }));
}

export const normalizeAnswer = (text: string): string =>
  text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

/** Grades a quiz in the browser. Only the teacher preview does this; students are always graded by the server. */
export function gradeLocally(content: QuizContent, answers: SelfPacedAnswer[]): QuizOutcome {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  const review = content.questions.map((q): QuizReview => {
    const a = byId.get(q.id);
    let correct = false;
    let correctAnswer = "";
    if (q.type === "short") {
      const accepted = (q.acceptedAnswers ?? []).map(normalizeAnswer).filter(Boolean);
      correct = Boolean(a?.text) && accepted.includes(normalizeAnswer(a?.text ?? ""));
      correctAnswer = (q.acceptedAnswers ?? []).join(" / ");
    } else if (q.type === "matching") {
      const pairs = q.pairs ?? [];
      correct = pairs.length > 0 && pairs.every((p) => a?.pairs?.some((x) => x.left === p.left && x.right === p.right));
      correctAnswer = pairs.map((p) => `${p.left} = ${p.right}`).join(", ");
    } else {
      const options = q.options ?? [];
      correct = a?.optionIndex !== undefined && options[a.optionIndex]?.correct === true;
      correctAnswer = options.filter((o) => o.correct).map((o) => o.text).join(" / ");
    }
    return { questionId: q.id, correct, explanation: q.explanation, correctAnswer };
  });
  const right = review.filter((r) => r.correct).length;
  return { score: review.length ? right / review.length : 0, correct: right, total: review.length, xp: null, review };
}

/** Every game template the lesson's content can feed, whatever the class band (a teacher previews them all). */
export function previewGames(content: GameContent | null | undefined): GameKind[] {
  if (!content) return [];
  const bands: Band[] = ["EXPLORER", "NAVIGATOR", "STUDIO"];
  const found = new Set(bands.flatMap((b) => playableTemplates({ ...content, statements: content.statements ?? [] }, b)));
  return GAME_KINDS.filter((k) => found.has(k));
}
