import { shuffleSeeded } from "./shuffle";
import type { GameResult } from "./result";

export interface SortItem {
  label: string;
  belongsInYes: boolean;
}

export type Basket = "yes" | "no";

export type SortMessage =
  | { kind: "start" }
  | { kind: "picked"; label: string }
  | { kind: "need-item" }
  | { kind: "placed"; label: string; basket: Basket; xp: number; retry: boolean }
  /** `basket` is the basket the item was tried in (the wrong one). */
  | { kind: "miss"; index: number; label: string; basket: Basket }
  | { kind: "hint"; label: string; basket: Basket }
  | { kind: "finished"; total: number };

export interface SortState {
  items: SortItem[];
  /** Display order of the bank (deterministic shuffle of item indexes). */
  order: number[];
  placed: Record<number, Basket>;
  selected: number | null;
  missed: number[];
  firstTry: number;
  retried: number;
  wrongTries: number;
  hintsUsed: number;
  hint: { index: number; basket: Basket } | null;
  xp: number;
  finished: boolean;
  message: SortMessage;
}

export type SortAction =
  | { type: "select"; index: number }
  | { type: "place"; basket: Basket; index?: number }
  | { type: "hint" };

export function initSort(items: SortItem[], seed = "sort"): SortState {
  return {
    items,
    order: shuffleSeeded(
      items.map((_, i) => i),
      seed,
    ),
    placed: {},
    selected: null,
    missed: [],
    firstTry: 0,
    retried: 0,
    wrongTries: 0,
    hintsUsed: 0,
    hint: null,
    xp: 0,
    finished: false,
    message: { kind: "start" },
  };
}

export function sortRemaining(state: SortState): number[] {
  return state.order.filter((i) => state.placed[i] === undefined);
}

export function sortReducer(state: SortState, action: SortAction): SortState {
  if (state.finished) return state;
  switch (action.type) {
    case "select": {
      if (state.placed[action.index] !== undefined || !state.items[action.index]) return state;
      const selected = state.selected === action.index ? null : action.index;
      return {
        ...state,
        selected,
        hint: null,
        message: selected === null ? { kind: "start" } : { kind: "picked", label: state.items[selected].label },
      };
    }
    case "place": {
      const index = action.index ?? state.selected;
      if (index === null || index === undefined) return { ...state, message: { kind: "need-item" } };
      const item = state.items[index];
      if (!item || state.placed[index] !== undefined) return state;
      const correct = item.belongsInYes === (action.basket === "yes");
      if (!correct) {
        return {
          ...state,
          selected: null,
          hint: null,
          wrongTries: state.wrongTries + 1,
          missed: state.missed.includes(index) ? state.missed : [...state.missed, index],
          message: { kind: "miss", index, label: item.label, basket: action.basket },
        };
      }
      const retry = state.missed.includes(index);
      const xp = retry ? 5 : 10;
      const placed = { ...state.placed, [index]: action.basket };
      const finished = Object.keys(placed).length === state.items.length;
      return {
        ...state,
        placed,
        selected: null,
        hint: null,
        firstTry: state.firstTry + (retry ? 0 : 1),
        retried: state.retried + (retry ? 1 : 0),
        xp: state.xp + xp,
        finished,
        message: finished
          ? { kind: "finished", total: state.items.length }
          : { kind: "placed", label: item.label, basket: action.basket, xp, retry },
      };
    }
    case "hint": {
      const index = state.selected ?? sortRemaining(state)[0];
      if (index === undefined) return state;
      const basket: Basket = state.items[index].belongsInYes ? "yes" : "no";
      return { ...state, hint: { index, basket }, hintsUsed: state.hintsUsed + 1, message: { kind: "hint", label: state.items[index].label, basket } };
    }
  }
}

export function sortResult(state: SortState): GameResult {
  return { total: state.items.length, firstTryCorrect: state.firstTry, retriedCorrect: state.retried, wrongTries: state.wrongTries, hintsUsed: state.hintsUsed };
}

export function sortMessageText(message: SortMessage, baskets: { yes: string; no: string }): string {
  switch (message.kind) {
    case "start":
      return "Pick an item to start.";
    case "picked":
      return `${message.label} selected. Now tap a basket.`;
    case "need-item":
      return "Pick an item first, then a basket.";
    case "placed":
      return `${message.label} placed in ${message.basket === "yes" ? baskets.yes : baskets.no}. +${message.xp} XP${message.retry ? " for trying again" : ""}.`;
    case "miss": {
      const right = message.basket === "yes" ? baskets.no : baskets.yes;
      const wrong = message.basket === "yes" ? baskets.yes : baskets.no;
      return `Not yet. ${message.label} goes in ${right}, because it does not match "${wrong}".`;
    }
    case "hint":
      return `Hint: ${message.label} goes in ${message.basket === "yes" ? baskets.yes : baskets.no}.`;
    case "finished":
      return `All ${message.total} items sorted. Great work.`;
  }
}
