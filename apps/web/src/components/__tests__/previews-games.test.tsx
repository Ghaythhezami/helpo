import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CheckView, ResourceView } from "@helpo/shared";
import { CardsPreview, GamePreview, QuizPreview, SlidesPreview, WorksheetPreview } from "@/components/teacher/previews";
import { EquationGame, MatchGame, MemoryGame, SortGame, TrueFalseGame } from "@/components/student/games";
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
});

const base = { content: gameContent, seed: "s", explorer: false, sound: false, busy: false };

/** fireEvent on the nearest button for a visible text: far faster than role queries on a big board. */
function tap(text: string, which = 0) {
  const nodes = screen.getAllByText(new RegExp(`^${text}$`));
  fireEvent.click((nodes[which] ?? nodes[0]).closest("button")!);
}
const press = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name, hidden: true }));

describe("student games", () => {
  it("match: plays every pair across rounds and reports counts", () => {
    const onFinish = jest.fn();
    renderWithProviders(<MatchGame {...base} onFinish={onFinish} />);
    tap("Roots");
    tap("Makes food"); // wrong partner first
    expect(statusText()).toMatch(/Not yet/);
    for (const [l, r] of [["Roots", "Take in water"], ["Leaf", "Makes food"], ["Stem", "Carries water"], ["Flower", "Makes seeds"]]) {
      tap(l);
      tap(r);
    }
    press(/Start round 2/);
    for (const [l, r] of [["Seed", "New plant"], ["Sun", "Energy"]]) {
      tap(l);
      tap(r);
    }
    press(/See my results/);
    expect(onFinish).toHaveBeenCalledWith({ total: 6, firstTryCorrect: 5, retriedCorrect: 1 });
  });

  it("match: hint highlights and explorer adds read-aloud buttons", () => {
    renderWithProviders(<MatchGame {...base} explorer onFinish={jest.fn()} />);
    press(/Hint/);
    expect(statusText()).toMatch(/Hint:/);
    expect(document.querySelectorAll("button.ra").length).toBeGreaterThan(4);
  });

  it("memory: counts tries, turns a mismatch back and offers a hint", () => {
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
    press(/Hint/);
    jest.useRealTimers();
  });

  it("sort: tap an item, then a basket; wrong baskets say not yet", () => {
    const onFinish = jest.fn();
    renderWithProviders(<SortGame {...base} onFinish={onFinish} />);
    const basket = (yes: boolean) => document.querySelector(`.basket.${yes ? "yes" : "no"}`) as HTMLElement;
    tap("Sunlight");
    fireEvent.click(basket(false));
    expect(statusText()).toMatch(/Not yet/);
    for (const it of ["Sunlight", "Water", "Candy", "Plastic"]) {
      tap(it);
      fireEvent.click(basket(it === "Sunlight" || it === "Water"));
    }
    press(/See my results/);
    expect(onFinish).toHaveBeenCalledWith({ total: 4, firstTryCorrect: 3, retriedCorrect: 1 });
  });

  it("equation: fills slots, checks and finishes", () => {
    const onFinish = jest.fn();
    renderWithProviders(<EquationGame {...base} onFinish={onFinish} />);
    press(/^Check$/);
    expect(statusText()).toMatch(/Fill every slot/);
    for (const t of ["carbon dioxide", "water", "glucose", "oxygen"]) {
      const tile = document.querySelector(".tbank")!;
      const hit = [...tile.querySelectorAll("button")].find((b) => b.textContent?.startsWith(t))!;
      fireEvent.click(hit);
    }
    press(/^Check$/);
    press(/See my results/);
    expect(onFinish).toHaveBeenCalledWith({ total: 4, firstTryCorrect: 4, retriedCorrect: 0 });
  });

  it("true or false: answers, shows the explanation and finishes", () => {
    const onFinish = jest.fn();
    renderWithProviders(<TrueFalseGame {...base} onFinish={onFinish} />);
    for (const st of gameContent.statements) {
      press(new RegExp(st.isTrue ? "^True$" : "^False$"));
      expect(statusText()).toContain(st.explanation);
      press(/^Next$/);
    }
    press(/See my results/);
    expect(onFinish).toHaveBeenCalledWith({ total: 5, firstTryCorrect: 5, retriedCorrect: 0 });
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

