import { shuffleSeeded } from "./shuffle";
import type { GameResult } from "./result";

export interface MatchPair {
  left: string;
  right: string;
}

/** Rounds get harder: 3 pairs, then 4, then 5, then 5 each. */
export const MATCH_FIRST_ROUND = 3;
export const MATCH_MAX_ROUND = 5;

/** Round sizes for `n` pairs. A trailing single pair is folded into the previous round. */
export function matchRoundSizes(n: number): number[] {
  const sizes: number[] = [];
  let left = n;
  while (left > 0) {
    const size = Math.min(left, Math.min(MATCH_MAX_ROUND, MATCH_FIRST_ROUND + sizes.length));
    sizes.push(size);
    left -= size;
  }
  if (sizes.length > 1 && sizes[sizes.length - 1] === 1) {
    sizes.pop();
    sizes[sizes.length - 1] += 1;
  }
  return sizes;
}

export type MatchMessage =
  | { kind: "start" }
  | { kind: "picked"; label: string }
  | { kind: "need-left" }
  | { kind: "match"; left: string; right: string; xp: number; retry: boolean; combo: number }
  /** `right` is the partner the item really goes with; `again` is true from the second miss on the same item. */
  | { kind: "miss"; left: string; right: string; again: boolean }
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
  /** Wrong tries per left index. */
  missCount: Record<number, number>;
  wrongTries: number;
  hintsUsed: number;
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

export function initMatch(pairs: MatchPair[], seed = "match"): MatchState {
  const rounds: number[][] = [];
  let at = 0;
  for (const size of matchRoundSizes(pairs.length)) {
    rounds.push(Array.from({ length: size }, (_, k) => at + k));
    at += size;
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
    missCount: {},
    wrongTries: 0,
    hintsUsed: 0,
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
        const wrongFor = state.selected;
        const count = (state.missCount[wrongFor] ?? 0) + 1;
        return {
          ...state,
          selected: null,
          hint: null,
          combo: 0,
          wrongTries: state.wrongTries + 1,
          missCount: { ...state.missCount, [wrongFor]: count },
          missed: state.missed.includes(wrongFor) ? state.missed : [...state.missed, wrongFor],
          message: { kind: "miss", left: state.pairs[wrongFor].left, right: state.pairs[wrongFor].right, again: count >= 2 },
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
        hintsUsed: state.hintsUsed + 1,
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

export function matchResult(state: MatchState): GameResult {
  return { total: state.pairs.length, firstTryCorrect: state.firstTry, retriedCorrect: state.retried, wrongTries: state.wrongTries, hintsUsed: state.hintsUsed };
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
      return message.again ? `Not yet. ${message.left} goes with ${message.right.toLowerCase()}.` : `Not that one. Take another look at ${message.left}.`;
    case "hint":
      return `Hint: ${message.left} goes with ${message.right.toLowerCase()}.`;
    case "round-done":
      return `Round ${message.round} complete.`;
    case "finished":
      return "All pairs matched. Great work.";
  }
}
