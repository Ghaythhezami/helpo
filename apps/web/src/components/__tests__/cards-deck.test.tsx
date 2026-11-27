import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardsDeck, CardsGrid, CardsPreview } from "@/components/teacher/cards-deck";
import { cardsContent, resource } from "@/test/fixtures";
import { renderWithProviders } from "@/test/utils";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

const cards = cardsContent.cards as never;
const cardBtn = () => screen.getByRole("button", { name: /^Card \d+ of \d+/ });
const counter = () => document.querySelector(".cdk-count")?.textContent;
/** jsdom has no PointerEvent: a MouseEvent with a pointer type carries clientX to React. */
const ptr = (el: Element, type: string, clientX: number) => fireEvent(el, new MouseEvent(type, { bubbles: true, clientX }));

describe("CardsDeck", () => {
  it("flips on click and Space, and announces the face", async () => {
    renderWithProviders(<CardsDeck cards={cards} />);
    expect(cardBtn()).toHaveAttribute("aria-pressed", "false");
    expect(cardBtn()).toHaveAccessibleName(/front: Term 1/);
    await userEvent.click(cardBtn());
    expect(cardBtn()).toHaveAttribute("aria-pressed", "true");
    expect(cardBtn()).toHaveAccessibleName(/back: Meaning 1/);
    cardBtn().focus();
    await userEvent.keyboard(" ");
    expect(cardBtn()).toHaveAttribute("aria-pressed", "false");
    await userEvent.keyboard("{Enter}");
    expect(cardBtn()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("navigates with arrows, buttons and respects bounds", async () => {
    renderWithProviders(<CardsDeck cards={cards} />);
    expect(counter()).toBe("1 / 3");
    expect(screen.getByRole("button", { name: "Previous card" })).toHaveAttribute("aria-disabled", "true");
    cardBtn().focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(counter()).toBe("2 / 3");
    await userEvent.keyboard("{ArrowLeft}");
    expect(counter()).toBe("1 / 3");
    await userEvent.click(screen.getByRole("button", { name: "Next card" }));
    await userEvent.click(screen.getByRole("button", { name: "Next card" }));
    expect(counter()).toBe("3 / 3");
    await userEvent.click(screen.getByRole("button", { name: "Previous card" }));
    expect(counter()).toBe("2 / 3");
  });

  it("mirrors arrows in RTL", async () => {
    renderWithProviders(<CardsDeck cards={cards} />, { locale: "ar" });
    const btn = screen.getAllByRole("button").find((b) => b.className.includes("cdk-card"))!;
    btn.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(counter()).toBe("1 / 3");
    await userEvent.keyboard("{ArrowLeft}");
    expect(counter()).toBe("2 / 3");
    await userEvent.keyboard("{ArrowRight}");
    expect(counter()).toBe("1 / 3");
  });

  it("swipes between cards and does not flip after a swipe", () => {
    renderWithProviders(<CardsDeck cards={cards} />);
    const btn = cardBtn();
    ptr(btn, "pointerdown", 200);
    ptr(btn, "pointerup", 100);
    fireEvent.click(btn);
    expect(counter()).toBe("2 / 3");
    expect(cardBtn()).toHaveAttribute("aria-pressed", "false");
    ptr(cardBtn(), "pointerdown", 100);
    ptr(cardBtn(), "pointerup", 200);
    expect(counter()).toBe("1 / 3");
    ptr(cardBtn(), "pointerdown", 100);
    ptr(cardBtn(), "pointerup", 110);
    ptr(cardBtn(), "pointerup", 400);
    ptr(cardBtn(), "pointerdown", 100);
    fireEvent(cardBtn(), new MouseEvent("pointercancel", { bubbles: true }));
    ptr(cardBtn(), "pointerup", 400);
    expect(counter()).toBe("1 / 3");
  });

  it("shuffles without mutating the props", async () => {
    const input = [...(cards as { front: string }[])];
    const copy = JSON.stringify(input);
    renderWithProviders(<CardsDeck cards={input as never} />);
    await userEvent.click(screen.getByRole("button", { name: "Shuffle" }));
    expect(JSON.stringify(input)).toBe(copy);
    expect(counter()).toBe("1 / 3");
  });

  it("sorts cards into piles, finishes and loops over the review pile", async () => {
    renderWithProviders(<CardsDeck cards={cards} />);
    const got = () => screen.getByRole("button", { name: "Got it" });
    expect(got()).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(got());
    expect(counter()).toBe("1 / 3");
    await userEvent.click(cardBtn());
    await userEvent.click(got());
    expect(screen.getByText("Got it: 1")).toBeInTheDocument();
    await userEvent.click(cardBtn());
    await userEvent.click(screen.getByRole("button", { name: "Review again" }));
    await userEvent.click(cardBtn());
    await userEvent.click(screen.getByRole("button", { name: "Review again" }));
    expect(screen.getByText(/1 got it, 2 to review again/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Review the 2 cards again" }));
    expect(screen.getByText("Review round 1")).toBeInTheDocument();
    expect(counter()).toBe("1 / 2");
    await userEvent.click(cardBtn());
    await userEvent.click(got());
    await userEvent.click(cardBtn());
    await userEvent.click(got());
    expect(screen.getByText("You have got every card. Well done!")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Review the/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(counter()).toBe("1 / 3");
    expect(screen.getByText("Got it: 0")).toBeInTheDocument();
  });

  it("renders an empty state", () => {
    renderWithProviders(<CardsDeck cards={[]} />);
    expect(screen.getByText("There are no cards yet.")).toBeInTheDocument();
  });
});

describe("CardsGrid and CardsPreview", () => {
  it("lists every card with scroll ids", () => {
    renderWithProviders(<CardsGrid cards={[...(cards as never[]), { front: "F", back: "B", tag: "fact" }] as never} />);
    expect(document.getElementById("item-cards-0")).toBeInTheDocument();
    expect(within(document.getElementById("item-cards-3")!).getByText("B")).toBeInTheDocument();
  });

  it("toggles deck and grid and links the PDF export", async () => {
    const r = resource("CARDS", cardsContent);
    renderWithProviders(<CardsPreview resource={r} />);
    expect(screen.getByRole("radio", { name: "Deck" })).toHaveAttribute("aria-checked", "true");
    expect(document.getElementById("item-cards-0")).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: "Grid" }));
    expect(document.getElementById("item-cards-2")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Grid" })).toHaveAttribute("aria-checked", "true");
    const link = screen.getByRole("link", { name: "Print cards grid (PDF)" });
    expect(link).toHaveAttribute("href", "/api/resources/r-CARDS/export?format=pdf");
    expect(link).toHaveAttribute("download");
    await userEvent.click(screen.getByRole("radio", { name: "Deck" }));
    expect(screen.getByRole("group", { name: "Flash cards" })).toBeInTheDocument();
  });
});
