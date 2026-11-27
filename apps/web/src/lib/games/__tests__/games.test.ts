import { equationMessageText, equationReducer, equationResult, initEquation, parseEquation } from "../equation";
import { initMatch, matchMessageText, matchReducer, matchResult, matchRoundSizes } from "../match";
import { initMemory, memoryReducer, memoryResult } from "../memory";
import { initOddOneOut, oddMessageText, oddReducer, oddResult } from "../oddoneout";
import { livePoints } from "../result";
import { shuffleSeeded } from "../shuffle";
import { initSort, sortMessageText, sortReducer, sortRemaining, sortResult } from "../sort";
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
  it("rounds grow: 3 pairs, then 4, then 5, and a lone last pair folds into the round before", () => {
    expect(matchRoundSizes(2)).toEqual([2]);
    expect(matchRoundSizes(3)).toEqual([3]);
    expect(matchRoundSizes(4)).toEqual([4]);
    expect(matchRoundSizes(6)).toEqual([3, 3]);
    expect(matchRoundSizes(7)).toEqual([3, 4]);
    expect(matchRoundSizes(12)).toEqual([3, 4, 5]);
    expect(matchRoundSizes(14)).toEqual([3, 4, 5, 2]);
    expect(matchRoundSizes(13)).toEqual([3, 4, 6]);
  });

  it("scores first-try and retried pairs, counts wrong tries and finishes after the last round", () => {
    let s = initMatch(pairs, "t");
    expect(s.rounds).toEqual([[0, 1, 2], [3, 4, 5]]);
    // wrong first: a nudge, then the partner is named on the second miss
    s = matchReducer(s, { type: "selectLeft", index: 0 });
    s = matchReducer(s, { type: "selectRight", index: 1 });
    expect(s.message).toEqual({ kind: "miss", left: "Roots", right: "Take in water", again: false });
    expect(matchMessageText(s.message)).toMatch(/Not that one/);
    expect(s.missed).toContain(0);
    s = matchReducer(s, { type: "selectLeft", index: 0 });
    s = matchReducer(s, { type: "selectRight", index: 2 });
    expect(s.message).toMatchObject({ kind: "miss", again: true });
    expect(matchMessageText(s.message)).toBe("Not yet. Roots goes with take in water.");
    expect(s.wrongTries).toBe(2);
    s = matchReducer(s, { type: "selectLeft", index: 0 });
    s = matchReducer(s, { type: "selectRight", index: 0 });
    expect(s.retried).toBe(1);
    for (const i of [1, 2]) {
      s = matchReducer(s, { type: "selectLeft", index: i });
      s = matchReducer(s, { type: "selectRight", index: i });
    }
    expect(s.roundDone).toBe(true);
    expect(s.finished).toBe(false);
    s = matchReducer(s, { type: "nextRound" });
    expect(s.round).toBe(1);
    for (const i of [3, 4, 5]) {
      s = matchReducer(s, { type: "selectLeft", index: i });
      s = matchReducer(s, { type: "selectRight", index: i });
    }
    expect(s.finished).toBe(true);
    expect(matchResult(s)).toEqual({ total: 6, firstTryCorrect: 5, retriedCorrect: 1, wrongTries: 2, hintsUsed: 0 });
    expect(s.xp).toBe(5 * 10 + 5);
  });

  it("needs a left pick first and a hint counts once per hint", () => {
    let s = initMatch(pairs, "t");
    s = matchReducer(s, { type: "selectRight", index: 0 });
    expect(s.message.kind).toBe("need-left");
    s = matchReducer(s, { type: "hint" });
    expect(s.hint).toBe(0);
    expect(s.hintsUsed).toBe(1);
    s = matchReducer(s, { type: "hint" });
    expect(matchResult(s).hintsUsed).toBe(2);
  });
});

