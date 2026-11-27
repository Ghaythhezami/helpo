import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SessionTeacherView } from "@helpo/shared";
import { GenerationView, generationSteps, overallPercent } from "@/components/teacher/generation-view";
import { LiveBoard } from "@/components/teacher/live-board";
import { ShareDialogBody, playableGames } from "@/components/teacher/share-dialog";
import { lesson, resource, gameContent } from "@/test/fixtures";
import { mockFetch, renderWithProviders } from "@/test/utils";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/app",
  useSearchParams: () => new URLSearchParams(""),
}));
jest.setTimeout(30000);

const generating = (n: number) => {
  const kinds = ["SLIDES", "WORKSHEET", "QUIZ", "CARDS", "GAME"] as const;
  return lesson({
    status: "GENERATING",
    checks: [],
    resources: kinds.slice(0, n + 1).map((k, i) => resource(k, null, { status: i < n ? "READY" : "WORKING", progress: i < n ? 100 : 40 })),
  });
};

describe("generation steps (pure)", () => {
  it("lists the five steps in order with their own state", () => {
    const steps = generationSteps(generating(2));
    expect(steps.map((s) => s.kind)).toEqual(["SLIDES", "WORKSHEET", "QUIZ", "CARDS", "GAME"]);
    expect(steps.map((s) => s.status)).toEqual(["done", "done", "working", "waiting", "waiting"]);
    expect(steps[2].progress).toBe(40);
  });
  it("marks a failed resource and counts progress", () => {
    const steps = generationSteps(lesson({ resources: [resource("SLIDES", null, { status: "FAILED", error: "x", progress: 0 })] }));
    expect(steps[0]).toMatchObject({ status: "failed", error: "x" });
    expect(overallPercent(false, steps)).toBe(0);
    expect(overallPercent(true, generationSteps(generating(2)))).toBe(Math.round(20 + ((200 + 40) / 5) * 0.8));
  });
});

