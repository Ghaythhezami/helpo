import { act, renderHook } from "@testing-library/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getRequestStats, resetRequestStats } from "../api";
import { FALLBACK_POLL_MS, lessonStatusDiffers, useAdminOverview, useJoinClasses, useLessonEvents, useResults, useStudentHome, useStudentQuiz, useTeacherSession, type LessonStatusView } from "../queries";
import { setRealtimeManager, type RealtimeManager } from "../realtime";
import { lesson, session } from "@/test/fixtures";
import { makeClient, mockFetch } from "@/test/utils";

/** A manager whose connectivity the test flips by hand. */
function fakeManager(initial: boolean) {
  let connected = initial;
  const listeners = new Set<() => void>();
  const subscribe = jest.fn((...args: unknown[]) => (args.length, () => undefined));
  const manager: RealtimeManager = {
    subscribe: subscribe as RealtimeManager["subscribe"],
    isConnected: () => connected,
    subscribeConnected: (l) => (listeners.add(l), () => void listeners.delete(l)),
    roomCount: () => 0,
    destroy: () => undefined,
  };
  return {
    manager,
    subscribe,
    set(value: boolean) {
      connected = value;
      for (const l of [...listeners]) l();
    },
  };
}

const statusOf = (l: ReturnType<typeof lesson>, over: Partial<LessonStatusView> = {}): LessonStatusView => ({
  status: l.status,
  resources: l.resources.map((r) => ({ kind: r.kind, status: r.status, progress: r.progress, error: null })),
  translations: l.translations,
  updatedAt: "now",
  ...over,
});

const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

const count = (calls: { path: string }[], path: string) => calls.filter((c) => c.path === path).length;

