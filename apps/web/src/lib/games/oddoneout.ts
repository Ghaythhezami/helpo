import { shuffleSeeded } from "./shuffle";
import type { GameResult } from "./result";

export interface OddRoundContent {
  items: string[];
  oddIndex: number;
  explanation: string;
}

/** One round after the deterministic shuffle: `odd` is the position of the odd card in `items`. */
export interface OddRound {
  items: string[];
  odd: number;
  explanation: string;
}

/** A session never runs longer than this many rounds. */
export const ODD_MAX_ROUNDS = 8;
/** After this many wrong taps in a round the answer and its reason are shown. */
export const ODD_MAX_MISSES = 2;

export type OddMessage =
  | { kind: "start" }
  | { kind: "not-this"; label: string }
  | { kind: "found"; label: string; retry: boolean }
  | { kind: "revealed"; label: string }
  | { kind: "hint" }
  | { kind: "finished" };

export interface OddState {
  rounds: OddRound[];
  round: number;
  /** Positions tapped wrongly this round. */
  tapped: number[];
  /** Positions taken away by hints this round. */
  removed: number[];
  /** The student found the odd card. */
  found: boolean;
  /** The reason is on screen (found, or after the second wrong tap). */
  roundDone: boolean;
  firstTry: number;
  retried: number;
  wrongTries: number;
  hintsUsed: number;
  xp: number;
  finished: boolean;
  message: OddMessage;
}

export type OddAction = { type: "tap"; index: number } | { type: "hint" } | { type: "next" };

export function initOddOneOut(content: OddRoundContent[] | undefined, seed = "odd"): OddState {
  const valid = (content ?? []).filter((r) => r.items.length === 4 && r.oddIndex >= 0 && r.oddIndex < 4).slice(0, ODD_MAX_ROUNDS);
  const rounds = valid.map((r, i) => {
    const order = shuffleSeeded([0, 1, 2, 3], `${seed}:${i}`);
    return { items: order.map((k) => r.items[k]), odd: order.indexOf(r.oddIndex), explanation: r.explanation };
  });
  return {
    rounds,
    round: 0,
    tapped: [],
    removed: [],
    found: false,
    roundDone: false,
    firstTry: 0,
    retried: 0,
    wrongTries: 0,
    hintsUsed: 0,
    xp: 0,
    finished: rounds.length === 0,
    message: { kind: "start" },
  };
}

export function oddReducer(state: OddState, action: OddAction): OddState {
  if (state.finished) return state;
  const current = state.rounds[state.round];
  switch (action.type) {
    case "tap": {
      if (state.roundDone || action.index < 0 || action.index > 3) return state;
      if (state.tapped.includes(action.index) || state.removed.includes(action.index)) return state;
      const last = state.round === state.rounds.length - 1;
      if (action.index === current.odd) {
        const retry = state.tapped.length > 0;
        return {
          ...state,
          found: true,
          roundDone: true,
          firstTry: state.firstTry + (retry ? 0 : 1),
          retried: state.retried + (retry ? 1 : 0),
          xp: state.xp + (retry ? 5 : 10),
          finished: last,
          message: last ? { kind: "finished" } : { kind: "found", label: current.items[current.odd], retry },
        };
      }
      const tapped = [...state.tapped, action.index];
      const revealed = tapped.length >= ODD_MAX_MISSES;
      return {
        ...state,
        tapped,
        wrongTries: state.wrongTries + 1,
        roundDone: revealed,
        finished: revealed && last,
        message: revealed ? { kind: "revealed", label: current.items[current.odd] } : { kind: "not-this", label: current.items[action.index] },
      };
    }
    case "hint": {
      if (state.roundDone) return state;
      // Take away one card that fits (never the odd one, never one already out).
      const target = [0, 1, 2, 3].find((i) => i !== current.odd && !state.tapped.includes(i) && !state.removed.includes(i));
      if (target === undefined) return state;
      return { ...state, removed: [...state.removed, target], hintsUsed: state.hintsUsed + 1, message: { kind: "hint" } };
    }
    case "next": {
      if (!state.roundDone || state.round >= state.rounds.length - 1) return state;
      return { ...state, round: state.round + 1, tapped: [], removed: [], found: false, roundDone: false, message: { kind: "start" } };
    }
  }
}

export function oddResult(state: OddState): GameResult {
  return { total: state.rounds.length, firstTryCorrect: state.firstTry, retriedCorrect: state.retried, wrongTries: state.wrongTries, hintsUsed: state.hintsUsed };
}

/** Plain-text status line (used by tests and read-only views). */
export function oddMessageText(message: OddMessage): string {
  switch (message.kind) {
    case "start":
      return "Which card does not belong?";
    case "not-this":
      return `Not this one. ${message.label} fits with the others. Try another card.`;
    case "found":
      return `Yes, ${message.label} is the odd one out.`;
    case "revealed":
      return `The odd one out is ${message.label}.`;
    case "hint":
      return "Hint: one card that fits was taken away.";
    case "finished":
      return "All rounds done. Great thinking.";
  }
}