describe("GenerationView (focus lock)", () => {
  const view = (over: Partial<{ onFinished: () => void; onCancelled: () => void }> = {}) => {
    const props = { onFinished: jest.fn(), onCancelled: jest.fn(), ...over };
    renderWithProviders(<GenerationView lessonId="l1" {...props} />, { scope: "teacher" });
    return props;
  };
  afterEach(() => {
    (globalThis as { __reduceMotion?: boolean }).__reduceMotion = undefined;
  });

  it("shows the analysis step and the five steps, and lifts the lock on READY", async () => {
    mockFetch({ "GET /lessons/l1": () => ({ body: lesson({ status: "READY" }) }) });
    const { onFinished } = view();
    expect(await screen.findByRole("heading", { name: "Your lesson kit is ready" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Progress" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
    for (const name of ["Reading and understanding", "Slides", "Worksheet", "Quiz", "Cards", "Games"]) expect(within(list).getByText(name)).toBeInTheDocument();
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith("l1"), { timeout: 3000 });
  });

  it("also lifts the lock on PARTIAL (the workspace offers the retry)", async () => {
    const partial = lesson({ status: "PARTIAL", checks: [], resources: [resource("SLIDES", null), resource("WORKSHEET", null, { status: "FAILED", error: "boom", progress: 0 })] });
    mockFetch({ "GET /lessons/l1": () => ({ body: partial }) });
    const { onFinished } = view();
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith("l1"), { timeout: 3000 });
  });

  it("has no Continue in the background, ignores Esc and keeps focus inside", async () => {
    mockFetch({ "GET /lessons/l1": () => ({ body: generating(1) }) });
    const { onCancelled, onFinished } = view();
    expect(await screen.findByText(/Now making: Worksheet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /background/i })).toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onCancelled).not.toHaveBeenCalled();
    expect(onFinished).not.toHaveBeenCalled();
    const cancel = screen.getByRole("button", { name: "Cancel generation" });
    cancel.focus();
    await userEvent.tab();
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
  });

  it("announces the current step and shows its live percent and a real doing-line (animated variant)", async () => {
    (globalThis as { __reduceMotion?: boolean }).__reduceMotion = false;
    mockFetch({ "GET /lessons/l1": () => ({ body: generating(1) }) });
    const { container } = renderWithProviders(<GenerationView lessonId="l1" onFinished={jest.fn()} onCancelled={jest.fn()} />, { scope: "teacher" });
    const status = await screen.findByText(/Now making: Worksheet/);
    expect(status.closest("[aria-live]")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("progressbar", { name: "Worksheet" })).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getByText(/Worksheet|Working/, { selector: ".muted.small" })).toBeInTheDocument();
    expect(screen.getByText("Writing practice questions by level")).toBeInTheDocument();
    expect(container.querySelector("[data-variant='animated']")).not.toBeNull();
  });

  it("renders the static progress ring under reduced motion (no particles)", async () => {
    mockFetch({ "GET /lessons/l1": () => ({ body: generating(2) }) });
    const { container } = renderWithProviders(<GenerationView lessonId="l1" onFinished={jest.fn()} onCancelled={jest.fn()} />, { scope: "teacher" });
    await screen.findByText(/Now making: Quiz/);
    expect(container.querySelector("[data-variant='static']")).not.toBeNull();
    expect(container.querySelector(".gh-particles")).toBeNull();
    expect(container.querySelector(".gen-pct")).toHaveTextContent(/\d+%/);
  });

  it("cancels after a confirmation and posts /cancel", async () => {
    const { calls } = mockFetch({ "GET /lessons/l1": () => ({ body: generating(1) }), "POST /lessons/l1/cancel": () => ({ body: {} }), "GET /lessons": () => ({ body: [] }) });
    const { onCancelled } = view();
    await userEvent.click(await screen.findByRole("button", { name: "Cancel generation" }));
    expect(onCancelled).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Keep going" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel generation" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, cancel" }));
    await waitFor(() => expect(onCancelled).toHaveBeenCalled());
    expect(calls.some((c) => c.method === "POST" && c.path === "/lessons/l1/cancel")).toBe(true);
  });

  it("offers a retry for a failed step while the rest is still being made", async () => {
    const mixed = lesson({ status: "GENERATING", checks: [], resources: [resource("SLIDES", null), resource("WORKSHEET", null, { status: "FAILED", error: "boom", progress: 0 }), resource("QUIZ", null, { status: "WORKING", progress: 10 })] });
    const { calls } = mockFetch({ "GET /lessons/l1": () => ({ body: mixed }), "POST /lessons/l1/resources/WORKSHEET/retry": () => ({ body: {} }) });
    view();
    await userEvent.click(await screen.findByRole("button", { name: "Try again: Worksheet" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/lessons/l1/resources/WORKSHEET/retry")).toBe(true));
  });

  it("goes back when the material could not be read, and when the lesson no longer exists", async () => {
    mockFetch({ "GET /lessons/l1": () => ({ body: lesson({ status: "FAILED", resources: [], checks: [] }) }) });
    const { onCancelled } = view();
    await userEvent.click(await screen.findByRole("button", { name: "Back to create" }));
    expect(onCancelled).toHaveBeenCalled();
    mockFetch({ "GET /lessons/l1": () => ({ status: 404, body: { title: "Not found", status: 404 } }) });
    const gone = view();
    await waitFor(() => expect(gone.onCancelled).toHaveBeenCalled());
  });
});

describe("Share: choose the games", () => {
  const shared = (over: Partial<SessionTeacherView> = {}) =>
    ({ id: "se1", link: "http://x/join?code=482913", qrSvg: "<svg/>", isOpen: true, expiresAt: null, leaderboard: "TEAMS", lessonId: "l1", type: "ASSIGNMENT", game: "SORT", games: [], status: "LOBBY", joinCode: "482913", namesHidden: true, currentQuestion: 0, questionCount: 3, revealed: false, joined: 0, classSize: 24, answeredCurrent: 0, notAnswered: [], question: null, distribution: null, ...over }) as SessionTeacherView;

  it("lists the playable games thinking-first and defaults to the top two", () => {
    const games = playableGames(lesson());
    expect(games.slice(0, 2)).toEqual(["SORT", "EQUATION"]);
    expect(games.indexOf("MEMORY")).toBe(games.length - 1);
    expect(playableGames(lesson({ resources: [] }))).toEqual([]);
  });

  it("previews the points split and posts the chosen games", async () => {
    const { calls } = mockFetch({ "POST /resources/r-QUIZ/share": () => ({ body: shared() }), "GET /sessions/se1": () => ({ body: shared() }) });
    renderWithProviders(<ShareDialogBody lesson={lesson({ checks: [] })} tab="QUIZ" />, { scope: "teacher" });
    const group = screen.getByRole("group", { name: "Games to publish" });
    expect(within(group).getByRole("checkbox", { name: /Sort it/ })).toBeChecked();
    expect(within(group).getAllByRole("checkbox").filter((c) => (c as HTMLInputElement).checked)).toHaveLength(2);
    expect(screen.getByText(/Points:/)).toHaveTextContent(/Sort it 50/);
    await userEvent.click(within(group).getByRole("checkbox", { name: /Odd one out/ }));
    expect(screen.getByText(/Points:/)).toHaveTextContent(/34/);
    await userEvent.click(within(group).getByRole("checkbox", { name: /Sort it/ }));
    await userEvent.click(screen.getByRole("button", { name: /Students do it on their own/ }));
    await waitFor(() => expect(calls.some((c) => c.path === "/resources/r-QUIZ/share")).toBe(true));
    const body = calls.find((c) => c.path === "/resources/r-QUIZ/share")?.body as { games: string[]; mode: string };
    expect(body.mode).toBe("ASSIGNMENT");
    expect(body.games).toEqual(["EQUATION", "ODD_ONE_OUT"]);
  });

  it("says so when no game is published", async () => {
    mockFetch({});
    renderWithProviders(<ShareDialogBody lesson={lesson({ checks: [] })} tab="QUIZ" />, { scope: "teacher" });
    const group = screen.getByRole("group", { name: "Games to publish" });
    for (const box of within(group).getAllByRole("checkbox")) if ((box as HTMLInputElement).checked) await userEvent.click(box);
    expect(screen.getByText(/No games published/)).toBeInTheDocument();
    expect(gameContent.oddOneOut.length).toBeGreaterThan(0);
  });
});

describe("Live board", () => {
  it("shows the published games and their points", () => {
    const session = { id: "se1", link: "", qrSvg: "", isOpen: true, expiresAt: null, leaderboard: "TEAMS", lessonId: "l1", type: "GAME", game: "SORT", games: [{ game: "SORT", points: 50 }, { game: "EQUATION", points: 50 }], status: "LIVE", joinCode: "482913", namesHidden: true, currentQuestion: 0, questionCount: 0, revealed: false, joined: 3, classSize: 24, answeredCurrent: 1, notAnswered: [], question: null, distribution: null } as SessionTeacherView;
    mockFetch({});
    renderWithProviders(<LiveBoard lesson={lesson()} session={session} onEnded={jest.fn()} />, { scope: "teacher" });
    const list = screen.getByRole("list", { name: "Published games and their points" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(list).toHaveTextContent("Sort it");
    expect(list).toHaveTextContent("50 pts");
  });
});
