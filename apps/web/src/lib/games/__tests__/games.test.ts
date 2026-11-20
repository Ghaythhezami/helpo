import { equationReducer, equationResult, initEquation, parseEquation } from "../equation";
import { initMatch, matchReducer, matchResult } from "../match";
import { initMemory, memoryReducer, memoryResult } from "../memory";
import { shuffleSeeded } from "../shuffle";
import { initSort, sortReducer, sortRemaining, sortResult } from "../sort";
import { initTrueFalse, trueFalseReducer, trueFalseResult } from "../truefalse";

const pairs = [
  { left: "Roots", right: "Take in water" },
  { left: "Leaf", right: "Makes food" },
  { left: "Stem", right: "Carries water" },
  { left: "Flower", right: "Makes seeds" },
  { left: "Seed", right: "New plant" },
  { left: "Sun", right: "Energy" },
];

describe("shuffleSeeded", () => {
  it("is deterministic and never the identity", () => {
    const items = [1, 2, 3, 4];
    expect(shuffleSeeded(items, "a")).toEqual(shuffleSeeded(items, "a"));
    expect(shuffleSeeded(items, "a")).not.toEqual(items);
    expect(shuffleSeeded([1, 2], "z")).toEqual([2, 1]);
  });
});

describe("match reducer", () => {
  it("scores first-try and retried pairs and finishes after the last round", () => {
    let s = initMatch(pairs, "t");
    expect(s.rounds).toHaveLength(2);
    // wrong first, then right
    s = matchReducer(s, { type: "selectLeft", index: 0 });
    s = matchReducer(s, { type: "selectRight", index: 1 });
    expect(s.message.kind).toBe("miss");
    expect(s.missed).toContain(0);
    s = matchReducer(s, { type: "selectLeft", index: 0 });
    s = matchReducer(s, { type: "selectRight", index: 0 });
    expect(s.retried).toBe(1);
    for (const i of [1, 2, 3]) {
      s = matchReducer(s, { type: "selectLeft", index: i });
      s = matchReducer(s, { type: "selectRight", index: i });
    }
    expect(s.roundDone).toBe(true);
    expect(s.finished).toBe(false);
    s = matchReducer(s, { type: "nextRound" });
    for (const i of [4, 5]) {
      s = matchReducer(s, { type: "selectLeft", index: i });
      s = matchReducer(s, { type: "selectRight", index: i });
    }
    expect(s.finished).toBe(true);
    expect(matchResult(s)).toEqual({ total: 6, firstTryCorrect: 5, retriedCorrect: 1 });
    expect(s.xp).toBe(5 * 10 + 5);
  });

  it("needs a left pick first and offers a hint", () => {
    let s = initMatch(pairs, "t");
    s = matchReducer(s, { type: "selectRight", index: 0 });
    expect(s.message.kind).toBe("need-left");
    s = matchReducer(s, { type: "hint" });
    expect(s.hint).toBe(0);
  });
});

describe("sort reducer", () => {
  const items = [
    { label: "Sunlight", belongsInYes: true },
    { label: "Candy", belongsInYes: false },
  ];
  it("accepts the right basket, rejects the wrong one without penalty", () => {
    let s = initSort(items, "s");
    s = sortReducer(s, { type: "place", basket: "yes" });
    expect(s.message.kind).toBe("need-item");
    s = sortReducer(s, { type: "place", basket: "no", index: 0 });
    expect(s.message.kind).toBe("miss");
    s = sortReducer(s, { type: "place", basket: "yes", index: 0 });
    s = sortReducer(s, { type: "place", basket: "no", index: 1 });
    expect(s.finished).toBe(true);
    expect(sortRemaining(s)).toEqual([]);
    expect(sortResult(s)).toEqual({ total: 2, firstTryCorrect: 1, retriedCorrect: 1 });
  });
});

