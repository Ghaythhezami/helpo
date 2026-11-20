import { fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { CheckView, ResourceView } from "@helpo/shared";
import { checkListLine, checkSummary, exportOptions, nextOpenCheck, resourceChip, resourceMeta } from "../checks";
import { initials, longDate, parseNames, relativeDay, shortDate } from "../format";
import { drawStrokes, loadStrokes, saveStrokes, type Stroke } from "../whiteboard";
import { equationMessageText, equationReducer, initEquation } from "../games/equation";
import { initMatch, matchMessageText, matchReducer, matchRoundCount } from "../games/match";
import { sortMessageText } from "../games/sort";
import { tn, translate } from "../messages";
import { POLL_MS, isBusyStatus, qk, useClassDetail, useClasses, useDashboard, useJoinClasses, useJoinStudents, useLesson, useLessons, useMe, useResults, useStudentGame, useStudentGames, useStudentHome, useStudentQuiz, useTeacherSession, useLessonEvents } from "../queries";
import { ApiError } from "../api";
import { cardsContent, gameContent, quizContent, resource, slidesContent, worksheetContent, lesson, session } from "@/test/fixtures";
import { makeClient, mockFetch, renderWithProviders } from "@/test/utils";
import { Dialog } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { Pill, Chip } from "@/components/ui/pill";
import { Hero, Panel, PillHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState, Async } from "@/components/ui/states";
import { InlineConfirm } from "@/components/ui/confirm";
import { Switch } from "@/components/ui/switch";
import { Logo } from "@/components/ui/logo";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";

jest.setTimeout(60000);
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

const t = (k: string, v?: Record<string, string | number>) => translate("en", k, v);

describe("check helpers", () => {
  const check = (id: string, status: CheckView["status"]): CheckView => ({ id, resource: "QUIZ", itemRef: "Q1", kind: "FACT_CHECK", message: "", suggestion: null, sourcePage: null, status });
  it("summarises and walks open checks", () => {
    const list = [check("a", "OPEN"), check("b", "ACCEPTED")];
    expect(checkSummary(list)).toEqual({ total: 2, open: 1, resolved: 1 });
    expect(nextOpenCheck(list)?.id).toBe("a");
    expect(nextOpenCheck([])).toBeNull();
  });
  it("describes each resource in plain words", () => {
    expect(resourceMeta(resource("SLIDES", slidesContent), t as never)).toBe("7 slides");
    expect(resourceMeta(resource("WORKSHEET", worksheetContent), t as never)).toBe("2 sections");
    expect(resourceMeta(resource("QUIZ", quizContent), t as never)).toBe("3 questions");
    expect(resourceMeta(resource("GAME", gameContent), t as never)).toBe("6 pairs");
    expect(resourceMeta(resource("CARDS", cardsContent), t as never)).toBe("3 cards");
    expect(resourceMeta(resource("CARDS", null, { status: "FAILED" }), t as never)).toBe("Couldn't be made");
    expect(resourceMeta(resource("CARDS", null, { status: "WAITING" }), t as never)).toBe("Not made yet");
  });
  it("picks a chip for each status", () => {
    const r = (status: ResourceView["status"]) => resource("QUIZ", quizContent, { status });
    expect(resourceChip(r("WAITING"), 0, t as never).tone).toBe("neu");
    expect(resourceChip(r("WORKING"), 0, t as never).tone).toBe("soft");
    expect(resourceChip(r("FAILED"), 0, t as never).label).toBe("Try again");
    expect(resourceChip(r("READY"), 2, t as never)).toEqual({ label: "2 to check", tone: "chk" });
    expect(resourceChip(r("READY"), 0, t as never).label).toBe("Ready");
  });
  it("writes the check list line for every state", () => {
    expect(checkListLine("QUIZ", undefined, 0, t as never)).toMatch(/needs to be made again/);
    expect(checkListLine("QUIZ", resource("QUIZ", null, { status: "FAILED" }), 0, t as never)).toMatch(/needs to be made again/);
    expect(checkListLine("QUIZ", resource("QUIZ", null, { status: "WORKING" }), 0, t as never)).toMatch(/still being made/);
    expect(checkListLine("QUIZ", resource("QUIZ", quizContent), 2, t as never)).toBe("Quiz: 2 to check");
    expect(checkListLine("QUIZ", resource("QUIZ", quizContent), 0, t as never)).toBe("Quiz is ready");
  });
  it("lists supported download formats", () => {
    expect(exportOptions("SLIDES").map((o) => o.format)).toEqual(["pptx", "pdf"]);
    expect(exportOptions("WORKSHEET").map((o) => o.format)).toEqual(["docx", "pdf"]);
    expect(exportOptions("QUIZ")).toHaveLength(3);
    expect(exportOptions("CARDS")).toHaveLength(1);
    expect(exportOptions("GAME")).toEqual([]);
  });
});

describe("format helpers", () => {
  it("formats dates in both languages and survives bad input", () => {
    expect(longDate("2026-11-20")).toMatch(/Friday/);
    expect(longDate("2026-11-20", "ar")).not.toMatch(/Friday/);
    expect(longDate("not a date")).toBe("not a date");
    expect(shortDate("2026-11-20T10:00:00Z")).toMatch(/Nov/);
    expect(shortDate("bad")).toBe("");
  });
  it("describes how long ago something happened", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    const ago = (d: number) => relativeDay(new Date(now.getTime() - d * 86400000).toISOString(), t as never, now);
    expect([ago(0), ago(1), ago(3), ago(10), ago(30)]).toEqual(["today", "yesterday", "3 days ago", "last week", "4 weeks ago"]);
    expect(relativeDay("bad", t as never)).toBe("");
  });
  it("makes initials and name lists", () => {
    expect(initials("")).toBe("?");
    expect(initials("sara")).toBe("SA");
    expect(parseNames("")).toEqual([]);
  });
});

