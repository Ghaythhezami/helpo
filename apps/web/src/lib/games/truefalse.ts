import type { GameResult } from "./result";

export interface Statement {
  text: string;
  isTrue: boolean;
  explanation: string;
}

export interface TrueFalseState {
  statements: Statement[];
  index: number;
  /** Answer given for the current statement, null until answered. */
  answered: boolean | null;
  correct: number;
  wrongTries: number;
  hintsUsed: number;
  finished: boolean;
}

export type TrueFalseAction = { type: "answer"; value: boolean } | { type: "next" } | { type: "timeUp" };

export function initTrueFalse(statements: Statement[]): TrueFalseState {
  return { statements, index: 0, answered: null, correct: 0, wrongTries: 0, hintsUsed: 0, finished: statements.length === 0 };
}

export function trueFalseReducer(state: TrueFalseState, action: TrueFalseAction): TrueFalseState {
  if (state.finished) return state;
  switch (action.type) {
    case "answer": {
      if (state.answered !== null) return state;
      const right = state.statements[state.index].isTrue === action.value;
      return { ...state, answered: action.value, correct: state.correct + (right ? 1 : 0), wrongTries: state.wrongTries + (right ? 0 : 1) };
    }
    case "next": {
      if (state.answered === null) return state;
      const index = state.index + 1;
      return index >= state.statements.length ? { ...state, finished: true } : { ...state, index, answered: null };
    }
    case "timeUp":
      return { ...state, finished: true };
  }
}

export function trueFalseResult(state: TrueFalseState): GameResult {
  return { total: Math.max(1, state.statements.length), firstTryCorrect: state.correct, retriedCorrect: 0, wrongTries: state.wrongTries, hintsUsed: state.hintsUsed };
}