describe("sort reducer", () => {
  const items = [
    { label: "Sunlight", belongsInYes: true },
    { label: "Candy", belongsInYes: false },
  ];
  const b = { yes: "Needs sunlight", no: "Does not" };

  it("accepts the right basket and counts the wrong try", () => {
    let s = initSort(items, "s");
    s = sortReducer(s, { type: "place", basket: "yes" });
    expect(s.message.kind).toBe("need-item");
    s = sortReducer(s, { type: "place", basket: "no", index: 0 });
    expect(s.message.kind).toBe("miss");
    s = sortReducer(s, { type: "place", basket: "yes", index: 0 });
    s = sortReducer(s, { type: "place", basket: "no", index: 1 });
    expect(s.finished).toBe(true);
    expect(sortRemaining(s)).toEqual([]);
    expect(sortResult(s)).toEqual({ total: 2, firstTryCorrect: 1, retriedCorrect: 1, wrongTries: 1, hintsUsed: 0 });
  });

  it("explains a miss from the basket names and offers a hint that points at the right basket", () => {
    let s = initSort(items, "s");
    s = sortReducer(s, { type: "place", basket: "no", index: 0 });
    expect(s.message).toEqual({ kind: "miss", index: 0, label: "Sunlight", basket: "no" });
    expect(sortMessageText(s.message, b)).toBe('Not yet. Sunlight goes in Needs sunlight, because it does not match "Does not".');
    s = sortReducer(s, { type: "place", basket: "yes", index: 1 });
    expect(sortMessageText(s.message, b)).toBe('Not yet. Candy goes in Does not, because it does not match "Needs sunlight".');
    s = sortReducer(s, { type: "select", index: 1 });
    s = sortReducer(s, { type: "hint" });
    expect(s.hint).toEqual({ index: 1, basket: "no" });
    expect(s.hintsUsed).toBe(1);
    expect(sortMessageText(s.message, b)).toBe("Hint: Candy goes in Does not.");
    s = sortReducer(s, { type: "select", index: 1 });
    expect(s.hint).toBeNull();
    // no selection: the hint is about the first item still in the bank
    s = sortReducer(s, { type: "hint" });
    expect(s.hint?.index).toBe(sortRemaining(s)[0]);
    s = sortReducer(s, { type: "place", basket: "yes", index: 0 });
    s = sortReducer(s, { type: "place", basket: "no", index: 1 });
    expect(sortResult(s)).toMatchObject({ wrongTries: 2, hintsUsed: 2 });
    expect(sortReducer(s, { type: "hint" })).toBe(s);
    for (const m of [{ kind: "start" }, { kind: "picked", label: "A" }, { kind: "need-item" }, { kind: "placed", label: "A", basket: "no", xp: 5, retry: true }, { kind: "finished", total: 3 }] as const) {
      expect(sortMessageText(m, b).length).toBeGreaterThan(3);
    }
  });

  it("has no hint once everything is placed", () => {
    let s = initSort([items[0]], "s");
    s = sortReducer(s, { type: "place", basket: "yes", index: 0 });
    expect(s.finished).toBe(true);
    expect(sortReducer(s, { type: "hint" })).toBe(s);
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
    expect(equationResult(s)).toEqual({ total: 4, firstTryCorrect: 4, retriedCorrect: 0, wrongTries: 0, hintsUsed: 0 });

    let w = initEquation(tiles, "e");
    for (const term of [2, 0, 1, 3]) w = equationReducer(w, { type: "tile", term });
    w = equationReducer(w, { type: "check" });
    expect(w.done).toBe(false);
    expect(w.verdict.filter((v) => v === false).length).toBeGreaterThan(0);
    expect(w.wrongTries).toBe(1);
    expect(w.message).toMatchObject({ kind: "wrong" });
    expect(equationMessageText(w.message)).toMatch(/Not right yet: slot [\d, ]+\. Tiles in the same group can swap/);
    w = equationReducer(w, { type: "reset" });
    for (const term of [0, 1, 2, 3]) w = equationReducer(w, { type: "tile", term });
    w = equationReducer(w, { type: "check" });
    expect(w.done).toBe(true);
    expect(equationResult(w).retriedCorrect).toBeGreaterThan(0);
    expect(equationResult(w).wrongTries).toBe(1);
  });
  it("places a tile in a chosen slot and swaps filled slots", () => {
    let s = initEquation(tiles, "e");
    s = equationReducer(s, { type: "place", term: 2, slot: 0 });
    expect(s.slots).toEqual([2, null, null, null]);
    expect(s.message).toEqual({ kind: "moved", label: "glucose", slot: 0 });
    // a tile that is already placed moves, and the slot it lands on swaps back
    s = equationReducer(s, { type: "place", term: 1, slot: 3 });
    s = equationReducer(s, { type: "place", term: 2, slot: 3 });
    expect(s.slots).toEqual([1, null, null, 2]);
    // placing from the bank onto a filled slot puts the old tile back in the bank
    s = equationReducer(s, { type: "place", term: 0, slot: 0 });
    expect(s.slots).toEqual([0, null, null, 2]);
    expect(equationReducer(s, { type: "place", term: 0, slot: 0 })).toBe(s);
    s = equationReducer(s, { type: "swap", a: 0, b: 1 });
    expect(s.slots).toEqual([null, 0, null, 2]);
    s = equationReducer(s, { type: "swap", a: 1, b: 3 });
    expect(s.slots).toEqual([null, 2, null, 0]);
    expect(s.message).toEqual({ kind: "moved", label: "carbon dioxide", slot: 3 });
    expect(equationReducer(s, { type: "swap", a: 0, b: 2 }).message.kind).toBe("start");
    expect(equationReducer(s, { type: "swap", a: 1, b: 1 })).toBe(s);
    expect(equationReducer(s, { type: "swap", a: 1, b: 9 })).toBe(s);
    expect(equationReducer(s, { type: "place", term: 9, slot: 0 })).toBe(s);
    expect(equationReducer(s, { type: "place", term: 0, slot: 9 })).toBe(s);
    expect(equationMessageText(s.message)).toBe("carbon dioxide is now in slot 4.");
  });
  it("hints at the first empty slot, then at a slot that does not fit, and counts each hint", () => {
    let s = initEquation(tiles, "e");
    s = equationReducer(s, { type: "hint" });
    expect(s.hint).toEqual({ slot: 0, term: 0 });
    expect(equationMessageText(s.message)).toBe("Hint: put carbon dioxide in slot 1.");
    for (const term of [0, 2, 1, 3]) s = equationReducer(s, { type: "tile", term });
    expect(s.hint).toBeNull();
    s = equationReducer(s, { type: "hint" });
    expect(s.hint?.slot).toBe(1);
    expect(equationResult(s).hintsUsed).toBe(2);
    // a full, correct (unchecked) layout has nothing to hint at
    let ok = initEquation(tiles, "e");
    for (const term of [0, 1, 2, 3]) ok = equationReducer(ok, { type: "tile", term });
    expect(equationReducer(ok, { type: "hint" })).toBe(ok);
    ok = equationReducer(ok, { type: "check" });
    expect(equationReducer(ok, { type: "hint" })).toBe(ok);
    expect(equationReducer(ok, { type: "swap", a: 0, b: 1 })).toBe(ok);
    expect(equationReducer(ok, { type: "place", term: 0, slot: 1 })).toBe(ok);
    for (const m of [{ kind: "start" }, { kind: "taken", label: "A" }, { kind: "full" }, { kind: "incomplete" }, { kind: "correct", retry: true }, { kind: "correct", retry: false }] as const) {
      expect(equationMessageText(m).length).toBeGreaterThan(3);
    }
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
    expect(r.wrongTries).toBe(1);
    expect(r.hintsUsed).toBe(0);
  });
  it("counts hints", () => {
    let s = initMemory(pairs, "m");
    s = memoryReducer(s, { type: "hint" });
    expect(s.hint).not.toBeNull();
    expect(memoryResult(s).hintsUsed).toBe(1);
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
    expect(trueFalseResult(s)).toEqual({ total: 2, firstTryCorrect: 1, retriedCorrect: 0, wrongTries: 1, hintsUsed: 0 });
  });
  it("ends when time is up", () => {
    expect(trueFalseReducer(initTrueFalse(statements), { type: "timeUp" }).finished).toBe(true);
  });
});

