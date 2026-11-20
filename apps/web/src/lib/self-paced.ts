import type { PlaySubmitBody } from "@helpo/shared";
import type { z } from "zod";
import { api } from "./api";

export type SubmitBody = z.infer<typeof PlaySubmitBody>;
export type SelfPacedAnswer = SubmitBody["answers"][number];

/** Builds the body for POST /play/:code/submit: answers plus how long the student took (whole seconds). */
export function buildSubmitBody(answers: SelfPacedAnswer[], startedAt: number, now = Date.now()): SubmitBody {
  return { answers: answers.slice(0, 20), durationSec: Math.max(0, Math.min(4 * 3600, Math.round((now - startedAt) / 1000))) };
}

/** Self-paced quiz or assignment: the server scores it, the client only sends what the student chose. */
export function submitSelfPaced(code: string, answers: SelfPacedAnswer[], startedAt: number) {
  return api<{ score?: number }>(`/play/${encodeURIComponent(code)}/submit`, { method: "POST", body: buildSubmitBody(answers, startedAt) });
}
