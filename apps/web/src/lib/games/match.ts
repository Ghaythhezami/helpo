import { shuffleSeeded } from "./shuffle";

export interface MatchPair {
  left: string;
  right: string;
}

export const MATCH_ROUND_SIZE = 4;

export type MatchMessage =
  | { kind: "start" }
  | { kind: "picked"; label: string }
  | { kind: "need-left" }
  | { kind: "match"; left: string; right: string; xp: number; retry: boolean; combo: number }
  | { kind: "miss" }
  | { kind: "hint"; left: string; right: string }
  | { kind: "round-done"; round: number }
  | { kind: "finished" };

export interface MatchState {
  pairs: MatchPair[];
  seed: string;
  /** Pair indexes per round, in left-column order. */
  rounds: number[][];
  /** Pair indexes per round, in right-column (shuffled) order. */
  rightOrder: number[][];
  round: number;
  selected: number | null;
  matched: number[];
  /** Left indexes that had at least one wrong try. */
  missed: number[];
  firstTry: number;
  retried: number;
  combo: number;
  bestCombo: number;
  xp: number;
  hint: number | null;
  roundDone: boolean;
  finished: boolean;
  message: MatchMessage;
}

export type MatchAction =
  | { type: "selectLeft"; index: number }
  | { type: "selectRight"; index: number }
  | { type: "hint" }
  | { type: "nextRound" };

export function initMatch(pairs: MatchPair[], seed = "match", roundSize = MATCH_ROUND_SIZE): MatchState {
  const rounds: number[][] = [];
  for (let i = 0; i < pairs.length; i += roundSize) {
    rounds.push(pairs.slice(i, i + roundSize).map((_, k) => i + k));
  }
  // A last round of one pair is folded into the previous round so every round is a real choice.
  if (rounds.length > 1 && rounds[rounds.length - 1].length === 1) {
    const last = rounds.pop() as number[];
    rounds[rounds.length - 1].push(...last);
  }
  const rightOrder = rounds.map((r, i) => shuffleSeeded(r, `${seed}:${i}`));
  return {
    pairs,
    seed,
    rounds,
    rightOrder,
    round: 0,
    selected: null,
    matched: [],
    missed: [],
    firstTry: 0,
    retried: 0,
    combo: 0,
    bestCombo: 0,
    xp: 0,
    hint: null,
    roundDone: false,
    finished: false,
    message: { kind: "start" },
  };
}

export function matchRoundCount(state: MatchState): number {
  return state.rounds.length;
}

export function matchProgress(state: MatchState): { done: number; total: number } {
  return { done: state.matched.length, total: state.pairs.length };
}

export function matchReducer(state: MatchState, action: MatchAction): MatchState {
  if (state.finished && action.type !== "nextRound") return state;
  switch (action.type) {
    case "selectLeft": {
      if (state.roundDone || state.matched.includes(action.index)) return state;
      if (!state.rounds[state.round]?.includes(action.index)) return state;
      const selected = state.selected === action.index ? null : action.index;
      return {
        ...state,
        selected,
        hint: null,
        message: selected === null ? { kind: "start" } : { kind: "picked", label: state.pairs[selected].left },
      };
    }
    case "selectRight": {
      if (state.roundDone || state.matched.includes(action.index)) return state;
      if (!state.rounds[state.round]?.includes(action.index)) return state;
      if (state.selected === null) return { ...state, hint: null, message: { kind: "need-left" } };
      if (state.selected !== action.index) {
        return {
          ...state,
          selected: null,
          hint: null,
          combo: 0,
          missed: state.missed.includes(state.selected) ? state.missed : [...state.missed, state.selected],
          message: { kind: "miss" },
        };
      }
      const retry = state.missed.includes(action.index);
      const xp = retry ? 5 : 10;
      const matched = [...state.matched, action.index];
      const combo = state.combo + 1;
      const roundComplete = state.rounds[state.round].every((i) => matched.includes(i));
      const finished = roundComplete && state.round === state.rounds.length - 1;
      return {
        ...state,
        matched,
        selected: null,
        hint: null,
        firstTry: state.firstTry + (retry ? 0 : 1),
        retried: state.retried + (retry ? 1 : 0),
        combo,
        bestCombo: Math.max(state.bestCombo, combo),
        xp: state.xp + xp,
        roundDone: roundComplete,
        finished,
        message: finished
          ? { kind: "finished" }
          : roundComplete
            ? { kind: "round-done", round: state.round + 1 }
            : { kind: "match", left: state.pairs[action.index].left, right: state.pairs[action.index].right, xp, retry, combo },
      };
    }
    case "hint": {
      if (state.roundDone) return state;
      const next = state.rounds[state.round].find((i) => !state.matched.includes(i));
      if (next === undefined) return state;
      return {
        ...state,
        hint: next,
        selected: null,
        message: { kind: "hint", left: state.pairs[next].left, right: state.pairs[next].right },
      };
    }
    case "nextRound": {
      if (!state.roundDone || state.finished || state.round >= state.rounds.length - 1) return state;
      return { ...state, round: state.round + 1, roundDone: false, selected: null, hint: null, message: { kind: "start" } };
    }
  }
}

export function matchResult(state: MatchState): { total: number; firstTryCorrect: number; retriedCorrect: number } {
  return { total: state.pairs.length, firstTryCorrect: state.firstTry, retriedCorrect: state.retried };
}

/** Plain-text status line for the aria-live region. */
export function matchMessageText(message: MatchMessage): string {
  switch (message.kind) {
    case "start":
      return "Pick an item on the left.";
    case "picked":
      return `${message.label} selected. Now tap what it goes with.`;
    case "need-left":
      return "Pick an item on the left first.";
    case "match":
      return `Matched: ${message.left} and ${message.right.toLowerCase()}. +${message.xp} XP${message.retry ? " for trying again" : ""}.${message.combo >= 2 ? ` ${message.combo} in a row!` : ""}`;
    case "miss":
      return "Not yet, try another.";
    case "hint":
      return `Hint: ${message.left} goes with ${message.right.toLowerCase()}.`;
    case "round-done":
      return `Round ${message.round} complete.`;
    case "finished":
      return "All pairs matched. Great work.";
  }
}
