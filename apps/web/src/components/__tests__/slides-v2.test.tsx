import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CheckView, ResourceView, SlidesContent } from "@helpo/shared";
import { migrateSlides } from "@helpo/shared";
import { SlideBody, SlidesPreview, slideTextLength } from "@/components/teacher/previews";
import { ItemEditor } from "@/components/teacher/item-editor";
import { buildSlidePatch, slideDraft } from "@/lib/content-edit";
import { resource, slidesContent } from "@/test/fixtures";
import { renderWithProviders } from "@/test/utils";
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));
jest.setTimeout(60000);

const deck = migrateSlides(slidesContent as unknown as SlidesContent);
const at = (i: number) => deck.slides[i];
const noop = () => undefined;
const r = () => resource("SLIDES", slidesContent) as ResourceView;
const preview = (props: Partial<React.ComponentProps<typeof SlidesPreview>> = {}, locale: "en" | "ar" = "en") =>
  renderWithProviders(<SlidesPreview resource={r()} checks={[]} onSave={noop} onOpenCheck={noop} {...props} />, { locale });

describe("SlideBody layouts", () => {
  it("renders the title hero with subtitle chip, hook card and emoji badge", () => {
    renderWithProviders(<SlideBody slide={at(0)} index={0} total={7} />);
    const frame = screen.getByTestId("slide-frame");
    expect(frame).toHaveAttribute("role", "group");
    expect(frame).toHaveAttribute("aria-roledescription", "slide");
    expect(frame).toHaveAttribute("aria-label", "Slide 1 of 7: Photosynthesis");
    expect(frame).toHaveAttribute("data-layout", "title");
    expect(screen.getByText("How plants make food")).toBeInTheDocument();
    expect(screen.getByText("Where does a tree get its food?")).toBeInTheDocument();
    expect(frame.querySelector(".nsl-emoji")).toHaveTextContent("🌱");
  });

  it("renders bullets with a key idea callout", () => {
    renderWithProviders(<SlideBody slide={at(1)} />);
    expect(screen.getByText("Plants need three things to make food")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByTestId("slide-frame")).toHaveAttribute("aria-label", "What plants need");
  });

  it("renders two columns with heading bars and a vs badge, and falls back to bullets without columns", () => {
    const { unmount } = renderWithProviders(<SlideBody slide={at(2)} />);
    expect(screen.getByRole("heading", { level: 5, name: "Leaves" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 5, name: "Roots" })).toBeInTheDocument();
    expect(screen.getByText("vs")).toBeInTheDocument();
    unmount();
    renderWithProviders(<SlideBody slide={{ ...at(2), columns: null, bullets: ["x", "y"] }} />);
    expect(screen.queryByText("vs")).not.toBeInTheDocument();
    expect(screen.getByText("x")).toBeInTheDocument();
  });

  it("renders a definition with the term, meaning and a labelled example", () => {
    renderWithProviders(<SlideBody slide={at(3)} />);
    expect(screen.getByRole("heading", { level: 4, name: "Chlorophyll" })).toBeInTheDocument();
    expect(screen.getByText("Green part.")).toBeInTheDocument();
    expect(screen.getByText("Example")).toBeInTheDocument();
    expect(screen.getByText("More.")).toBeInTheDocument();
  });

  it("renders numbered process steps, hides numeric step titles and wraps six steps in three columns", () => {
    const { unmount } = renderWithProviders(<SlideBody slide={at(4)} />);
    const steps = screen.getAllByRole("listitem");
    expect(steps).toHaveLength(2);
    expect(within(steps[0]).getByText("1")).toBeInTheDocument();
    expect(within(steps[0]).getByText("Light comes in")).toBeInTheDocument();
    unmount();
    const six = { ...at(4), steps: Array.from({ length: 6 }, (_, i) => ({ title: `${i + 1}`, detail: `Detail ${i + 1}` })) };
    const view = renderWithProviders(<SlideBody slide={six} />);
    expect(view.container.querySelector(".nsl-steps")).toHaveAttribute("data-cols", "3");
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.queryByText("2", { selector: "b" })).not.toBeInTheDocument();
  });

  it("renders summary takeaways and the exit ticket strip", () => {
    renderWithProviders(<SlideBody slide={at(6)} />);
    expect(screen.getByText("Key takeaways")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Exit ticket")).toBeInTheDocument();
    expect(screen.getByText("Name one thing a plant needs.")).toBeInTheDocument();
  });

  it("sizes type by content length", () => {
    const long = { ...at(1), bullets: Array.from({ length: 5 }, () => "x".repeat(90)) };
    expect(slideTextLength(long)).toBeGreaterThan(420);
    renderWithProviders(<SlideBody slide={long} />);
    expect(screen.getByTestId("slide-frame")).toHaveAttribute("data-fit", "tight");
  });

  it("falls back to bullets for empty definition, process and summary, and for an unknown layout", () => {
    for (const s of [
      { ...at(3), term: null, definition: null, example: null, bullets: ["fallback one"] },
      { ...at(4), steps: null, bullets: ["fallback one"] },
      { ...at(6), takeaways: null, bullets: ["fallback one"] },
    ]) {
      const { unmount } = renderWithProviders(<SlideBody slide={s} />);
      expect(screen.getByText("fallback one")).toBeInTheDocument();
      unmount();
    }
  });

  it("renders in Arabic with Arabic labels (RTL)", () => {
    renderWithProviders(<SlideBody slide={at(5)} index={5} total={7} />, { locale: "ar" });
    expect(screen.getByTestId("slide-frame")).toHaveAttribute("aria-label", "الشريحة 6 من 7: Quick quiz");
    expect(screen.getByRole("button", { name: "أظهر الإجابة" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "خيارات الإجابة" })).toBeInTheDocument();
  });

  it("renders an old v1 slide, migrated, without breaking", () => {
    const v1 = {
      deckTitle: "Old",
      slides: [
        { layout: "definition", title: "Cell", bullets: ["The basic unit of life.", "A leaf cell."], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: [] },
        { layout: "twoColumn", title: "Plant vs animal", bullets: ["a", "b", "c", "d"], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: [] },
        { layout: "process", title: "Steps", bullets: ["First", "Second"], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: [] },
        { layout: "quizBreak", title: "Quick check", bullets: ["Is a cell alive?"], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: [] },
        { layout: "summary", title: "Remember", bullets: ["One", "Two", "Three"], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: [] },
        { layout: "title", title: "Cells", bullets: ["Grade 6"], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: [] },
      ],
    };
    renderWithProviders(<SlidesPreview resource={resource("SLIDES", v1)} checks={[]} onSave={noop} onOpenCheck={noop} />);
    const thumbs = screen.getAllByRole("button", { name: /^S\d / });
    expect(screen.getByText("The basic unit of life.")).toBeInTheDocument();
    return (async () => {
      for (let i = 1; i < thumbs.length; i++) await userEvent.click(thumbs[i]);
      expect(screen.getByText("Grade 6")).toBeInTheDocument();
      await userEvent.click(thumbs[3]);
      expect(screen.getByText("Is a cell alive?")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reveal answer" })).not.toBeInTheDocument();
      await userEvent.click(thumbs[2]);
      expect(screen.getByText("Second")).toBeInTheDocument();
    })();
  });
});

describe("quiz reveal", () => {
  it("hides the answer until the teacher reveals it, then marks it with icon and text", async () => {
    renderWithProviders(<SlideBody slide={at(5)} />);
    const options = screen.getAllByRole("button", { name: /Leaf|Root|Stem/ });
    expect(options).toHaveLength(3);
    for (const o of options) expect(o).not.toHaveAttribute("data-state");
    expect(screen.queryByText("Correct answer")).not.toBeInTheDocument();
    expect(screen.queryByText("Leaves hold the chlorophyll")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
    expect(options[0]).toHaveAttribute("data-state", "correct");
    expect(within(options[0]).getByText("Correct answer")).toBeInTheDocument();
    expect(options[1]).toHaveAttribute("data-state", "dim");
    expect(screen.getByText("Leaves hold the chlorophyll")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hide answer" }));
    expect(options[0]).not.toHaveAttribute("data-state");
  });

  it("lets the teacher pick a tile without hinting the answer", async () => {
    renderWithProviders(<SlideBody slide={at(5)} />);
    const root = screen.getByRole("button", { name: /Root/ });
    await userEvent.click(root);
    expect(root).toHaveAttribute("aria-pressed", "true");
    expect(root).toHaveAttribute("data-state", "picked");
    await userEvent.click(root);
    expect(root).toHaveAttribute("aria-pressed", "false");
  });

  it("resets when the slide changes", async () => {
    const other = { ...at(5), title: "Another quiz", question: "Which part drinks water?", options: ["Root", "Leaf"], answerIndex: 0 };
    const view = renderWithProviders(<SlideBody slide={at(5)} />);
    await userEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
    expect(screen.getByRole("button", { name: "Hide answer" })).toBeInTheDocument();
    view.rerender(<SlideBody slide={other} />);
    expect(screen.getByRole("button", { name: "Reveal answer" })).toBeInTheDocument();
    expect(screen.queryByText("Correct answer")).not.toBeInTheDocument();
  });

  it("supports a controlled reveal and a bad answerIndex", async () => {
    const onReveal = jest.fn();
    const view = renderWithProviders(<SlideBody slide={at(5)} revealed onReveal={onReveal} />);
    expect(screen.getByText("Correct answer")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hide answer" }));
    expect(onReveal).toHaveBeenCalledWith(false);
    view.rerender(<SlideBody slide={{ ...at(5), answerIndex: 9 }} revealed />);
    expect(screen.queryByRole("button", { name: /answer/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Correct answer")).not.toBeInTheDocument();
  });

  it("resets the reveal when paging slides in the preview", async () => {
    preview({ activeIndex: undefined });
    await userEvent.click(screen.getByRole("button", { name: /^S6 / }));
    await userEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
    expect(screen.getByText("Leaves hold the chlorophyll")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^S7 / }));
    await userEvent.click(screen.getByRole("button", { name: /^S6 / }));
    expect(screen.queryByText("Leaves hold the chlorophyll")).not.toBeInTheDocument();
  });
});

describe("SlidesPreview", () => {
  it("shows the stage, the speaker note and the empty state", () => {
    const { unmount } = preview({ activeIndex: 0 });
    expect(screen.getByTestId("slide-frame")).toHaveAttribute("aria-label", "Slide 1 of 7: Photosynthesis");
    expect(screen.getByText("Welcome.")).toBeInTheDocument();
    unmount();
    renderWithProviders(<SlidesPreview resource={resource("SLIDES", { deckTitle: "x", slides: [] })} checks={[]} onSave={noop} onOpenCheck={noop} />);
    expect(screen.getByText("Nothing to show yet.")).toBeInTheDocument();
  });

  it("wraps the heading of a flagged slide in the check button", async () => {
    const onOpen = jest.fn();
    const check: CheckView = { id: "k", resource: "SLIDES", itemRef: "S6", kind: "FACT_CHECK", message: "m", suggestion: null, sourcePage: null, status: "OPEN" };
    renderWithProviders(<SlidesPreview resource={r()} checks={[check]} onSave={noop} onOpenCheck={onOpen} activeIndex={5} />);
    await userEvent.click(screen.getByRole("button", { name: /flagged/ }));
    expect(onOpen).toHaveBeenCalledWith(check);
  });

  it("marks the stage with a slide direction when paging", async () => {
    preview();
    expect(document.querySelector(".nsl-stage")).not.toHaveAttribute("data-dir");
    await userEvent.click(screen.getByRole("button", { name: /^S2 / }));
    expect(document.querySelector(".nsl-stage")).toHaveAttribute("data-dir", "fwd");
    await userEvent.click(screen.getByRole("button", { name: /^S1 / }));
    expect(document.querySelector(".nsl-stage")).toHaveAttribute("data-dir", "back");
  });
});

describe("Present mode", () => {
  const open = async (locale: "en" | "ar" = "en") => {
    const onIndex = jest.fn();
    const view = preview({ activeIndex: 1, onIndex }, locale);
    const button = screen.getByTestId("slide-present");
    button.focus();
    await userEvent.click(button);
    return { onIndex, view, button };
  };

  it("opens a modal dialog with the same slide, closes with Esc and returns focus", async () => {
    const { button } = await open();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Presenting: Photosynthesis");
    expect(within(dialog).getByTestId("slide-frame")).toHaveAttribute("aria-label", "Slide 2 of 7: What plants need");
    expect(dialog).toHaveFocus();
    expect(within(dialog).getByText("2 / 7")).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("closes with the exit button", async () => {
    await open();
    await userEvent.click(screen.getByTestId("slide-exit"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("navigates with arrows, PageDown/PageUp, Space, Home and End, and with the buttons", async () => {
    const { onIndex } = await open();
    const dialog = screen.getByRole("dialog");
    const key = (k: string) => fireEvent.keyDown(dialog, { key: k });
    key("ArrowRight");
    expect(onIndex).toHaveBeenLastCalledWith(2);
    key("ArrowLeft");
    expect(onIndex).toHaveBeenLastCalledWith(0);
    key("PageDown");
    expect(onIndex).toHaveBeenLastCalledWith(2);
    key("PageUp");
    expect(onIndex).toHaveBeenLastCalledWith(0);
    key(" ");
    expect(onIndex).toHaveBeenLastCalledWith(2);
    key("Home");
    expect(onIndex).toHaveBeenLastCalledWith(0);
    key("End");
    expect(onIndex).toHaveBeenLastCalledWith(6);
    key("q");
    await userEvent.click(within(dialog).getByRole("button", { name: "Next slide" }));
    expect(onIndex).toHaveBeenLastCalledWith(2);
    await userEvent.click(within(dialog).getByRole("button", { name: "Previous slide" }));
    expect(onIndex).toHaveBeenLastCalledWith(0);
  });

  it("swaps the arrow keys in RTL", async () => {
    const { onIndex } = await open("ar");
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(onIndex).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(onIndex).toHaveBeenLastCalledWith(0);
    expect(screen.getByRole("button", { name: "الخروج من ملء الشاشة" })).toBeInTheDocument();
  });

  it("lets Space and Enter act on a focused button, and traps Tab inside", async () => {
    const { onIndex } = await open();
    const dialog = screen.getByRole("dialog");
    const exit = within(dialog).getByTestId("slide-exit");
    fireEvent.keyDown(exit, { key: " " });
    expect(onIndex).not.toHaveBeenCalled();
    fireEvent.keyDown(exit, { key: "Enter" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const buttons = within(dialog).getAllByRole("button").filter((b) => !(b as HTMLButtonElement).disabled);
    const lastButton = buttons[buttons.length - 1];
    lastButton.focus();
    fireEvent.keyDown(lastButton, { key: "Tab" });
    expect(buttons[0]).toHaveFocus();
    fireEvent.keyDown(buttons[0], { key: "Tab", shiftKey: true });
    expect(lastButton).toHaveFocus();
    dialog.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(lastButton).toHaveFocus();
    fireEvent.keyDown(lastButton, { key: "Tab", shiftKey: true });
    expect(lastButton).toHaveFocus();
  });

  it("reveals the quiz answer inside present mode", async () => {
    preview({ activeIndex: 5 });
    await userEvent.click(screen.getByTestId("slide-present"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText("Correct answer")).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByTestId("slide-reveal"));
    expect(within(dialog).getByText("Correct answer")).toBeInTheDocument();
    expect(within(dialog).getByText("Leaves hold the chlorophyll")).toBeInTheDocument();
  });

  it("clamps at the first and last slide and disables the end buttons", async () => {
    preview({ activeIndex: 6 });
    await userEvent.click(screen.getByTestId("slide-present"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Next slide" })).toBeDisabled();
    expect(within(dialog).getByText("7 / 7")).toBeInTheDocument();
  });

  it("tries full screen, exits it on close and closes when the browser leaves full screen", async () => {
    const request = jest.fn(() => {
      Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => document.body });
      return Promise.resolve();
    });
    const exit = jest.fn(() => {
      Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => null });
      return Promise.resolve();
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: request });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
    try {
      preview({ activeIndex: 0 });
      await userEvent.click(screen.getByTestId("slide-present"));
      await act(async () => { await Promise.resolve(); });
      expect(request).toHaveBeenCalled();
      Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => null });
      act(() => { document.dispatchEvent(new Event("fullscreenchange")); });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await userEvent.click(screen.getByTestId("slide-present"));
      await act(async () => { await Promise.resolve(); });
      await userEvent.click(screen.getByTestId("slide-exit"));
      expect(exit).toHaveBeenCalled();
    } finally {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).requestFullscreen;
      delete (document as unknown as Record<string, unknown>).exitFullscreen;
      delete (document as unknown as Record<string, unknown>).fullscreenElement;
    }
  });

  it("ignores a failing or throwing requestFullscreen", async () => {
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: () => Promise.reject(new Error("denied")) });
    try {
      preview({ activeIndex: 0 });
      await userEvent.click(screen.getByTestId("slide-present"));
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    } finally {
      Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: () => { throw new Error("nope"); } });
    }
    try {
      preview({ activeIndex: 0 });
      await userEvent.click(screen.getAllByTestId("slide-present")[0]);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    } finally {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).requestFullscreen;
    }
  });
});

describe("slide editor fields", () => {
  const save = async (index: number, edit: () => void | Promise<void>) => {
    const onSave = jest.fn();
    const view = renderWithProviders(<ItemEditor resource={r()} index={index} onSave={onSave} />);
    await edit();
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    view.unmount();
    return onSave.mock.calls[0][0].slides[index];
  };
  const change = (label: string | RegExp, value: string): void => { fireEvent.change(screen.getByLabelText(label), { target: { value } }); };

  it("edits subtitle, hook and notes of a title slide", async () => {
    const s = await save(0, () => {
      change("Subtitle", "Grade 5");
      change("Hook question", "Why is grass green?");
      change("Speaker notes", "  Say hi  ");
    });
    expect(s).toMatchObject({ subtitle: "Grade 5", question: "Why is grass green?", speakerNotes: "Say hi", layout: "title" });
    expect(s.emoji).toBe("🌱");
  });

  it("edits key idea and bullets", async () => {
    const s = await save(1, () => {
      change("Key idea", "  New idea ");
      change(/Text/, "One\n\n Two \nThree");
    });
    expect(s).toMatchObject({ keyIdea: "New idea", bullets: ["One", "Two", "Three"] });
  });

  it("edits both columns of a twoColumn slide", async () => {
    const s = await save(2, () => {
      change("Column 1 heading", "Top");
      change("Column 1 points (one per line)", "p\nq");
      change("Column 2 heading", "Bottom");
      change("Column 2 points (one per line)", "r");
    });
    expect(s.columns).toEqual([{ heading: "Top", points: ["p", "q"] }, { heading: "Bottom", points: ["r"] }]);
  });

  it("edits term, definition and example, clearing an empty example to null", async () => {
    const s = await save(3, () => {
      change("Term", "Stomata");
      change("Definition", "Tiny pores");
      change("Example", "   ");
    });
    expect(s).toMatchObject({ term: "Stomata", definition: "Tiny pores", example: null });
  });

  it("edits process steps as title | detail lines", async () => {
    const s = await save(4, () => change(/^Steps/, "Light | Comes in\nSugar\n\nAir | Goes out | fast"));
    expect(s.steps).toEqual([{ title: "Light", detail: "Comes in" }, { title: "Sugar", detail: "" }, { title: "Air", detail: "Goes out | fast" }]);
  });

  it("edits a quiz break: question, options, correct answer and explanation", async () => {
    const s = await save(5, async () => {
      change("Question", "Which part holds water?");
      change(/^Answer options/, "Root\nLeaf\nStem\nSeed");
      await userEvent.click(screen.getByRole("radio", { name: /C\. Stem/ }));
      change("Key idea", "Stems carry water");
    });
    expect(s).toMatchObject({ question: "Which part holds water?", options: ["Root", "Leaf", "Stem", "Seed"], answerIndex: 2, keyIdea: "Stems carry water" });
  });

  it("keeps answerIndex inside the options and clears everything when options are removed", async () => {
    const shrunk = await save(5, async () => {
      await userEvent.click(screen.getByRole("radio", { name: /C\. Stem/ }));
      change(/^Answer options/, "Leaf\nRoot");
    });
    expect(shrunk.options).toEqual(["Leaf", "Root"]);
    expect(shrunk.answerIndex).toBeNull();
    const cleared = await save(5, () => change(/^Answer options/, ""));
    expect(cleared.options).toBeNull();
    expect(cleared.answerIndex).toBeNull();
  });

  it("edits summary takeaways and the exit ticket", async () => {
    const s = await save(6, () => {
      change(/^Key takeaways/, "A\nB\nC");
      change("Exit ticket question", "What did you learn?");
    });
    expect(s).toMatchObject({ takeaways: ["A", "B", "C"], question: "What did you learn?" });
  });

  it("shows the layout name and renders nothing for a missing slide", () => {
    const onSave = jest.fn();
    const view = renderWithProviders(<ItemEditor resource={r()} index={3} onSave={onSave} />);
    expect(screen.getByText("Layout: Definition")).toBeInTheDocument();
    view.unmount();
    const none = renderWithProviders(<ItemEditor resource={r()} index={40} onSave={onSave} />);
    expect(none.container.querySelector("form")).toBeNull();
  });

  it("keeps a v1 twoColumn slide without columns unchanged when nothing is typed", () => {
    const v1 = migrateSlides({ deckTitle: "d", slides: [{ layout: "twoColumn", title: "T", bullets: ["only"], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: [] }] }).slides[0];
    expect(v1.columns).toBeNull();
    expect(buildSlidePatch(v1, slideDraft(v1)).columns).toBeNull();
    const bad = { ...at(5), answerIndex: null };
    expect(buildSlidePatch(bad, { ...slideDraft(bad), answerIndex: -1 }).answerIndex).toBeNull();
  });
});

describe("messages", () => {
  it("has every slide.* key in both languages", () => {
    const keys = Object.keys(en).filter((k) => k.startsWith("slide."));
    expect(keys.length).toBeGreaterThan(40);
    for (const k of keys) expect(ar).toHaveProperty([k]);
  });
});