describe("equation reducer", () => {
  const tiles = ["carbon dioxide", "+", "water", "->", "glucose", "+", "oxygen"];
  it("parses operators and groups", () => {
    const m = parseEquation(tiles);
    expect(m.terms).toEqual(["carbon dioxide", "water", "glucose", "oxygen"]);
    expect(m.groupOf).toEqual([0, 0, 1, 1]);
  });
  it("lets terms swap inside a side but not across the arrow", () => {
    let s = initEquation(tiles, "e");
    // swapped reactants, correct products
    for (const term of [1, 0, 2, 3]) s = equationReducer(s, { type: "tile", term });
    s = equationReducer(s, { type: "check" });
    expect(s.done).toBe(true);
    expect(equationResult(s)).toEqual({ total: 4, firstTryCorrect: 4, retriedCorrect: 0 });

    let w = initEquation(tiles, "e");
    for (const term of [2, 0, 1, 3]) w = equationReducer(w, { type: "tile", term });
    w = equationReducer(w, { type: "check" });
    expect(w.done).toBe(false);
    expect(w.verdict.filter((v) => v === false).length).toBeGreaterThan(0);
    w = equationReducer(w, { type: "reset" });
    for (const term of [0, 1, 2, 3]) w = equationReducer(w, { type: "tile", term });
    w = equationReducer(w, { type: "check" });
    expect(w.done).toBe(true);
    expect(equationResult(w).retriedCorrect).toBeGreaterThan(0);
  });
  it("asks to fill every slot first", () => {
    let s = initEquation(tiles, "e");
    s = equationReducer(s, { type: "check" });
    expect(s.message.kind).toBe("incomplete");
  });
});

describe("memory reducer", () => {
  it("matches pairs, hides a mismatch after resolve and counts retries", () => {
    let s = initMemory(pairs, "m");
    expect(s.cards).toHaveLength(12);
    const a = s.cards.find((c) => c.pair === 0)!;
    const wrong = s.cards.find((c) => c.pair === 1)!;
    s = memoryReducer(s, { type: "flip", id: a.id });
    s = memoryReducer(s, { type: "flip", id: wrong.id });
    expect(s.mismatch).toBe(true);
    s = memoryReducer(s, { type: "flip", id: s.cards[0].id });
    expect(s.flipped).toHaveLength(2);
    s = memoryReducer(s, { type: "resolve" });
    expect(s.flipped).toEqual([]);
    for (let p = 0; p < 6; p++) {
      const [x, y] = s.cards.filter((c) => c.pair === p);
      s = memoryReducer(s, { type: "flip", id: x.id });
      s = memoryReducer(s, { type: "flip", id: y.id });
    }
    expect(s.finished).toBe(true);
    const r = memoryResult(s);
    expect(r.total).toBe(6);
    expect(r.firstTryCorrect + r.retriedCorrect).toBe(6);
    expect(r.retriedCorrect).toBe(2);
  });
});

describe("true or false rush", () => {
  const statements = [
    { text: "A", isTrue: true, explanation: "e" },
    { text: "B", isTrue: false, explanation: "e" },
  ];
  it("counts correct answers, shows the explanation step, finishes", () => {
    let s = initTrueFalse(statements);
    s = trueFalseReducer(s, { type: "next" });
    expect(s.index).toBe(0);
    s = trueFalseReducer(s, { type: "answer", value: true });
    s = trueFalseReducer(s, { type: "answer", value: false });
    expect(s.correct).toBe(1);
    s = trueFalseReducer(s, { type: "next" });
    s = trueFalseReducer(s, { type: "answer", value: true });
    s = trueFalseReducer(s, { type: "next" });
    expect(s.finished).toBe(true);
    expect(trueFalseResult(s)).toEqual({ total: 2, firstTryCorrect: 1, retriedCorrect: 0 });
  });
  it("ends when time is up", () => {
    expect(trueFalseReducer(initTrueFalse(statements), { type: "timeUp" }).finished).toBe(true);
  });
});
