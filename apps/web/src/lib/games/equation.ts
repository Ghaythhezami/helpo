import { shuffleSeeded } from "./shuffle";

const OPERATOR = /^(\+|=|=>|->|-->|→|⟶)$/;
const ARROW = /^(=|=>|->|-->|→|⟶)$/;

export type EquationPart =
  | { kind: "slot"; slot: number; group: number }
  | { kind: "op"; text: string; arrow: boolean };

export interface EquationModel {
  /** The non-operator tiles in the correct order. */
  terms: string[];
  /** Which group (side of an arrow) each term belongs to. Terms inside a group can swap places. */
  groupOf: number[];
  parts: EquationPart[];
}

/** Turns ["carbon dioxide","+","water","->","glucose","+","oxygen"] into slots, operators and groups. */
export function parseEquation(tiles: string[]): EquationModel {
  const terms: string[] = [];
  const groupOf: number[] = [];
  const parts: EquationPart[] = [];
  let group = 0;
  for (const raw of tiles) {
    const tile = raw.trim();
    if (!tile) continue;
    if (OPERATOR.test(tile)) {
      const arrow = ARROW.test(tile);
      if (arrow) group++;
      parts.push({ kind: "op", text: arrow ? "→" : tile, arrow });
    } else {
      parts.push({ kind: "slot", slot: terms.length, group });
      terms.push(tile);
      groupOf.push(group);
    }
  }
  return { terms, groupOf, parts };
}

export type EquationMessage =
  | { kind: "start" }
  | { kind: "taken"; label: string }
  | { kind: "full" }
  | { kind: "incomplete" }
  | { kind: "wrong"; wrongSlots: number }
  | { kind: "correct"; retry: boolean };

export interface EquationState {
  model: EquationModel;
  /** Display order of the tile bank (term indexes, deterministic shuffle). */
  bankOrder: number[];
  /** slots[i] = term index placed in slot i, or null. */
  slots: (number | null)[];
  /** Per slot after a Check: true = fits, false = needs another tile, null = unchecked. */
  verdict: (boolean | null)[];
  checks: number;
  firstCheckCorrect: number | null;
  done: boolean;
  message: EquationMessage;
}

export type EquationAction =
  | { type: "tile"; term: number }
  | { type: "slot"; slot: number }
  | { type: "check" }
  | { type: "reset" };

export function initEquation(tiles: string[], seed = "equation"): EquationState {
  const model = parseEquation(tiles);
  return {
    model,
    bankOrder: shuffleSeeded(
      model.terms.map((_, i) => i),
      seed,
    ),
    slots: model.terms.map(() => null),
    verdict: model.terms.map(() => null),
    checks: 0,
    firstCheckCorrect: null,
    done: false,
    message: { kind: "start" },
  };
}

/** Slots that fit: a term is right when its text belongs to the same group as the slot (order inside a group is free). */
export function checkSlots(model: EquationModel, slots: (number | null)[]): boolean[] {
  const verdict = slots.map(() => false);
  const groups = new Set(model.groupOf);
  for (const g of groups) {
    const slotIdx = model.groupOf.map((x, i) => (x === g ? i : -1)).filter((i) => i >= 0);
    const remaining = slotIdx.map((i) => model.terms[i]);
    // First consume exact matches, then fall back to any unused term of the group.
    const used = new Set<number>();
    for (const i of slotIdx) {
      const term = slots[i];
      if (term === null) continue;
      const at = remaining.findIndex((t, k) => t === model.terms[term] && !used.has(k));
      if (at >= 0) {
        used.add(at);
        verdict[i] = true;
      }
    }
  }
  return verdict;
}

export function equationReducer(state: EquationState, action: EquationAction): EquationState {
  switch (action.type) {
    case "tile": {
      if (state.done) return state;
      const at = state.slots.indexOf(action.term);
      if (at >= 0) {
        const slots = [...state.slots];
        slots[at] = null;
        return { ...state, slots, verdict: state.verdict.map(() => null), message: { kind: "taken", label: state.model.terms[action.term] } };
      }
      const free = state.slots.indexOf(null);
      if (free < 0) return { ...state, message: { kind: "full" } };
      const slots = [...state.slots];
      slots[free] = action.term;
      return { ...state, slots, verdict: state.verdict.map(() => null), message: { kind: "start" } };
    }
    case "slot": {
      if (state.done || state.slots[action.slot] === null) return state;
      const label = state.model.terms[state.slots[action.slot] as number];
      const slots = [...state.slots];
      slots[action.slot] = null;
      return { ...state, slots, verdict: state.verdict.map(() => null), message: { kind: "taken", label } };
    }
    case "check": {
      if (state.done) return state;
      if (state.slots.includes(null)) return { ...state, message: { kind: "incomplete" } };
      const verdict = checkSlots(state.model, state.slots);
      const good = verdict.filter(Boolean).length;
      const firstCheckCorrect = state.firstCheckCorrect ?? good;
      if (good === verdict.length) {
        return { ...state, verdict, checks: state.checks + 1, firstCheckCorrect, done: true, message: { kind: "correct", retry: state.checks > 0 } };
      }
      return { ...state, verdict, checks: state.checks + 1, firstCheckCorrect, message: { kind: "wrong", wrongSlots: verdict.length - good } };
    }
    case "reset":
      return { ...state, slots: state.model.terms.map(() => null), verdict: state.model.terms.map(() => null), done: false, message: { kind: "start" } };
  }
}

export function equationResult(state: EquationState): { total: number; firstTryCorrect: number; retriedCorrect: number } {
  const total = state.model.terms.length;
  const first = Math.min(total, state.firstCheckCorrect ?? 0);
  return { total, firstTryCorrect: first, retriedCorrect: state.done ? total - first : 0 };
}

export function equationMessageText(message: EquationMessage): string {
  switch (message.kind) {
    case "start":
      return "Fill every slot, then press Check.";
    case "taken":
      return `${message.label} taken back.`;
    case "full":
      return "All slots are full. Tap a slot to take a tile back, or press Check.";
    case "incomplete":
      return "Fill every slot first.";
    case "wrong":
      return "Not yet, try another. The highlighted slots need a different tile.";
    case "correct":
      return `Correct.${message.retry ? " +5 XP for trying again." : " Great work."}`;
  }
}
