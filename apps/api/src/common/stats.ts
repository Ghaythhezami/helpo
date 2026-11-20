import { studentScore, type AnswerRecord } from "@helpo/shared";

/** Mean score (0..1) across students who answered at least one question; null when nobody did. */
export function sessionAverage(answers: AnswerRecord[], questionCount: number): number | null {
  const ids = [...new Set(answers.map((a) => a.participantId))];
  if (ids.length === 0 || questionCount <= 0) return null;
  const total = ids.reduce((sum, id) => sum + studentScore(answers, id, questionCount), 0);
  return total / ids.length;
}

export function quizQuestionCount(content: unknown): number {
  const qs = (content as { questions?: unknown[] } | null)?.questions;
  return Array.isArray(qs) ? qs.length : 0;
}
