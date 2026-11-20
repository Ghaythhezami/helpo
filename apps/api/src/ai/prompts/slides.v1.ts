import { LIMITS } from "@helpo/shared";

export const version = "slides.v1";

/** 7.3 Presentation: the AI picks a layout, never positions. */
export const instructions = (): string =>
  `Create a slide deck of ${LIMITS.slides.min} to ${LIMITS.slides.max} slides (aim for 10 to 12). deckTitle first. ` +
  `Each slide has a layout (title, bullets, twoColumn, definition, process, quizBreak or summary), a title, at most ${LIMITS.slides.bullets} bullets of at most ${LIMITS.slides.bulletWords} words, speakerNotes (2 to 3 sentences for the teacher), ` +
  `imagePrompt (an optional illustration idea, or null), emoji (or null) and objectiveCodes. Start with a title slide and end with a summary slide. Use process for ordered steps and quizBreak for a thinking question.`;
