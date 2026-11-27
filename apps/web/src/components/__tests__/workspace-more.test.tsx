import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Workspace } from "@/components/teacher/workspace";
import { itemRows } from "@/components/teacher/workspace";
import { cardsContent, gameContent, lesson, quizContent, resource, results, slidesContent, worksheetContent } from "@/test/fixtures";
import { mockFetch, renderWithProviders } from "@/test/utils";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: push, refresh: jest.fn() }), usePathname: () => "/app/lessons/l1", useSearchParams: () => new URLSearchParams("tab=quiz") }));
jest.setTimeout(60000);

let narrow = false;
beforeEach(() => {
  push.mockReset();
  narrow = false;
  window.matchMedia = ((query: string) => ({ matches: narrow, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});

const base = (l = lesson()) => ({ "GET /lessons/l1": () => ({ body: l }) });
const open = async (l = lesson(), extra: Record<string, () => { status?: number; body?: unknown }> = {}) => {
  const fetchMock = mockFetch({ ...base(l), ...extra });
  renderWithProviders(<Workspace id="l1" />, { scope: "teacher" });
  await screen.findByRole("heading", { level: 1 });
  return fetchMock;
};
const statusText = () => screen.getAllByRole("status").map((e) => e.textContent).join(" | ");

describe("workspace states", () => {
  it("opens on the tab named in the link and shows a loading then an error state", async () => {
    mockFetch({ "GET /lessons/l1": () => ({ status: 404, body: { title: "Not found", status: 404 } }) });
    renderWithProviders(<Workspace id="l1" />, { scope: "teacher" });
    expect(await screen.findByRole("alert")).toHaveTextContent(/We couldn't find that/);
  });

  it("starts on the quiz tab from ?tab=quiz", async () => {
    await open();
    expect(screen.getByRole("tab", { name: /Quiz/ })).toHaveAttribute("aria-selected", "true");
  });

  it("shows waiting, working, failed and missing resources honestly", async () => {
    await open(lesson({ resources: [resource("SLIDES", slidesContent), resource("QUIZ", null, { status: "WORKING" }), resource("WORKSHEET", null, { status: "FAILED", error: "The model timed out" })] }));
    expect(screen.getByText("Making it", { selector: "b" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Worksheet/ }));
    expect(screen.getByText("The model timed out")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Cards/ }));
    expect(screen.getByText("This resource wasn't made")).toBeInTheDocument();
  });

  it("downloads only what a resource supports and shows no Download for a game", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: /Download/ }));
    expect(screen.getByRole("link", { name: "PDF with answers" })).toHaveAttribute("href", "/api/resources/r-QUIZ/export?format=pdf&key=true");
    expect(screen.getByRole("link", { name: "PDF for students" })).toHaveAttribute("download");
    await userEvent.click(screen.getByRole("button", { name: /Download/ }));
    expect(screen.queryByRole("link", { name: "PDF for students" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Game/ }));
    expect(screen.getByRole("button", { name: /Download/ })).toBeDisabled();
  });

  it("opens the understood dialog without a blueprint and the results dialog from the header and from the phone bottom bar", async () => {
    await open(lesson({ blueprint: null }), { "GET /lessons/l1/results": () => ({ body: results }), "GET /classes/c1": () => ({ body: { students: [] } }) });
    await userEvent.click(screen.getByRole("button", { name: "What Nibras understood" }));
    expect(await screen.findByText(/once your file is read/)).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    const results_ = screen.getAllByRole("button", { name: "Results" });
    expect(results_).toHaveLength(2); // the header and the phone bottom bar, never the navigation
    await userEvent.click(results_[0]);
    expect(await screen.findByText("What to do next")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("What to do next")).toBeNull());
    await userEvent.click(results_[1]);
    expect(await screen.findByText("What to do next")).toBeInTheDocument();
  });
});

