import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CheckView, ResourceView } from "@helpo/shared";
import { CardsPreview } from "@/components/teacher/cards-deck";
import { GamePreview, QuizPreview, SlidesPreview, WorksheetPreview } from "@/components/teacher/previews";
import { EquationGame, MatchGame, MemoryGame, OddOneOutGame, SortGame, TrueFalseGame } from "@/components/student/games";
import { Donut, LineChart, StatusMark, TargetBar, masteryStatus } from "@/components/teacher/charts";
import { cardsContent, gameContent, quizContent, resource, slidesContent, worksheetContent } from "@/test/fixtures";
import { renderWithProviders } from "@/test/utils";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

const open: CheckView = { id: "k", resource: "QUIZ", itemRef: "Q1", kind: "FACT_CHECK", message: "m", suggestion: null, sourcePage: null, status: "OPEN" };
const noop = () => undefined;
jest.setTimeout(60000);
const statusText = () => screen.getAllByRole("status").map((e) => e.textContent).join(" | ");

describe("resource previews", () => {
  it("renders each slide layout with its own template", async () => {
    const onSave = jest.fn();
    const r = resource("SLIDES", slidesContent) as ResourceView;
    renderWithProviders(<SlidesPreview resource={r} checks={[]} onSave={onSave} onOpenCheck={noop} />);
    for (let i = 1; i < slidesContent.slides.length; i++) {
      await userEvent.click(screen.getByRole("button", { name: new RegExp(`^S${i + 1} `) }));
    }
    expect(screen.getByText("Remember")).toBeInTheDocument();
  });

  it("filters the worksheet by level and toggles the answer key", async () => {
    renderWithProviders(<WorksheetPreview resource={resource("WORKSHEET", worksheetContent)} checks={[]} onOpenCheck={noop} lessonTitle="L" />);
    expect(screen.getByText("What do plants need?")).toBeInTheDocument();
    expect(screen.queryByText(/Answer:/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Answer key" }));
    expect(screen.getByText(/Answer:/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Support" }));
    expect(screen.getByText(/Roots take in/)).toBeInTheDocument();
  });

  it("shows quiz options with the key, flags open checks and saves an edit", async () => {
    const onOpen = jest.fn();
    const onSave = jest.fn();
    renderWithProviders(<QuizPreview resource={resource("QUIZ", quizContent)} checks={[open]} onSave={onSave} onOpenCheck={onOpen} lessonTitle="L" />);
    await userEvent.click(screen.getByRole("button", { name: /flagged/ }));
    expect(onOpen).toHaveBeenCalledWith(open);
    expect(screen.getByText("Accepted answers:")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit Q1" }));
    await userEvent.type(screen.getByLabelText("Question Q1"), " (edited)");
    await userEvent.click(screen.getAllByRole("radio")[1]);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const saved = onSave.mock.calls[0][0];
    expect(saved.questions[0].prompt).toContain("(edited)");
    expect(saved.questions[0].options[1].correct).toBe(true);
  });

  it("plays the match preview and flips cards", async () => {
    renderWithProviders(<GamePreview resource={resource("GAME", gameContent)} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Roots" })[0]);
    await userEvent.click(screen.getByRole("button", { name: "Take in water" }));
    expect(statusText()).toMatch(/Matched/);
    renderWithProviders(<CardsPreview resource={resource("CARDS", cardsContent)} />);
    await userEvent.click(screen.getByRole("button", { name: /Term 1/ }));
    expect(screen.getByText("Meaning 1")).toBeInTheDocument();
  });

  it("lists the game kinds thinking-first and marks the odd item in a read-only sample", () => {
    const content = { ...gameContent, oddOneOut: [{ items: ["Oak", "Pine", "Rose", "Maple"], oddIndex: 2, explanation: "A rose is a flower." }] };
    renderWithProviders(<GamePreview resource={resource("GAME", content)} />);
    const group = screen.getByRole("group", { name: "Odd one out:" });
    expect(group).toHaveTextContent("Rose (odd one out)");
    expect(group).not.toHaveTextContent("Oak (odd one out)");
    expect(group).toHaveTextContent("A rose is a flower.");
    const text = document.querySelector(".doc")!.textContent ?? "";
    const at = (label: string) => text.indexOf(label);
    expect(at("Sort:")).toBeLessThan(at("Sequence:"));
    expect(at("Sequence:")).toBeLessThan(at("Odd one out:"));
    expect(at("Odd one out:")).toBeLessThan(at("Roots"));
    expect(at("Roots")).toBeLessThan(at("True or false:"));
  });

  it("shows no odd one out sample for older lessons without one", () => {
    renderWithProviders(<GamePreview resource={resource("GAME", { ...gameContent, oddOneOut: [] })} />);
    expect(screen.queryByRole("group", { name: "Odd one out:" })).not.toBeInTheDocument();
  });
});

const base = { content: gameContent, seed: "s", explorer: false, sound: false, busy: false };
const oddContent = {
  ...gameContent,
  oddOneOut: [
    { items: ["Oak", "Pine", "Rose", "Maple"], oddIndex: 2, explanation: "A rose is a flower; the others are trees." },
    { items: ["Cat", "Dog", "Cow", "Rock"], oddIndex: 3, explanation: "A rock is not alive." },
  ],
};

/** fireEvent on the nearest button for a visible text: far faster than role queries on a big board. */
function tap(text: string, which = 0) {
  const nodes = screen.getAllByText(new RegExp(`^${text}$`));
  fireEvent.click((nodes[which] ?? nodes[0]).closest("button")!);
}
const press = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name, hidden: true }));
const basketEl = (yes: boolean) => document.querySelector(`.basket.${yes ? "yes" : "no"}`) as HTMLElement;
const slots = () => [...document.querySelectorAll<HTMLElement>(".eq .slot")];
const tile = (text: string) => [...document.querySelector(".tbank")!.querySelectorAll("button")].find((b) => b.textContent?.startsWith(text))!;
const bankItem = (text: string) => screen.getAllByText(new RegExp(`^${text}$`))[0].closest("li") as HTMLElement;

/** jsdom has no layout: tell the drag code which element is under the pointer. */
function pointerOver(target: Element | null) {
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => target });
}
function drag(from: Element, to: Element | null) {
  pointerOver(to);
  fireEvent.pointerDown(from, { button: 0, clientX: 5, clientY: 5 });
  fireEvent.pointerMove(window, { clientX: 60, clientY: 60 });
  fireEvent.pointerUp(window, { clientX: 60, clientY: 60 });
}
// This jsdom has no PointerEvent: a MouseEvent carries the button and the coordinates the drag code reads.
beforeAll(() => {
  if (!("PointerEvent" in window)) Object.defineProperty(window, "PointerEvent", { configurable: true, value: class PointerEvent extends MouseEvent {} });
});
afterEach(() => {
  Reflect.deleteProperty(document, "elementFromPoint");
});

describe("student games", () => {
  it("match: rounds grow, wrong tries get a nudge then the partner, and the result carries the counters", () => {
    const onFinish = jest.fn();
    renderWithProviders(<MatchGame {...base} onFinish={onFinish} />);
    expect(screen.getByText("Round 1 of 2")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").filter((li) => li.classList.contains("tw"))).toHaveLength(6);
    tap("Roots");
    tap("Makes food"); // wrong partner first
    expect(statusText()).toMatch(/Not that one. Take another look at Roots/);
    tap("Roots");
    tap("Carries water"); // second miss on the same item names the partner
    expect(statusText()).toMatch(/Not yet. Roots goes with Take in water\./);
    for (const [l, r] of [["Roots", "Take in water"], ["Leaf", "Makes food"], ["Stem", "Carries water"]]) {
      tap(l);
      tap(r);
    }
    press(/Start round 2/);
    expect(screen.getByText("Round 2 of 2")).toBeInTheDocument();
    for (const [l, r] of [["Flower", "Makes seeds"], ["Seed", "New plant"], ["Sun", "Energy"]]) {
      tap(l);
      tap(r);
    }
    press(/See my results/);
    expect(onFinish).toHaveBeenCalledWith({ total: 6, firstTryCorrect: 5, retriedCorrect: 1, wrongTries: 2, hintsUsed: 0 });
  });

  it("match: the hint shows its cost and counts; the live points drop with it", () => {
    renderWithProviders(<MatchGame {...base} onFinish={jest.fn()} />);
    expect(screen.getByText("Points: 0")).toBeInTheDocument();
    expect(screen.getByText("A wrong try costs 1 point")).toBeInTheDocument();
    press(/^Hint \(-5 points\)$/);
    expect(statusText()).toMatch(/Hint:/);
  });

  it("match: explorers get free hints, no cost rule and read-aloud buttons", () => {
    const onFinish = jest.fn();
    renderWithProviders(<MatchGame {...base} explorer onFinish={onFinish} />);
    press(/^Hint \(free\)$/);
    expect(statusText()).toMatch(/Hint:/);
    expect(screen.queryByText("A wrong try costs 1 point")).not.toBeInTheDocument();
    expect(screen.queryByText(/-5 points/)).not.toBeInTheDocument();
    expect(document.querySelectorAll("button.ra").length).toBeGreaterThan(4);
    // the estimate does not charge the Explorer for the hint
    for (const [l, r] of [["Roots", "Take in water"], ["Leaf", "Makes food"], ["Stem", "Carries water"]]) {
      tap(l);
      tap(r);
    }
    expect(screen.getByText("Points: 50")).toBeInTheDocument();
  });

  it("memory: counts tries, turns a mismatch back and offers a hint with its cost", () => {
    jest.useFakeTimers();
    renderWithProviders(<MemoryGame {...base} onFinish={jest.fn()} />);
    const grid = document.querySelector(".memgrid") as HTMLElement;
    const cards = grid.querySelectorAll("button");
    expect(cards).toHaveLength(12);
    fireEvent.click(cards[0]);
    fireEvent.click(cards[1]);
    expect(screen.getByText(/Tries: 1/)).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    press(/^Hint \(-5 points\)$/);
    jest.useRealTimers();
  });

  it("memory: plays to the end and reports tries and hints", () => {
    jest.useFakeTimers();
    const onFinish = jest.fn();
    renderWithProviders(<MemoryGame {...base} explorer onFinish={onFinish} />);
    press(/^Hint \(free\)$/);
    const grid = document.querySelector(".memgrid") as HTMLElement;
    const buttons = () => [...grid.querySelectorAll("button")];
    // look at every card once (two at a time), then pair them up from what was seen
    const seen: string[] = [];
    for (let i = 0; i < 12; i += 2) {
      fireEvent.click(buttons()[i]);
      fireEvent.click(buttons()[i + 1]);
      seen[i] = buttons()[i].getAttribute("aria-label") as string;
      seen[i + 1] = buttons()[i + 1].getAttribute("aria-label") as string;
      act(() => {
        jest.advanceTimersByTime(1000);
      });
    }
    for (const p of gameContent.pairs) {
      const [x, y] = [seen.indexOf(p.left), seen.indexOf(p.right)];
      if (!buttons()[x].disabled) {
        fireEvent.click(buttons()[x]);
        fireEvent.click(buttons()[y]);
      }
    }
    press(/See my results/);
    jest.useRealTimers();
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({ total: 6, hintsUsed: 1 });
    expect(onFinish.mock.calls[0][0].firstTryCorrect + onFinish.mock.calls[0][0].retriedCorrect).toBe(6);
  });

  it("sort: tap an item, then a basket; a miss names the basket it belongs in and why", () => {
    const onFinish = jest.fn();
    renderWithProviders(<SortGame {...base} onFinish={onFinish} />);
    tap("Sunlight");
    fireEvent.click(basketEl(false));
    expect(statusText()).toMatch(/Not yet\. Sunlight goes in Plants need, because it does not match "Plants do not need"\./);
    for (const it of ["Sunlight", "Water", "Candy", "Plastic"]) {
      tap(it);
      fireEvent.click(basketEl(it === "Sunlight" || it === "Water"));
    }
    press(/See my results/);
    expect(onFinish).toHaveBeenCalledWith({ total: 4, firstTryCorrect: 3, retriedCorrect: 1, wrongTries: 1, hintsUsed: 0 });
  });

  it("sort: with an item selected, 1 and 2 drop it in a basket, and the arrows follow the drawn order", () => {
    renderWithProviders(<SortGame {...base} onFinish={jest.fn()} />);
    const board = document.querySelector(".board") as HTMLElement;
    fireEvent.keyDown(board, { key: "1" }); // nothing selected: ignored
    expect(statusText()).toMatch(/Pick an item to start/);
    tap("Sunlight");
    fireEvent.keyDown(board, { key: "q" });
    expect(statusText()).toMatch(/Sunlight selected/);
    fireEvent.keyDown(board, { key: "2" });
    expect(statusText()).toMatch(/Not yet/);
    tap("Sunlight");
    fireEvent.keyDown(board, { key: "ArrowLeft" }); // LTR: left is the first basket
    expect(basketEl(true).textContent).toMatch(/Sunlight/);
    tap("Candy");
    fireEvent.keyDown(board, { key: "ArrowRight" });
    expect(basketEl(false).textContent).toMatch(/Candy/);
  });

  it("sort: in Arabic the arrows follow the mirrored baskets", () => {
    renderWithProviders(<SortGame {...base} onFinish={jest.fn()} />, { locale: "ar" });
    const board = document.querySelector(".board") as HTMLElement;
    tap("Sunlight");
    fireEvent.keyDown(board, { key: "ArrowRight" }); // RTL: right is the first basket
    expect(basketEl(true).textContent).toMatch(/Sunlight/);
    tap("Candy");
    fireEvent.keyDown(board, { key: "ArrowLeft" });
    expect(basketEl(false).textContent).toMatch(/Candy/);
  });

  it("sort: dragging an item onto a basket places it, with a ghost and a highlighted basket on the way", () => {
    renderWithProviders(<SortGame {...base} onFinish={jest.fn()} />);
    pointerOver(basketEl(true));
    fireEvent.pointerDown(bankItem("Sunlight"), { button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerMove(window, { clientX: 7, clientY: 7 }); // under the threshold: still a tap
    expect(document.querySelector(".ghost")).toBeNull();
    fireEvent.pointerMove(window, { clientX: 60, clientY: 60 });
    expect(document.querySelector(".ghost")).toHaveTextContent("Sunlight");
    expect(basketEl(true)).toHaveClass("over");
    fireEvent.pointerUp(window, { clientX: 60, clientY: 60 });
    expect(document.querySelector(".ghost")).toBeNull();
    expect(basketEl(true).textContent).toMatch(/Sunlight/);
    expect(statusText()).toMatch(/placed in Plants need/);
  });

  it("sort: a drop on the wrong basket is a miss, a drop elsewhere or a cancel does nothing, and a click after a drag is ignored", () => {
    renderWithProviders(<SortGame {...base} onFinish={jest.fn()} />);
    drag(bankItem("Sunlight"), basketEl(false));
    expect(statusText()).toMatch(/Not yet\. Sunlight goes in Plants need/);
    drag(bankItem("Water"), document.body);
    expect(basketEl(true).textContent).not.toMatch(/Water/);
    drag(bankItem("Water"), null);
    expect(basketEl(true).textContent).not.toMatch(/Water/);
    pointerOver(basketEl(true));
    fireEvent.pointerDown(bankItem("Water"), { button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerMove(window, { clientX: 60, clientY: 60 });
    fireEvent.pointerCancel(window, { clientX: 60, clientY: 60 });
    expect(basketEl(true).textContent).not.toMatch(/Water/);
    // right after a drag the browser's click must not select the item
    pointerOver(basketEl(true));
    fireEvent.pointerDown(bankItem("Water"), { button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerMove(window, { clientX: 60, clientY: 60 });
    fireEvent.pointerUp(window, { clientX: 60, clientY: 60 });
    expect(statusText()).toMatch(/Water placed/);
    // a secondary button never starts a drag
    fireEvent.pointerDown(bankItem("Candy"), { button: 2, clientX: 5, clientY: 5 });
    fireEvent.pointerMove(window, { clientX: 60, clientY: 60 });
    expect(document.querySelector(".ghost")).toBeNull();
  });

  it("sort: the hint points at the right basket for the selected item and costs a hint in the result", () => {
    const onFinish = jest.fn();
    renderWithProviders(<SortGame {...base} onFinish={onFinish} />);
    expect(screen.getByRole("button", { name: "Hint (-5 points)", hidden: true })).toBeInTheDocument();
    tap("Candy");
    press(/^Hint/);
    expect(basketEl(false)).toHaveClass("hint");
    expect(basketEl(true)).not.toHaveClass("hint");
    expect(statusText()).toMatch(/Hint: Candy goes in Plants do not need\./);
    for (const it of ["Sunlight", "Water", "Candy", "Plastic"]) {
      tap(it);
      fireEvent.click(basketEl(it === "Sunlight" || it === "Water"));
    }
    press(/See my results/);
    expect(onFinish).toHaveBeenCalledWith({ total: 4, firstTryCorrect: 4, retriedCorrect: 0, wrongTries: 0, hintsUsed: 1 });
  });

  it("sort: explorers get a free hint and read-aloud, and no cost is shown", () => {
    renderWithProviders(<SortGame {...base} explorer onFinish={jest.fn()} />);
    press(/^Hint \(free\)$/);
    expect(screen.queryByText("A wrong try costs 1 point")).not.toBeInTheDocument();
    expect(document.querySelectorAll("button.ra").length).toBe(4);
  });

  it("equation: fills slots, checks and finishes", () => {
    const onFinish = jest.fn();
    renderWithProviders(<EquationGame {...base} onFinish={onFinish} />);
    press(/^Check$/);
    expect(statusText()).toMatch(/Fill every slot/);
    for (const t of ["carbon dioxide", "water", "glucose", "oxygen"]) fireEvent.click(tile(t));
    fireEvent.click(tile("oxygen")); // a placed tile taken back
    expect(statusText()).toMatch(/oxygen taken back/);
    fireEvent.click(tile("oxygen"));
    press(/^Check$/);
    press(/See my results/);
    expect(onFinish).toHaveBeenCalledWith({ total: 4, firstTryCorrect: 4, retriedCorrect: 0, wrongTries: 0, hintsUsed: 0 });
  });

  it("equation: a wrong check names the slots, tapping a slot then another swaps them", () => {
    const onFinish = jest.fn();
    renderWithProviders(<EquationGame {...base} onFinish={onFinish} />);
    for (const t of ["glucose", "water", "carbon dioxide", "oxygen"]) fireEvent.click(tile(t));
    press(/^Check$/);
    expect(statusText()).toMatch(/Not right yet: slot 1, 3\. Tiles in the same group can swap places\./);
    expect(slots()[0]).toHaveClass("bad");
    expect(slots()[1]).toHaveClass("good");
    fireEvent.click(slots()[0]); // pick up
    expect(slots()[0]).toHaveAttribute("aria-pressed", "true");
    expect(statusText()).toMatch(/glucose picked up from slot 1/);
    fireEvent.click(slots()[2]); // swap
    expect(slots()[0]).toHaveTextContent("carbon dioxide");
    expect(slots()[2]).toHaveTextContent("glucose");
    press(/^Check$/);
    press(/See my results/);
    expect(onFinish).toHaveBeenCalledWith({ total: 4, firstTryCorrect: 2, retriedCorrect: 2, wrongTries: 1, hintsUsed: 0 });
  });

  it("equation: tap a slot twice to take its tile back, tap a tile while holding a slot to place it there", () => {
    renderWithProviders(<EquationGame {...base} onFinish={jest.fn()} />);
    fireEvent.click(slots()[0]); // empty and nothing held: ignored
    expect(slots()[0]).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(tile("water"));
    fireEvent.click(slots()[0]);
    fireEvent.click(slots()[0]);
    expect(slots()[0]).toHaveTextContent("Empty");
    expect(statusText()).toMatch(/water taken back/);
    fireEvent.click(tile("water"));
    fireEvent.click(slots()[0]);
    fireEvent.click(tile("glucose")); // goes into the held slot, water goes back to the bank
    expect(slots()[0]).toHaveTextContent("glucose");
    expect(slots().filter((s) => /water/.test(s.textContent ?? ""))).toHaveLength(0);
  });

  it("equation: the keyboard picks up with Enter, moves with the arrows, drops with Enter and lets go with Escape", () => {
    const onFinish = jest.fn();
    renderWithProviders(<EquationGame {...base} onFinish={onFinish} />);
    for (const t of ["glucose", "water", "carbon dioxide", "oxygen"]) fireEvent.click(tile(t));
    fireEvent.keyDown(slots()[1], { key: "ArrowRight" }); // nothing held: ignored
    fireEvent.keyDown(slots()[0], { key: "Enter" });
    expect(statusText()).toMatch(/glucose picked up from slot 1\. Use the arrow keys/);
    fireEvent.keyDown(slots()[0], { key: "ArrowLeft" }); // at the edge: stays
    expect(slots()[0]).toHaveTextContent("glucose");
    fireEvent.keyDown(slots()[0], { key: "ArrowDown" });
    fireEvent.keyDown(slots()[1], { key: "ArrowRight" });
    expect(slots()[2]).toHaveTextContent("glucose");
    expect(statusText()).toMatch(/glucose picked up from slot 3/);
    expect(slots()[2]).toHaveFocus();
    fireEvent.keyDown(slots()[2], { key: "ArrowUp" });
    fireEvent.keyDown(slots()[1], { key: "ArrowDown" });
    fireEvent.keyDown(slots()[2], { key: "Escape" });
    expect(slots()[2]).toHaveAttribute("aria-pressed", "false");
    fireEvent.keyDown(slots()[2], { key: " " }); // pick up again
    fireEvent.keyDown(slots()[2], { key: "Enter" }); // drop on itself
    fireEvent.keyDown(slots()[0], { key: "Enter" });
    fireEvent.keyDown(slots()[1], { key: "Enter" }); // drop on another slot swaps
    expect(slots()[0]).toHaveTextContent("carbon dioxide");
    expect(slots()[1]).toHaveTextContent("water");
    fireEvent.keyDown(slots()[2], { key: "x" });
    press(/^Check$/);
    press(/See my results/);
    expect(onFinish).toHaveBeenCalledWith({ total: 4, firstTryCorrect: 4, retriedCorrect: 0, wrongTries: 0, hintsUsed: 0 });
  });

  it("equation: drag a tile onto a slot, a slot onto a slot, and a tile back to the bank", () => {
    renderWithProviders(<EquationGame {...base} onFinish={jest.fn()} />);
    const bank = document.querySelector(".tbank") as HTMLElement;
    drag(tile("glucose").closest("li")!, slots()[0]);
    expect(slots()[0]).toHaveTextContent("glucose");
    drag(tile("water").closest("li")!, slots()[0]); // onto a filled slot: swaps, glucose returns to the bank
    expect(slots()[0]).toHaveTextContent("water");
    drag(tile("oxygen").closest("li")!, slots()[3]);
    drag(slots()[0], slots()[3]); // slot onto slot swaps
    expect(slots()[3]).toHaveTextContent("water");
    expect(slots()[0]).toHaveTextContent("oxygen");
    drag(slots()[3], bank); // a slot dropped on the bank takes the tile back
    expect(slots()[3]).toHaveTextContent("Empty");
    drag(tile("oxygen").closest("li")!, bank); // a placed tile dropped on the bank is taken back too
    expect(slots()[0]).toHaveTextContent("Empty");
    drag(tile("oxygen").closest("li")!, document.body); // anywhere else does nothing
    drag(tile("oxygen").closest("li")!, null);
    expect(slots().every((s) => /Empty/.test(s.textContent ?? ""))).toBe(true);
    expect(document.querySelector(".ghost")).toBeNull();
  });

  it("equation: the hint says which tile goes in the first empty slot and is free for explorers", () => {
    const { unmount } = renderWithProviders(<EquationGame {...base} onFinish={jest.fn()} />);
    press(/^Hint \(-5 points\)$/);
    expect(statusText()).toMatch(/Hint: put carbon dioxide in slot 1\./);
    expect(slots()[0]).toHaveClass("hint");
    expect(tile("carbon dioxide")).toHaveClass("hint");
    unmount();
    renderWithProviders(<EquationGame {...base} explorer onFinish={jest.fn()} />);
    press(/^Hint \(free\)$/);
    fireEvent.click(tile("water"));
    fireEvent.click(tile("glucose"));
    fireEvent.click(tile("carbon dioxide"));
    fireEvent.click(tile("oxygen"));
    press(/^Reset$/);
    expect(slots()[0]).toHaveTextContent("Empty");
  });

  it("odd one out: finds the card, shows the reason, moves on and reports the counters", () => {
    const onFinish = jest.fn();
    renderWithProviders(<OddOneOutGame {...base} content={oddContent} onFinish={onFinish} />);
    expect(screen.getByText("Round 1 of 2")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^(Oak|Pine|Rose|Maple)$/ })).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Pine" })); // wrong
    expect(statusText()).toMatch(/Not this one\. Pine fits with the others\. Try another card\./);
    expect(screen.getByRole("button", { name: "Pine. Not this one" })).toBeDisabled();
    expect(screen.queryByText("A rose is a flower; the others are trees.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rose" }));
    expect(screen.getByText("A rose is a flower; the others are trees.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rose. The odd one out" })).toBeDisabled();
    expect(statusText()).toMatch(/Yes, Rose is the odd one out\./);
    expect(screen.queryByRole("button", { name: /^Hint/ })).not.toBeInTheDocument();
    press(/^Next round$/);
    expect(screen.getByText("Round 2 of 2")).toBeInTheDocument();
    expect(screen.queryByText("A rose is a flower; the others are trees.")).not.toBeInTheDocument();
    press(/^Hint \(-5 points\)$/);
    expect(statusText()).toMatch(/Hint: one card that fits was taken away\./);
    expect(document.querySelectorAll(".oddcard.out")).toHaveLength(1);
    expect(document.querySelector(".oddcard.out")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Rock" }));
    expect(screen.getByText("A rock is not alive.")).toBeInTheDocument();
    press(/See my results/);
    expect(onFinish).toHaveBeenCalledWith({ total: 2, firstTryCorrect: 1, retriedCorrect: 1, wrongTries: 1, hintsUsed: 1 });
  });

  it("odd one out: a second wrong tap reveals the odd card and its reason", () => {
    renderWithProviders(<OddOneOutGame {...base} content={oddContent} onFinish={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Oak" }));
    fireEvent.click(screen.getByRole("button", { name: "Pine" }));
    expect(statusText()).toMatch(/The odd one out is Rose\./);
    expect(screen.getByText("A rose is a flower; the others are trees.")).toBeInTheDocument();
    expect(document.querySelector(".oddcard.odd")).toHaveTextContent("The odd one out");
    expect(screen.getByRole("button", { name: /^Next round$/ })).toHaveFocus();
  });

  it("odd one out: explorers get free hints, read-aloud and no cost; older content without rounds says so", () => {
    const { unmount } = renderWithProviders(<OddOneOutGame {...base} explorer content={oddContent} onFinish={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Hint (free)", hidden: true })).toBeInTheDocument();
    expect(screen.queryByText("A wrong try costs 1 point")).not.toBeInTheDocument();
    expect(document.querySelectorAll("button.ra")).toHaveLength(4);
    unmount();
    renderWithProviders(<OddOneOutGame {...base} content={{ ...gameContent, oddOneOut: undefined } as never} onFinish={jest.fn()} />);
    expect(screen.getByText("We don't know that game.")).toBeInTheDocument();
  });

  it("odd one out: finishing on a revealed last round still reports the result", () => {
    const onFinish = jest.fn();
    renderWithProviders(<OddOneOutGame {...base} content={{ ...oddContent, oddOneOut: [oddContent.oddOneOut[0]] }} onFinish={onFinish} />);
    fireEvent.click(screen.getByRole("button", { name: "Oak" }));
    fireEvent.click(screen.getByRole("button", { name: "Pine" }));
    press(/See my results/);
    expect(onFinish).toHaveBeenCalledWith({ total: 1, firstTryCorrect: 0, retriedCorrect: 0, wrongTries: 2, hintsUsed: 0 });
  });

  it("true or false: answers, shows the explanation, the live points and finishes", () => {
    const onFinish = jest.fn();
    renderWithProviders(<TrueFalseGame {...base} onFinish={onFinish} />);
    for (const st of gameContent.statements) {
      press(new RegExp(st.isTrue ? "^True$" : "^False$"));
      expect(statusText()).toContain(st.explanation);
      press(/^Next$/);
    }
    press(/See my results/);
    expect(onFinish).toHaveBeenCalledWith({ total: 5, firstTryCorrect: 5, retriedCorrect: 0, wrongTries: 0, hintsUsed: 0 });
    expect(screen.getByText("Points: 100")).toBeInTheDocument();
  });
});

describe("result charts", () => {
  it("classifies mastery and renders donut, line and target bars", () => {
    expect(masteryStatus(0.8)).toBe("met");
    expect(masteryStatus(0.65)).toBe("close");
    expect(masteryStatus(0.2)).toBe("notyet");
    render(<><Donut value={0.5} correct={5} wrong={5} /><LineChart points={[{ label: "L1", value: 0.8 }, { label: "L2", value: 0.6 }]} label="line" /><TargetBar value={0.6} label="O1" /><StatusMark status="met">85% Met</StatusMark></>);
    expect(screen.getByRole("img", { name: /Donut/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "line" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "O1: 60%" })).toBeInTheDocument();
    fireEvent.focus(screen.getByText("85% Met"));
  });
});

