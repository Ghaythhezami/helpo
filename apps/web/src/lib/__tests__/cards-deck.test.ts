import { currentCard, deckReducer, initDeck, remainingCards, type DeckAction, type DeckState } from "@/lib/cards-deck";

const run = (s: DeckState, ...actions: DeckAction[]) => actions.reduce(deckReducer, s);
const flipMark = (as: "got" | "review"): DeckAction[] => [{ type: "flip" }, { type: "mark", as }];

describe("cards deck reducer", () => {
  it("starts in order and clamps counts", () => {
    const s = initDeck(3);
    expect(s.order).toEqual([0, 1, 2]);
    expect(currentCard(s)).toBe(0);
    expect(initDeck(-2).total).toBe(0);
    expect(currentCard(initDeck(0))).toBeNull();
  });

  it("flips and ignores flip on an empty deck", () => {
    expect(run(initDeck(2), { type: "flip" }).flipped).toBe(true);
    expect(run(initDeck(2), { type: "flip" }, { type: "flip" }).flipped).toBe(false);
    expect(run(initDeck(0), { type: "flip" }).flipped).toBe(false);
  });

  it("navigates within bounds and un-flips", () => {
    const s = initDeck(3);
    expect(run(s, { type: "prev" })).toBe(s);
    const b = run(s, { type: "flip" }, { type: "next" });
    expect(b.pos).toBe(1);
    expect(b.flipped).toBe(false);
    expect(run(s, { type: "next" }, { type: "next" }, { type: "next" }).pos).toBe(2);
    expect(run(s, { type: "goTo", index: 99 }).pos).toBe(2);
    expect(run(s, { type: "goTo", index: -4 }).pos).toBe(0);
    expect(run(s, { type: "next" }, { type: "prev" }).pos).toBe(0);
  });

  it("marks only after flipping, then advances", () => {
    const s = initDeck(3);
    expect(run(s, { type: "mark", as: "got" })).toBe(s);
    const a = run(s, ...flipMark("got"));
    expect(a.got).toEqual([0]);
    expect(a.pos).toBe(1);
    expect(a.flipped).toBe(false);
    const b = run(a, ...flipMark("review"));
    expect(b.review).toEqual([1]);
  });

  it("re-marking a card moves it between piles", () => {
    const s = run(initDeck(2), ...flipMark("got"), { type: "prev" }, ...flipMark("review"));
    expect(s.got).toEqual([]);
    expect(s.review).toEqual([0]);
  });

  it("finishes after the last card and ignores nav/flip when done", () => {
    const s = run(initDeck(2), ...flipMark("got"), ...flipMark("review"));
    expect(s.done).toBe(true);
    expect(currentCard(s)).toBeNull();
    expect(run(s, { type: "flip" })).toBe(s);
    expect(run(s, { type: "next" })).toBe(s);
    expect(run(s, { type: "prev" })).toBe(s);
    expect(run(s, { type: "mark", as: "got" })).toBe(s);
    expect(run(s, { type: "goTo", index: 0 }).done).toBe(false);
  });

  it("review loop keeps only unmastered cards and terminates", () => {
    let s = run(initDeck(3), ...flipMark("got"), ...flipMark("review"), ...flipMark("review"));
    expect(remainingCards(s)).toEqual([1, 2]);
    s = run(s, { type: "restartReview" });
    expect(s.order).toEqual([1, 2]);
    expect(s.round).toBe(1);
    expect(s.review).toEqual([]);
    expect(s.done).toBe(false);
    s = run(s, ...flipMark("got"), ...flipMark("review"));
    expect(s.order).toEqual([1, 2]);
    s = run(s, { type: "restartReview" });
    expect(s.order).toEqual([2]);
    s = run(s, ...flipMark("got"));
    expect(s.done).toBe(true);
    expect(s.got.length).toBe(3);
    expect(run(s, { type: "restartReview" })).toBe(s);
  });

  it("shuffle is deterministic, resets position and never mutates", () => {
    const s = initDeck(6, "x");
    const frozen = JSON.stringify(s);
    const a = run(s, { type: "next" }, { type: "shuffle" });
    expect(JSON.stringify(s)).toBe(frozen);
    expect([...a.order].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(a.order).not.toEqual(s.order);
    expect(a.pos).toBe(0);
    expect(run(initDeck(6, "x"), { type: "next" }, { type: "shuffle" }).order).toEqual(a.order);
    expect(deckReducer(a, { type: "shuffle" }).shuffles).toBe(2);
  });

  it("reset restores the original order and clears piles", () => {
    const s = run(initDeck(3), { type: "shuffle" }, ...flipMark("got"), { type: "reset" });
    expect(s.order).toEqual([0, 1, 2]);
    expect(s.got).toEqual([]);
    expect(s.pos).toBe(0);
    expect(s.round).toBe(0);
  });
});
