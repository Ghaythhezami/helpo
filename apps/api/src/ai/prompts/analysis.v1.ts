import { LIMITS } from "@helpo/shared";

export const version = "analysis.v1";

/** Spec section 6 rules for the single analysis call. */
export const instructions = (): string =>
  `Analyse the document ONCE and return the lesson blueprint. Rules: use only what the document says; never invent facts. ` +
  `title, subject, gradeLevel (e.g. "Grade 6"), language (ISO 639-1 code of the document), summary (120 to 200 words; if the document is thin, say so instead of inventing), standard (or null). ` +
  `${LIMITS.blueprint.objectivesMin} to ${LIMITS.blueprint.objectivesMax} objectives (codes O1, O2... with a Bloom level and a source page or null). ` +
  `${LIMITS.blueprint.conceptsMin} to ${LIMITS.blueprint.conceptsMax} keyConcepts (name, definition, sourcePage). At most ${LIMITS.blueprint.vocabularyMax} vocabulary entries (term, meaning). ` +
  `processes (ordered steps), relations (left/right pairs for matching), at most ${LIMITS.blueprint.misconceptionsMax} commonMisconceptions, an overall difficulty, and suggestedGameType (matching, sorting, memory, sequence or truefalse_rush).`;

export const chunkInstructions = (): string =>
  "This is ONE part of a long document. Return a mini-blueprint of only this part, same shape, using only this part's text. Counts may be smaller.";

export const reduceInstructions = (): string =>
  "You get several mini-blueprints of consecutive parts of one document. Merge them into ONE final blueprint that follows the normal rules. Remove duplicates, keep the most important concepts, keep source pages.";