describe("whiteboard drawing maths", () => {
  const ctxCalls: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, { get: (target, key: string) => (key in target ? target[key] : (...a: unknown[]) => void ctxCalls.push(`${key}:${a.length}`)), set: (target, key: string, v) => ((target[key] = v), true) }) as unknown as CanvasRenderingContext2D;
  it("draws dots, eraser strokes and pressure-sensitive lines", () => {
    const dot: Stroke = { tool: "pencil", color: "#000", size: 3, points: [{ x: 0.5, y: 0.5, p: 0.5 }] };
    const erase: Stroke = { tool: "eraser", color: "#fff", size: 3, points: [{ x: 0, y: 0, p: 0 }, { x: 1, y: 1, p: 1 }] };
    const empty: Stroke = { tool: "pencil", color: "#000", size: 3, points: [] };
    drawStrokes(ctx, 640, 480, [dot, erase, empty]);
    expect(ctxCalls).toContain("arc:5");
    expect(ctxCalls).toContain("lineTo:2");
  });
  it("survives broken or full storage", () => {
    expect(loadStrokes("x", { getItem: () => "{broken" })).toEqual([]);
    expect(() => saveStrokes("x", [], { setItem: () => { throw new Error("full"); } })).not.toThrow();
  });
});

describe("game messages and branches", () => {
  it("writes every match message", () => {
    const kinds = [{ kind: "start" }, { kind: "picked", label: "A" }, { kind: "need-left" }, { kind: "match", left: "A", right: "B", xp: 10, retry: true, combo: 3 }, { kind: "miss" }, { kind: "hint", left: "A", right: "B" }, { kind: "round-done", round: 1 }, { kind: "finished" }] as const;
    for (const m of kinds) expect(matchMessageText(m).length).toBeGreaterThan(3);
  });
  it("writes every sort and equation message", () => {
    const b = { yes: "Y", no: "N" };
    for (const m of [{ kind: "start" }, { kind: "picked", label: "A" }, { kind: "need-item" }, { kind: "placed", label: "A", basket: "no", xp: 5, retry: true }, { kind: "miss" }, { kind: "finished", total: 3 }] as const) expect(sortMessageText(m, b).length).toBeGreaterThan(3);
    for (const m of [{ kind: "start" }, { kind: "taken", label: "A" }, { kind: "full" }, { kind: "incomplete" }, { kind: "wrong", wrongSlots: 2 }, { kind: "correct", retry: true }, { kind: "correct", retry: false }] as const) expect(equationMessageText(m).length).toBeGreaterThan(3);
  });
  it("folds a lone last pair into the previous round and ignores moves after the end", () => {
    const pairs = Array.from({ length: 5 }, (_, i) => ({ left: `L${i}`, right: `R${i}` }));
    const s = initMatch(pairs, "x");
    expect(matchRoundCount(s)).toBe(1);
    expect(s.rounds[0]).toHaveLength(5);
    expect(matchReducer(s, { type: "nextRound" })).toBe(s);
    expect(matchReducer(s, { type: "selectLeft", index: 99 })).toBe(s);
  });
  it("takes tiles back, refuses a full bank, and clears a slot", () => {
    let s = initEquation(["a", "+", "b", "->", "c"], "q");
    s = equationReducer(s, { type: "tile", term: 0 });
    s = equationReducer(s, { type: "tile", term: 0 });
    expect(s.message.kind).toBe("taken");
    for (const term of [0, 1, 2]) s = equationReducer(s, { type: "tile", term });
    expect(equationReducer(s, { type: "tile", term: 0 }).slots).not.toContain(0);
    s = equationReducer(s, { type: "slot", slot: 0 });
    expect(s.slots[0]).toBeNull();
    expect(equationReducer(s, { type: "slot", slot: 0 })).toBe(s);
    const full = initEquation(["a", "b"], "q");
    expect(equationReducer({ ...full, slots: [0, 1] }, { type: "tile", term: 5 }).message.kind).toBe("full");
  });
  it("counts plurals with the .one variant", () => {
    expect(tn(t as never, "meta.cards", 1)).toBe("1 card");
    expect(tn(t as never, "meta.cards", 4)).toBe("4 cards");
  });
});