describe("odd one out reducer", () => {
  const rounds = [
    { items: ["Oak", "Pine", "Rose", "Maple"], oddIndex: 2, explanation: "A rose is a flower; the others are trees." },
    { items: ["Cat", "Dog", "Cow", "Rock"], oddIndex: 3, explanation: "A rock is not alive." },
    { items: ["Red", "Blue", "Green", "Five"], oddIndex: 3, explanation: "Five is a number." },
  ];
  type S = ReturnType<typeof initOddOneOut>;
  const oddAt = (s: S) => s.rounds[s.round].odd;
  const wrongAt = (s: S, skip = -1) => [0, 1, 2, 3].find((i) => i !== oddAt(s) && i !== skip) as number;

  it("shuffles each round with the seed and keeps track of the odd card", () => {
    const a = initOddOneOut(rounds, "seed");
    expect(initOddOneOut(rounds, "seed")).toEqual(a);
    a.rounds.forEach((r, i) => {
      expect([...r.items].sort()).toEqual([...rounds[i].items].sort());
      expect(r.items[r.odd]).toBe(rounds[i].items[rounds[i].oddIndex]);
      expect(r.explanation).toBe(rounds[i].explanation);
    });
  });

  it("skips malformed rounds, caps the session and finishes at once with no rounds", () => {
    const s = initOddOneOut([{ items: ["a", "b", "c"], oddIndex: 0, explanation: "x" }, { items: ["a", "b", "c", "d"], oddIndex: 7, explanation: "x" }, ...rounds], "x");
    expect(s.rounds).toHaveLength(3);
    const none = initOddOneOut(undefined);
    expect(none.finished).toBe(true);
    expect(oddResult(none)).toEqual({ total: 0, firstTryCorrect: 0, retriedCorrect: 0, wrongTries: 0, hintsUsed: 0 });
    expect(oddReducer(none, { type: "hint" })).toBe(none);
    expect(initOddOneOut(Array.from({ length: 12 }, () => rounds[0])).rounds).toHaveLength(8);
  });

  it("a first tap on the odd card is a first try; the reason shows; next moves on", () => {
    let s = initOddOneOut(rounds, "seed");
    expect(oddMessageText(s.message)).toBe("Which card does not belong?");
    s = oddReducer(s, { type: "next" });
    expect(s.round).toBe(0);
    s = oddReducer(s, { type: "tap", index: oddAt(s) });
    expect(s).toMatchObject({ found: true, roundDone: true, firstTry: 1, retried: 0, xp: 10 });
    expect(oddMessageText(s.message)).toMatch(/is the odd one out/);
    expect(oddReducer(s, { type: "tap", index: 0 })).toBe(s);
    expect(oddReducer(s, { type: "hint" })).toBe(s);
    s = oddReducer(s, { type: "next" });
    expect(s).toMatchObject({ round: 1, tapped: [], removed: [], found: false, roundDone: false });
  });

  it("a wrong tap disables that card and counts; finding the odd card after one miss is a retry", () => {
    let s = initOddOneOut(rounds, "seed");
    const bad = wrongAt(s);
    s = oddReducer(s, { type: "tap", index: bad });
    expect(s).toMatchObject({ wrongTries: 1, roundDone: false, tapped: [bad] });
    expect(oddMessageText(s.message)).toMatch(/^Not this one\. .* fits with the others/);
    expect(oddReducer(s, { type: "tap", index: bad })).toBe(s);
    expect(oddReducer(s, { type: "tap", index: 9 })).toBe(s);
    s = oddReducer(s, { type: "tap", index: oddAt(s) });
    expect(s).toMatchObject({ found: true, retried: 1, firstTry: 0, xp: 5 });
  });

  it("the second wrong tap reveals the answer without credit", () => {
    let s = initOddOneOut(rounds, "seed");
    const first = wrongAt(s);
    s = oddReducer(s, { type: "tap", index: first });
    s = oddReducer(s, { type: "tap", index: wrongAt(s, first) });
    expect(s).toMatchObject({ found: false, roundDone: true, wrongTries: 2, firstTry: 0, retried: 0 });
    expect(oddMessageText(s.message)).toMatch(/^The odd one out is /);
    s = oddReducer(s, { type: "next" });
    expect(s.round).toBe(1);
  });

  it("a hint takes away a card that fits, never the odd one, and runs out", () => {
    let s = initOddOneOut(rounds, "seed");
    for (let i = 0; i < 5; i++) s = oddReducer(s, { type: "hint" });
    expect(s.removed).toHaveLength(3);
    expect(s.removed).not.toContain(oddAt(s));
    expect(s.hintsUsed).toBe(3);
    expect(oddMessageText({ kind: "hint" })).toMatch(/Hint/);
    expect(oddReducer(s, { type: "tap", index: s.removed[0] })).toBe(s);
    s = oddReducer(s, { type: "tap", index: oddAt(s) });
    expect(s.firstTry).toBe(1);
  });

  it("finishes after the last round and reports every counter", () => {
    let s = initOddOneOut(rounds, "seed");
    s = oddReducer(s, { type: "hint" });
    s = oddReducer(s, { type: "tap", index: wrongAt(s, s.removed[0]) });
    for (let r = 0; r < 3; r++) {
      s = oddReducer(s, { type: "tap", index: oddAt(s) });
      if (r < 2) s = oddReducer(s, { type: "next" });
    }
    expect(s.finished).toBe(true);
    expect(s.message.kind).toBe("finished");
    expect(oddMessageText(s.message)).toMatch(/All rounds done/);
    expect(oddReducer(s, { type: "next" })).toBe(s);
    expect(oddResult(s)).toEqual({ total: 3, firstTryCorrect: 2, retriedCorrect: 1, wrongTries: 1, hintsUsed: 1 });
  });

  it("a revealed last round also finishes the game", () => {
    let s = initOddOneOut([rounds[0]], "seed");
    const first = wrongAt(s);
    s = oddReducer(s, { type: "tap", index: first });
    s = oddReducer(s, { type: "tap", index: wrongAt(s, first) });
    expect(s.finished).toBe(true);
    expect(oddResult(s)).toMatchObject({ total: 1, firstTryCorrect: 0, retriedCorrect: 0, wrongTries: 2 });
  });
});

describe("live points", () => {
  const base = { total: 4, firstTryCorrect: 4, retriedCorrect: 0, wrongTries: 0, hintsUsed: 0 };
  it("is the accuracy share minus 1 per wrong try and 5 per hint, never below 0", () => {
    expect(livePoints(base, false)).toBe(100);
    expect(livePoints({ ...base, firstTryCorrect: 3, retriedCorrect: 1, wrongTries: 2, hintsUsed: 1 }, false)).toBe(88 - 2 - 5);
    expect(livePoints({ ...base, firstTryCorrect: 0, wrongTries: 9, hintsUsed: 9 }, false)).toBe(0);
  });
  it("never charges Explorers for tries or hints", () => {
    expect(livePoints({ ...base, wrongTries: 3, hintsUsed: 2 }, true)).toBe(100);
  });
});
