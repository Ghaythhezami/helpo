import { LIMITS } from "@helpo/shared";

export const version = "quiz.v1";

/** 7.4 Quiz. `count` defaults to 10. */
export const instructions = (count: number = LIMITS.quiz.default, difficulty?: string): string =>
  `Create a quiz of ${count} questions with ids "Q1", "Q2"... Mix types: mcq (4 options, exactly ONE with correct true), tf (2 options True and False, exactly one correct), short (acceptedAnswers: 2 to 4 short accepted phrasings; options null) and matching (pairs of 3 to 5; options null). ` +
  `Every question has an explanation (shown after answering), a concept (the EXACT name of a blueprint keyConcept or vocabulary term), an objectiveCode, a difficulty (easy, medium or hard; ${difficulty ? `mostly ${difficulty}` : "a balanced mix"}) and timeLimitSec (15 to 60). ` +
  `Never give away the answer in the prompt. Wrong options must be plausible and may use the blueprint misconceptions.`;