describe("query hooks", () => {
  it("knows which lesson statuses are still busy", () => {
    expect(["UPLOADED", "EXTRACTING", "ANALYZING", "GENERATING"].every(isBusyStatus)).toBe(true);
    expect(["READY", "ANALYZED", "FAILED", "PARTIAL", "DRAFT"].some(isBusyStatus)).toBe(false);
    expect(POLL_MS).toBe(1500);
    expect(qk.results("l", "s")).toEqual(["results", "l", "s"]);
  });

  it("loads each teacher and student view from the API", async () => {
    mockFetch({
      "GET /me": () => ({ body: { id: "u" } }),
      "GET /dashboard": () => ({ body: { teacherName: "A" } }),
      "GET /classes": () => ({ body: [] }),
      "GET /classes/c1": () => ({ body: { id: "c1" } }),
      "GET /lessons": () => ({ body: [] }),
      "GET /lessons/l1": () => ({ body: lesson({ status: "GENERATING" }) }),
      "GET /sessions/se1": () => ({ body: session({ status: "ENDED" }) }),
      "GET /lessons/l1/results": () => ({ body: { answered: 1 } }),
      "GET /join/schools/riverside/classes": () => ({ body: [{ classId: "c1" }] }),
      "GET /join/classes/c1/students": () => ({ body: [] }),
      "GET /play/me": () => ({ body: { displayName: "S" } }),
      "GET /play/games": () => ({ body: [] }),
      "GET /play/games/l1/MATCH": () => ({ body: { lessonId: "l1" } }),
      "GET /play/sessions/se1": () => ({ body: { status: "ENDED" } }),
    });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
    const hooks = [
      renderHook(() => useMe(), { wrapper }),
      renderHook(() => useDashboard(), { wrapper }),
      renderHook(() => useClasses(), { wrapper }),
      renderHook(() => useClassDetail("c1"), { wrapper }),
      renderHook(() => useLessons("c1"), { wrapper }),
      renderHook(() => useLesson("l1", { poll: true }), { wrapper }),
      renderHook(() => useLessonEvents("l1"), { wrapper }),
      renderHook(() => useTeacherSession("se1"), { wrapper }),
      renderHook(() => useResults("l1", undefined), { wrapper }),
      renderHook(() => useJoinClasses("riverside", 6), { wrapper }),
      renderHook(() => useJoinStudents("c1"), { wrapper }),
      renderHook(() => useStudentHome(), { wrapper }),
      renderHook(() => useStudentGames(), { wrapper }),
      renderHook(() => useStudentGame("l1", "MATCH"), { wrapper }),
      renderHook(() => useStudentQuiz("se1"), { wrapper }),
    ];
    for (const h of hooks) await waitFor(() => expect(h.result.current.isSuccess).toBe(true));
    const idle = renderHook(() => [useTeacherSession(null), useJoinClasses("riverside", null), useJoinStudents(null)], { wrapper });
    expect(idle.result.current.every((q) => q.fetchStatus === "idle")).toBe(true);
  });

  it("does not retry client errors but retries a flaky server once", async () => {
    let calls = 0;
    mockFetch({ "GET /me": () => ((calls += 1), { status: 404, body: { title: "Not found", status: 404 } }) });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(calls).toBe(1);
    expect(result.current.error).toBeInstanceOf(ApiError);
  });
});

