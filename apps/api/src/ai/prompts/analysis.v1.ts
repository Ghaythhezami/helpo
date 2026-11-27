import { LIMITS } from "@helpo/shared";

export const version = "analysis.v1";

/** Spec section 6 rules for the single analysis call. */
export const instructions = (): string =>
  `Analyse the document ONCE and return the lesson blueprint. Rules: use only what the document says; never invent facts. ` +
  `title, subject, gradeLevel (e.g. "Grade 6"), language (ISO 639-1 code of the document), summary (120 to 200 words; if the document is thin, say so instead of inventing), standard (or null). ` +
  `${LIMITS.blueprint.objectivesMin} to ${LIMITS.blueprint.objectivesMax} objectives (codes O1, O2... with a Bloom level and a source page or null). ` +
  `${LIMITS.blueprint.conceptsMin} to ${LIMITS.blueprint.conceptsMax} keyConcepts (name, definition, sourcePage). At most ${LIMITS.blueprint.vocabularyMax} vocabulary entries (term, meaning). ` +
  `processes (ordered steps), relations (left/right pairs for matching), at most ${LIMITS.blueprint.misconceptionsMax} commonMisconceptions, an overall difficulty, and suggestedGameType (matching, sorting, memory, sequence, truefalse_rush or odd_one_out).`;

/** Prompt-only lessons (spec section 5): no document, so the blueprint comes from sound subject knowledge; the UI marks it AI-written. */
export const topicInstructions = (): string =>
  `There is no document: build the lesson blueprint from the teacher's topic using accurate, well-established knowledge suitable for the class grade. Never leave it empty. ` +
  `title: a short student-friendly lesson title (at most 60 characters, no "Lesson brief" or "Lesson on"). subject, gradeLevel (the class grade unless the teacher states another), language (ISO 639-1 of the output language), summary (120 to 200 words), standard (or null). ` +
  `${LIMITS.blueprint.objectivesMin} to ${LIMITS.blueprint.objectivesMax} objectives (codes O1, O2... with a Bloom level; sourcePage null). ` +
  `${LIMITS.blueprint.conceptsMin} to ${LIMITS.blueprint.conceptsMax} keyConcepts (name, definition, sourcePage null). 8 to ${LIMITS.blueprint.vocabularyMax} vocabulary entries (term, meaning). ` +
  `At least one process with 4 or more ordered steps, at least 6 relations (left/right pairs for matching), 2 to ${LIMITS.blueprint.misconceptionsMax} commonMisconceptions, an overall difficulty, and suggestedGameType (matching, sorting, memory, sequence, truefalse_rush or odd_one_out). ` +
  `Do not include anything about the tool, the brief or open questions for the teacher.`;

export const chunkInstructions = (): string =>
  "This is ONE part of a long document. Return a mini-blueprint of only this part, same shape, using only this part's text. Counts may be smaller.";

export const reduceInstructions = (): string =>
  "You get several mini-blueprints of consecutive parts of one document. Merge them into ONE final blueprint that follows the normal rules. Remove duplicates, keep the most important concepts, keep source pages.";
