import { LIMITS } from "@helpo/shared";

export const version = "cards.v1";

/** 7.1 Summary cards. */
export const instructions = (): string =>
  `Create ${LIMITS.cards.min} to ${LIMITS.cards.max} revision cards from the blueprint. One idea per card, no duplicates. ` +
  `front: at most ${LIMITS.cards.frontWords} words (a term or a question). back: at most ${LIMITS.cards.backWords} words, at the class reading level. ` +
  `tag is concept, vocabulary, process or fact. emoji is optional (or null). concept MUST be the exact name of a blueprint keyConcept or the exact term of a blueprint vocabulary entry. ` +
  `objectiveCode is one of the blueprint objectives.`;