describe("ui primitives", () => {
  it("Dialog: Escape and the overlay close it, Tab stays inside, focus returns", async () => {
    const onClose = jest.fn();
    renderWithProviders(<><button>opener</button><Dialog title="Hello" onClose={onClose}><button>one</button><button>two</button></Dialog></>);
    expect(screen.getByRole("dialog", { name: "Hello" })).toBeInTheDocument();
    const buttons = screen.getByRole("dialog").querySelectorAll("button");
    (buttons[buttons.length - 1] as HTMLElement).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(buttons[0]);
    (buttons[0] as HTMLElement).focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.mouseDown(document.querySelector(".ovl")!);
    expect(onClose).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("Tabs: arrows, Home and End move focus and show badges", async () => {
    const onChange = jest.fn();
    renderWithProviders(<Tabs group="g" label="L" value="b" onChange={onChange} tabs={[{ id: "a", label: "A", badge: 2 }, { id: "b", label: "B" }, { id: "c", label: "C" }]} />);
    const b = screen.getByRole("tab", { name: "B" });
    b.focus();
    for (const key of ["ArrowLeft", "Home", "End", "ArrowRight", "x"]) fireEvent.keyDown(b, { key });
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(["a", "a", "c", "c"]);
    expect(screen.getByText(/to check/)).toBeInTheDocument();
  });

  it("Button and ButtonLink: classes, disabled behaviour, ref", async () => {
    expect(buttonClass("ghost")).toBe("lnk");
    expect(buttonClass("secondary", "sm", "x")).toBe("btn sec sm x");
    const onClick = jest.fn();
    renderWithProviders(<><ButtonLink href="/x" disabled onClick={onClick}>Go</ButtonLink><ButtonLink href="/y" size="big" onClick={onClick}>Yes</ButtonLink><Button variant="ghost" onClick={onClick}>Tap</Button></>);
    fireEvent.click(screen.getByRole("link", { name: "Go" }));
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: "Yes" }));
    await userEvent.click(screen.getByRole("button", { name: "Tap" }));
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("Pill, Chip, cards and the logo render with their roles", () => {
    renderWithProviders(<><Pill tone="ready">Ok</Pill><Pill tone="chk">Check</Pill><Pill tone="soft">Soft</Pill><Pill tone="neu" icon={false}>Plain</Pill><Chip>C</Chip><Hero><p>hero</p></Hero><Panel aria-label="p"><PillHeader icon={<i />} as="h3">Head</PillHeader></Panel><Logo href="/" label="Home" /></>);
    expect(screen.getByRole("heading", { level: 3, name: "Head" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveTextContent("Nibras");
  });

  it("States: loading, empty, error variants and Async", async () => {
    const refetch = jest.fn();
    const { unmount } = renderWithProviders(<><LoadingState label="x" /><EmptyState title="Nothing" action={<button>Act</button>}>Text</EmptyState></>);
    expect(screen.getByText("Nothing")).toBeInTheDocument();
    unmount();
    renderWithProviders(<Async query={{ data: undefined, error: new ApiError({ status: 401, title: "x" }), isPending: false, isError: true, refetch }} label="x">{() => null}</Async>);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    renderWithProviders(<ErrorState error={new Error("Boom")} onRetry={refetch} />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
    renderWithProviders(<Async query={{ data: undefined, error: null, isPending: true, isError: false, refetch }} label="things">{() => null}</Async>);
    renderWithProviders(<Async query={{ data: 5, error: null, isPending: false, isError: false, refetch }} label="things">{(n) => <p>value {n}</p>}</Async>);
    expect(screen.getByText("value 5")).toBeInTheDocument();
  });

  it("InlineConfirm, Switch (disabled), Progress edge values and toasts", async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const onChange = jest.fn();
    function Toaster() {
      const toast = useToast();
      return <><button onClick={() => toast.show("Hello toast")}>show</button><button onClick={() => toast.show("Undoable", { undo: onChange, durationMs: 100 })}>undo</button><button onClick={() => toast.dismiss()}>hide</button></>;
    }
    renderWithProviders(<><InlineConfirm message="Sure?" confirmLabel="Yes" cancelLabel="No" onConfirm={onConfirm} onCancel={onCancel} busy /><Switch checked disabled label="Dis" onChange={onChange} /><Progress value={5} max={0} label="zero" /><Toaster /></>);
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onCancel).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("switch", { name: "Dis" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("progressbar", { name: "zero" }).firstElementChild).toHaveStyle({ transform: "scaleX(0)" });
    await userEvent.click(screen.getByText("show"));
    expect(screen.getByText("Hello toast")).toBeInTheDocument();
    await userEvent.click(screen.getByText("hide"));
    expect(screen.queryByText("Hello toast")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("undo"));
    await userEvent.click(screen.getByRole("button", { name: /Undo/ }));
    expect(onChange).toHaveBeenCalled();
  });
});
