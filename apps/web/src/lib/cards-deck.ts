import { shuffleSeeded } from "@/lib/games/shuffle";

/** Pure state for the flip-card deck: a session-only "got it / review again" loop. No scores, no timers. */
export interface DeckState {
  /** Number of cards in the lesson. */
  total: number;
  /** Card indexes in display order for the current round. */
  order: number[];
  pos: number;
  flipped: boolean;
  /** Card indexes marked "got it" (they leave the loop). */
  got: number[];
  /** Card indexes marked "review again" in the current round. */
  review: number[];
  /** True once the last card of the round was marked. */
  done: boolean;
  /** Review rounds started so far (0 = first pass). */
  round: number;
  seed: string;
  shuffles: number;
}

export type DeckAction =
  | { type: "flip" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "goTo"; index: number }
  | { type: "mark"; as: "got" | "review" }
  | { type: "shuffle" }
  | { type: "restartReview" }
  | { type: "reset" };

export function initDeck(total: number, seed = "cards"): DeckState {
  const n = Math.max(0, Math.floor(total));
  return { total: n, order: Array.from({ length: n }, (_, i) => i), pos: 0, flipped: false, got: [], review: [], done: false, round: 0, seed, shuffles: 0 };
}

/** Cards still in the loop: everything not marked "got it", in lesson order. */
export function remainingCards(state: DeckState): number[] {
  return Array.from({ length: state.total }, (_, i) => i).filter((i) => !state.got.includes(i));
}

export function currentCard(state: DeckState): number | null {
  return state.done ? null : (state.order[state.pos] ?? null);
}

const go = (state: DeckState, pos: number): DeckState => {
  const next = Math.min(Math.max(pos, 0), Math.max(state.order.length - 1, 0));
  return next === state.pos ? state : { ...state, pos: next, flipped: false };
};

export function deckReducer(state: DeckState, action: DeckAction): DeckState {
  switch (action.type) {
    case "flip":
      return state.done || state.order.length === 0 ? state : { ...state, flipped: !state.flipped };
    case "next":
      return state.done ? state : go(state, state.pos + 1);
    case "prev":
      return state.done ? state : go(state, state.pos - 1);
    case "goTo":
      return { ...go({ ...state, done: false }, action.index), done: false };
    case "mark": {
      const card = currentCard(state);
      if (card === null || !state.flipped) return state;
      const got = state.got.filter((i) => i !== card);
      const review = state.review.filter((i) => i !== card);
      (action.as === "got" ? got : review).push(card);
      const last = state.pos >= state.order.length - 1;
      return { ...state, got, review, flipped: false, done: last, pos: last ? state.pos : state.pos + 1 };
    }
    case "shuffle": {
      const shuffles = state.shuffles + 1;
      return { ...state, order: shuffleSeeded(state.order, `${state.seed}:${shuffles}`), pos: 0, flipped: false, done: false, shuffles };
    }
    case "restartReview": {
      const order = remainingCards(state);
      if (order.length === 0) return state;
      return { ...state, order, pos: 0, flipped: false, done: false, review: [], round: state.round + 1 };
    }
    case "reset":
      return { ...initDeck(state.total, state.seed), shuffles: state.shuffles };
  }
}