describe("margins and mobile", () => {
  it("collapses and restores the item list and the edit panel", async () => {
    await open();
    expect(screen.getByText(/^Items/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show or hide the item list" }));
    expect(screen.queryByText(/^Items/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show or hide the edit panel" }));
    expect(screen.queryByText("To check")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show or hide the edit panel" }));
    expect(screen.getByText("To check")).toBeInTheDocument();
  });

  it("uses the bottom bar on a phone: list and edit sheets, board and share", async () => {
    narrow = true;
    await open();
    expect(screen.queryByText("To check")).not.toBeInTheDocument();
    const bar = screen.getByRole("navigation", { name: "Workspace tools" });
    await userEvent.click(within(bar).getByRole("button", { name: /List/ }));
    const list = await screen.findByRole("dialog", { name: "Items" });
    await userEvent.click(within(list).getAllByRole("button", { name: /Which part/ })[0]);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Items" })).not.toBeInTheDocument());
    await userEvent.click(within(bar).getByRole("button", { name: /Edit/ }));
    expect(await screen.findByRole("dialog", { name: "Edit" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(within(bar).getByRole("button", { name: /Board/ }));
    expect(await screen.findByRole("dialog", { name: "Whiteboard" })).toBeInTheDocument();
    await userEvent.click(within(bar).getByRole("button", { name: /Share/ }));
    expect(await screen.findByRole("dialog", { name: "Share settings" })).toBeInTheDocument();
  });
});

describe("editing", () => {
  it("reorders by drag and drop, duplicates, and shows the item editor fields", async () => {
    const { calls } = await open(lesson(), { "PATCH /resources/r-QUIZ": () => ({ body: {} }) });
    const items = document.querySelectorAll(".ws-list li");
    fireEvent.dragStart(items[0]);
    fireEvent.dragOver(items[2]);
    fireEvent.drop(items[2]);
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect((calls.find((c) => c.method === "PATCH")!.body as { content: { questions: { id: string }[] } }).content.questions[2].id).toBe("Q1");
    await userEvent.click(screen.getByRole("button", { name: "Item 1 menu" }));
    await userEvent.click(screen.getByRole("button", { name: "Duplicate item 1" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(2));
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Edited question?" } });
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(3));
  });

  it("moves an item with Alt+arrow from the keyboard", async () => {
    const { calls } = await open(lesson(), { "PATCH /resources/r-QUIZ": () => ({ body: {} }) });
    const first = document.querySelector(".ws-list li .row-main") as HTMLElement;
    fireEvent.keyDown(first, { key: "ArrowDown", altKey: true });
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    fireEvent.keyDown(first, { key: "ArrowUp", altKey: true });
    fireEvent.keyDown(first, { key: "x" });
  });

  it("accepts, edits and dismisses checks with the keyboard and undoes from the card", async () => {
    const checks = [{ id: "k1", resource: "QUIZ", itemRef: "Q1", kind: "FACT_CHECK", message: "First", suggestion: "Better", sourcePage: 3, status: "OPEN" }, { id: "k2", resource: "QUIZ", itemRef: "Q2", kind: "ORDER", message: "Second", suggestion: null, sourcePage: null, status: "OPEN" }];
    const { calls } = await open(lesson({ checks: checks as never }), { "PATCH /checks/k1": () => ({ body: {} }), "PATCH /checks/k2": () => ({ body: {} }) });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "e" });
    const textarea = await screen.findByLabelText("Edit Quiz Q1");
    fireEvent.change(textarea, { target: { value: "My text" } });
    await userEvent.click(screen.getAllByRole("button", { name: "Save edit" })[0]);
    await waitFor(() => expect(calls.some((c) => c.path === "/checks/k1" && (c.body as { status: string }).status === "EDITED")).toBe(true));
    fireEvent.keyDown(window, { key: "d" });
    await waitFor(() => expect(calls.some((c) => c.path === "/checks/k1" && (c.body as { status: string }).status === "DISMISSED")).toBe(true));
    fireEvent.keyDown(window, { key: "a" });
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH" && c.path.startsWith("/checks")).length).toBeGreaterThan(2));
    // typing in a field never triggers a shortcut
    const before = calls.length;
    fireEvent.keyDown(screen.getByLabelText("Ask Nibras"), { key: "a" });
    expect(calls.length).toBe(before);
  });

  it("rewrites the selected passage and offers Undo; says so when the text can't be found", async () => {
    let returned = "Which organ catches light?";
    const { calls } = await open(lesson(), { "POST /resources/r-QUIZ/rewrite": () => ({ body: { text: returned } }), "PATCH /resources/r-QUIZ": () => ({ body: {} }) });
    const select = (text: string) => {
      const stage = document.querySelector(".ws-stage")!;
      window.getSelection = (() => ({ toString: () => text, anchorNode: stage.firstChild ?? stage })) as unknown as typeof window.getSelection;
      act(() => { document.dispatchEvent(new Event("selectionchange")); });
    };
    select("Which part catches light?");
    expect(statusText()).toMatch(/Selected: Which part catches light\?/);
    await userEvent.click(screen.getByRole("button", { name: "Simpler" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(JSON.stringify(calls.find((c) => c.method === "PATCH")!.body)).toContain("Which organ catches light?");
    select("A passage that is not there");
    returned = "x";
    await userEvent.click(screen.getByRole("button", { name: "Translate" }));
    await waitFor(() => expect(statusText()).toMatch(/couldn't find that text/));
  });

  it("without a selection the quick chips fill the ask box; asking sends a change request with Undo", async () => {
    const { calls } = await open(lesson(), { "POST /resources/r-QUIZ/change": () => ({ body: { summary: "Made it easier", resource: resource("QUIZ", quizContent) } }), "PATCH /resources/r-QUIZ": () => ({ body: {} }) });
    window.getSelection = (() => ({ toString: () => "" })) as unknown as typeof window.getSelection;
    await userEvent.click(screen.getByRole("button", { name: "Add example" }));
    expect(screen.getByLabelText("Ask Nibras")).toHaveValue("Add an example to the selected text");
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/resources/r-QUIZ/change")).toBe(true));
    await userEvent.click(await screen.findByRole("button", { name: /Undo/ }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
  });

  it("shows the server error when a change request fails", async () => {
    await open(lesson(), { "POST /resources/r-QUIZ/change": () => ({ status: 500, body: { title: "x", status: 500 } }) });
    fireEvent.change(screen.getByLabelText("Ask Nibras"), { target: { value: "make it easier" } });
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => expect(statusText()).toMatch(/went wrong on our side/));
  });

  it("restores the AI original from the versions menu", async () => {
    const edited = lesson({ resources: [resource("SLIDES", slidesContent), resource("QUIZ", quizContent, { version: 3 })] });
    const { calls } = await open(edited, { "POST /resources/r-QUIZ/revert": () => ({ body: {} }) });
    await userEvent.click(screen.getByRole("button", { name: "Versions (v3)" }));
    expect(screen.getByText(/You are on version 3/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Restore AI original" }));
    await waitFor(() => expect(calls.find((c) => c.path === "/resources/r-QUIZ/revert")?.body).toEqual({ version: 1 }));
  });
});

describe("translation inside the workspace", () => {
  it("starts the translation once when the viewer's language is missing and shows the banner", async () => {
    const missing = lesson({ translations: { en: "ready", ar: "missing" } });
    const fetchMock = mockFetch({ ...base(missing), "POST /lessons/l1/translate": () => ({ status: 202, body: {} }) });
    renderWithProviders(<Workspace id="l1" />, { scope: "teacher", locale: "ar" });
    await waitFor(() => expect(fetchMock.calls.filter((c) => c.path === "/lessons/l1/translate")).toHaveLength(1));
    expect(await screen.findByText(/نترجم هذا الدرس/)).toBeInTheDocument();
  });

  it("offers Try again when the translation could not start", async () => {
    const missing = lesson({ translations: { en: "ready", ar: "missing" } });
    mockFetch({ ...base(missing), "POST /lessons/l1/translate": () => ({ status: 500, body: { title: "x", status: 500 } }) });
    renderWithProviders(<Workspace id="l1" />, { scope: "teacher", locale: "ar" });
    expect(await screen.findByText("لم تبدأ الترجمة.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "حاول مرة أخرى" }));
  });
});

describe("item rows", () => {
  const t = (k: string) => k;
  it("lists the editable items of every resource kind", () => {
    expect(itemRows(resource("SLIDES", slidesContent), t as never)).toHaveLength(7);
    expect(itemRows(resource("WORKSHEET", worksheetContent), t as never)).toHaveLength(2);
    expect(itemRows(resource("QUIZ", quizContent), t as never)).toHaveLength(3);
    expect(itemRows(resource("CARDS", cardsContent), t as never)).toHaveLength(3);
    expect(itemRows(resource("GAME", gameContent), t as never).length).toBe(6 + 4 + 5);
    expect(itemRows(undefined, t as never)).toEqual([]);
    expect(itemRows(resource("SLIDES", null), t as never)).toEqual([]);
  });
});
