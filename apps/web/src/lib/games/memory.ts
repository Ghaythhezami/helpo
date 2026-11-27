import { shuffleSeeded } from "./shuffle";
import type { GameResult } from "./result";

export interface MemoryCard {
  id: number;
  pair: number;
  text: string;
}

export interface MemoryState {
  cards: MemoryCard[];
  pairCount: number;
  /** Currently face-up, not yet matched (0, 1 or 2 card ids). */
  flipped: number[];
  matched: number[]; // pair indexes
  /** Pairs where the player has flipped a wrong partner at least once. */
  missed: number[];
  attempts: number;
  wrongTries: number;
  hintsUsed: number;
  firstTry: number;
  retried: number;
  hint: number | null; // pair index
  /** True while two different cards are face-up and waiting to be turned back. */
  mismatch: boolean;
  finished: boolean;
}

export type MemoryAction = { type: "flip"; id: number } | { type: "resolve" } | { type: "hint" };

export const MEMORY_MAX_PAIRS = 8;

export function initMemory(pairs: { left: string; right: string }[], seed = "memory"): MemoryState {
  const used = pairs.slice(0, MEMORY_MAX_PAIRS);
  const base = used.flatMap((p, i) => [
    { pair: i, text: p.left },
    { pair: i, text: p.right },
  ]);
  const cards = shuffleSeeded(base, seed).map((c, id) => ({ id, ...c }));
  return { cards, pairCount: used.length, flipped: [], matched: [], missed: [], attempts: 0, wrongTries: 0, hintsUsed: 0, firstTry: 0, retried: 0, hint: null, mismatch: false, finished: false };
}

export function memoryReducer(state: MemoryState, action: MemoryAction): MemoryState {
  switch (action.type) {
    case "flip": {
      if (state.mismatch || state.finished) return state;
      const card = state.cards[action.id];
      if (!card || state.matched.includes(card.pair) || state.flipped.includes(card.id)) return state;
      const flipped = [...state.flipped, card.id];
      if (flipped.length < 2) return { ...state, flipped, hint: null };
      const [a, b] = flipped.map((id) => state.cards[id]);
      const attempts = state.attempts + 1;
      if (a.pair === b.pair) {
        const retry = state.missed.includes(a.pair);
        const matched = [...state.matched, a.pair];
        return {
          ...state,
          flipped: [],
          matched,
          attempts,
          hint: null,
          firstTry: state.firstTry + (retry ? 0 : 1),
          retried: state.retried + (retry ? 1 : 0),
          finished: matched.length === state.pairCount,
        };
      }
      const missed = [...new Set([...state.missed, a.pair, b.pair])];
      return { ...state, flipped, attempts, missed, wrongTries: state.wrongTries + 1, mismatch: true, hint: null };
    }
    case "resolve":
      return state.mismatch ? { ...state, flipped: [], mismatch: false } : state;
    case "hint": {
      if (state.finished) return state;
      const pair = state.cards.find((c) => !state.matched.includes(c.pair))?.pair ?? null;
      return { ...state, hint: pair, hintsUsed: state.hintsUsed + (pair === null ? 0 : 1) };
    }
  }
}

export function memoryResult(state: MemoryState): GameResult {
  return { total: state.pairCount, firstTryCorrect: state.firstTry, retriedCorrect: state.retried, wrongTries: state.wrongTries, hintsUsed: state.hintsUsed };
}