describe("polling follows the socket", () => {
  let client: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => ReactNode;
  let previous: RealtimeManager;

  beforeEach(() => {
    jest.useFakeTimers();
    client = makeClient();
    wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    resetRequestStats();
  });
  afterEach(() => {
    if (previous) setRealtimeManager(previous);
    jest.useRealTimers();
  });

  const routes = (generating = true) => {
    const l = lesson({ id: "l1", status: generating ? "GENERATING" : "READY" });
    return {
      "GET /lessons/l1": () => ({ body: l }),
      "GET /lessons/l1/status": () => ({ body: statusOf(l) }),
      "GET /sessions/s1": () => ({ body: session({ id: "s1", status: "LIVE" }) }),
      "GET /play/sessions/s1": () => ({ body: { sessionId: "s1", status: "LIVE" } }),
      "GET /lessons/l1/results": () => ({ body: { lessonId: "l1", sessionId: "s1", sessions: [] } }),
    };
  };

  function mountAll() {
    return [
      renderHook(() => useLessonEvents("l1"), { wrapper }),
      renderHook(() => useTeacherSession("s1"), { wrapper }),
      renderHook(() => useStudentQuiz("s1"), { wrapper }),
      renderHook(() => useResults("l1", "s1"), { wrapper }),
    ];
  }

  it("makes ZERO extra requests in 60 s while the socket is connected, then polls every 5 s once it drops", async () => {
    const fake = fakeManager(true);
    previous = setRealtimeManager(fake.manager);
    const { calls } = mockFetch(routes());
    mountAll();
    await advance(10);
    const baseline = calls.length;
    expect(count(calls, "/lessons/l1")).toBe(1);
    expect(count(calls, "/sessions/s1")).toBe(1);
    expect(count(calls, "/play/sessions/s1")).toBe(1);
    expect(count(calls, "/lessons/l1/results")).toBe(1);
    expect(count(calls, "/lessons/l1/status")).toBe(0);

    await advance(60_000);
    expect(calls.length).toBe(baseline); // ZERO extra calls

    act(() => fake.set(false));
    await advance(10);
    const resumed = calls.length;
    await advance(60_000);
    const perMinute = (path: string) => count(calls, path) - 1;
    // about one call per 5 s (12 a minute), never one per 1.5 s (40 a minute)
    for (const path of ["/sessions/s1", "/play/sessions/s1", "/lessons/l1/results"]) {
      expect(perMinute(path)).toBeGreaterThanOrEqual(11);
      expect(perMinute(path)).toBeLessThanOrEqual(13);
    }
    expect(count(calls, "/lessons/l1/status")).toBeGreaterThanOrEqual(11);
    expect(count(calls, "/lessons/l1/status")).toBeLessThanOrEqual(14);
    expect(count(calls, "/lessons/l1")).toBe(1); // the full lesson is never polled
    expect(calls.length - resumed).toBeLessThanOrEqual(4 * 13);

    act(() => fake.set(true));
    await advance(10);
    const again = calls.length;
    await advance(60_000);
    expect(calls.length).toBe(again);
  });

  it("polls every 5 s (not 1.5 s) when realtime is off", async () => {
    const fake = fakeManager(false);
    previous = setRealtimeManager(fake.manager);
    const { calls } = mockFetch(routes());
    renderHook(() => useTeacherSession("s1"), { wrapper });
    await advance(60_000);
    expect(FALLBACK_POLL_MS).toBe(5000);
    expect(count(calls, "/sessions/s1")).toBeGreaterThanOrEqual(12);
    expect(count(calls, "/sessions/s1")).toBeLessThanOrEqual(13);
    expect(getRequestStats().byPath["/sessions/s1"]).toBe(count(calls, "/sessions/s1"));
  });

  it("stops polling the session, the quiz and the results once the session is ENDED", async () => {
    previous = setRealtimeManager(fakeManager(false).manager);
    const { calls } = mockFetch({
      ...routes(),
      "GET /sessions/s1": () => ({ body: session({ id: "s1", status: "ENDED" }) }),
      "GET /play/sessions/s1": () => ({ body: { sessionId: "s1", status: "ENDED" } }),
    });
    renderHook(() => useTeacherSession("s1"), { wrapper });
    renderHook(() => useStudentQuiz("s1"), { wrapper });
    renderHook(() => useResults("l1", "s1"), { wrapper });
    await advance(10);
    // results stop because the cached session is ENDED
    const before = calls.length;
    await advance(60_000);
    expect(count(calls, "/sessions/s1")).toBe(1);
    expect(count(calls, "/play/sessions/s1")).toBe(1);
    expect(calls.length).toBe(before);
  });

  it("results stop on the `ended` hint and find the session from the data when none is passed", async () => {
    previous = setRealtimeManager(fakeManager(false).manager);
    const { calls } = mockFetch(routes());
    renderHook(() => useResults("l1", "s1", { ended: true }), { wrapper });
    await advance(60_000);
    expect(count(calls, "/lessons/l1/results")).toBe(1);

    const fake = fakeManager(false);
    setRealtimeManager(fake.manager);
    const second = mockFetch(routes());
    const { rerender } = renderHook(() => useResults("l1"), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider> });
    await advance(10);
    rerender();
    expect(fake.subscribe).toHaveBeenCalledWith("session:s1", expect.any(Function));
    await advance(30_000);
    expect(count(second.calls, "/lessons/l1/results")).toBeGreaterThanOrEqual(6);
  });

  it("does not poll a lesson that is not generating", async () => {
    previous = setRealtimeManager(fakeManager(false).manager);
    const { calls } = mockFetch(routes(false));
    renderHook(() => useLessonEvents("l1"), { wrapper });
    await advance(60_000);
    expect(calls.map((c) => c.path)).toEqual(["/lessons/l1"]);
  });

  it("refetches the full lesson once when the light status shows a finished resource", async () => {
    previous = setRealtimeManager(fakeManager(false).manager);
    const generating = lesson({ id: "l1", status: "GENERATING" });
    let done = false;
    const finished = lesson({ id: "l1", status: "READY" });
    const { calls } = mockFetch({
      "GET /lessons/l1": () => ({ body: done ? finished : generating }),
      "GET /lessons/l1/status": () => ({ body: statusOf(done ? finished : generating) }),
    });
    renderHook(() => useLessonEvents("l1"), { wrapper });
    await advance(20_000);
    expect(count(calls, "/lessons/l1")).toBe(1);
    expect(count(calls, "/lessons/l1/status")).toBeGreaterThanOrEqual(4);
    done = true;
    await advance(FALLBACK_POLL_MS + 100);
    expect(count(calls, "/lessons/l1")).toBe(2);
    const statusCalls = count(calls, "/lessons/l1/status");
    await advance(30_000);
    expect(count(calls, "/lessons/l1")).toBe(2);
    expect(count(calls, "/lessons/l1/status")).toBe(statusCalls); // lesson is READY: the light poll stops too
  });

  it("detects when the light status differs from the cached lesson", () => {
    const l = lesson({ id: "l1", status: "GENERATING" });
    expect(lessonStatusDiffers(undefined, statusOf(l))).toBe(false);
    expect(lessonStatusDiffers(l, statusOf(l))).toBe(false);
    expect(lessonStatusDiffers(l, statusOf(l, { status: "READY" }))).toBe(true);
    expect(lessonStatusDiffers(l, statusOf(l, { resources: [{ kind: "QUIZ", status: "FAILED", progress: 0, error: "x" }] }))).toBe(true);
    expect(lessonStatusDiffers(l, statusOf(l, { resources: [{ kind: "QUIZ", status: l.resources.find((r) => r.kind === "QUIZ")!.status, progress: 1, error: null }] }))).toBe(false);
    expect(lessonStatusDiffers(l, statusOf(l, { resources: [{ kind: "SLIDES", status: "WORKING", progress: 3, error: null }, ...statusOf(l).resources.slice(1)] }))).toBe(true);
    expect(lessonStatusDiffers(l, statusOf(l, { translations: { ...l.translations, ar: "working" } as never }))).toBe(true);
    expect(lessonStatusDiffers({ ...l, translations: undefined as never }, statusOf(l, { translations: undefined as never }))).toBe(false);
  });

  it("follows a translation in progress even when the kit itself is ready", async () => {
    previous = setRealtimeManager(fakeManager(false).manager);
    const l = lesson({ id: "l1", status: "READY", translations: { ar: "working" } as never });
    const { calls } = mockFetch({ "GET /lessons/l1": () => ({ body: l }), "GET /lessons/l1/status": () => ({ body: statusOf(l) }) });
    renderHook(() => useLessonEvents("l1"), { wrapper });
    await advance(20_000);
    expect(count(calls, "/lessons/l1/status")).toBeGreaterThanOrEqual(3);
    expect(count(calls, "/lessons/l1")).toBe(1);
  });

  it("student, admin and join lists do not poll on a timer", async () => {
    previous = setRealtimeManager(fakeManager(false).manager);
    const { calls } = mockFetch({
      "GET /play/me": () => ({ body: { displayName: "S" } }),
      "GET /admin/overview": () => ({ body: {} }),
      "GET /join/schools/riverside/classes": () => ({ body: [] }),
    });
    renderHook(() => useStudentHome(), { wrapper });
    renderHook(() => useAdminOverview(), { wrapper });
    renderHook(() => useJoinClasses("riverside", 6), { wrapper });
    await advance(120_000);
    expect(calls).toHaveLength(3);
  });
});

describe("the generation view waits through ANALYZED", () => {
  it("polls the light status while the lesson sits at ANALYZED (generation starts a moment later), but the workspace does not", async () => {
    jest.useFakeTimers();
    const previous = setRealtimeManager(fakeManager(false).manager);
    resetRequestStats();
    const l = lesson({ id: "l1", status: "ANALYZED" });
    const { calls } = mockFetch({ "GET /lessons/l1": () => ({ body: l }), "GET /lessons/l1/status": () => ({ body: statusOf(l) }) });
    const client = makeClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const first = renderHook(() => useLessonEvents("l1", { awaitGeneration: true }), { wrapper });
    await advance(12_000);
    expect(count(calls, "/lessons/l1/status")).toBeGreaterThanOrEqual(2);
    first.unmount();
    calls.length = 0;
    const other = makeClient();
    renderHook(() => useLessonEvents("l1"), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={other}>{children}</QueryClientProvider> });
    await advance(12_000);
    expect(count(calls, "/lessons/l1/status")).toBe(0);
    setRealtimeManager(previous);
    jest.useRealTimers();
  });
});
