import { LIMITS } from "@helpo/shared";

export const version = "slides.v2";

/**
 * 7.3 Presentation, v2: a teaching arc with designed layouts. The AI picks a layout and fills that layout's fields;
 * it never positions anything. Every field is present or null (structured outputs).
 */
export const instructions = (): string =>
  [
    `Create a classroom slide deck of ${LIMITS.slides.min} to ${LIMITS.slides.max} slides (aim for 10 to 12). Set deckTitle first. Use ONLY facts from the lesson blueprint: add nothing new. Follow the curriculum line and the class reading band for terms, examples and difficulty.`,
    "",
    "Follow this teaching arc, in order:",
    "1. title: the lesson title, a short subtitle (grade and topic) and `question`: one hook question that makes students curious.",
    '2. bullets titled like "I can...": learning goals from the blueprint objectives, each bullet starting with "I can" in student-friendly words. Put the objective codes in objectiveCodes.',
    "3. Key concept slides (bullets): `keyIdea` (one bold line) plus 2 to 4 bullets and a concrete, everyday example for each concept.",
    "4. definition: for the most important vocabulary. `term`, `definition` (plain language) and `example` (one everyday example). Set title to the term.",
    "5. process: when the blueprint has ordered steps or a worked example. 2 to 6 `steps`, each with a short `title` and a `detail`.",
    "6. twoColumn: where two things are compared or contrasted. Exactly 2 `columns`, each with a `heading` and 2 to 4 `points`.",
    "7. quizBreak (at least one, ideally one in the middle and one near the end): a check for understanding. `question`, 3 or 4 `options`, `answerIndex` (zero-based index of the one correct option) and `keyIdea` as the one-line explanation. Put plausible wrong options from the blueprint misconceptions. The answer is hidden from students until the teacher reveals it.",
    "8. summary (the LAST slide): `takeaways` with exactly 3 key takeaways and `question`: one exit-ticket question students answer before leaving.",
    "",
    "Rules:",
    `- Plain language. At most ${LIMITS.slides.bullets} bullets per slide and at most ${LIMITS.slides.bulletWords} words per bullet. No sentence walls, no repeated bullets anywhere in the deck.`,
    "- Fields that a layout does not use must be null (bullets: an empty array). Do not fill unrelated fields.",
    "- speakerNotes for every slide: what to say, one question to ask the class, and one likely misconception to watch for (use the blueprint misconceptions where they fit).",
    "- emoji: one emoji that fits the slide. imagePrompt: a short idea for an illustration, or null.",
    "- objectiveCodes: only codes from the lesson objectives (O1, O2, ...). Every slide after the title lists the objective(s) it serves.",
    "- The first slide has layout title and the last has layout summary.",
  ].join("\n");
