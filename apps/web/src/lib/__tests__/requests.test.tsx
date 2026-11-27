import { act, renderHook } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getRequestStats, resetRequestStats } from "../api";
import { useLessonEvents, useResults, useStudentQuiz, useTeacherSession } from "../queries";
import { setRealtimeManager, type RealtimeManager } from "../realtime";
import { lesson, session } from "@/test/fixtures";
import { makeClient, mockFetch } from "@/test/utils";

/** Requests per minute of the OLD code: 60 000 ms / 1 500 ms polls, plus the 5 000 ms results poll. */
const OLD_POLL = 60_000 / 1500;
const OLD_RESULTS = 60_000 / 5000;

function manager(connected: boolean): RealtimeManager {
  return { subscribe: () => () => undefined, isConnected: () => connected, subscribeConnected: () => () => undefined, roomCount: () => 0, destroy: () => undefined };
}

const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

/** Steady-state requests in one minute after the first load, read from the dev request counter. */
async function perMinute(connected: boolean, mount: (wrapper: (p: { children: ReactNode }) => ReactNode) => void): Promise<number> {
  const previous = setRealtimeManager(manager(connected));
  const l = lesson({ id: "l1", status: "GENERATING" });
  mockFetch({
    "GET /lessons/l1": () => ({ body: l }),
    "GET /lessons/l1/status": () => ({ body: { status: l.status, resources: l.resources.map((r) => ({ kind: r.kind, status: r.status, progress: r.progress, error: null })), translations: l.translations, updatedAt: "now" } }),
    "GET /sessions/s1": () => ({ body: session({ id: "s1", status: "LIVE" }) }),
    "GET /play/sessions/s1": () => ({ body: { sessionId: "s1", status: "LIVE" } }),
    "GET /lessons/l1/results": () => ({ body: { lessonId: "l1", sessionId: "s1", sessions: [] } }),
  });
  const client = makeClient();
  resetRequestStats();
  mount(({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>);
  await advance(10);
  const first = getRequestStats().total;
  await advance(60_000);
  const steady = getRequestStats().total - first;
  setRealtimeManager(previous);
  return steady;
}

describe("requests per minute (see ../REQUESTS.md)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("(a) teacher making a kit: 0 while connected, about 12 on the light status when disconnected (was 40)", async () => {
    const mount = (wrapper: (p: { children: ReactNode }) => ReactNode) => void renderHook(() => useLessonEvents("l1"), { wrapper });
    expect(await perMinute(true, mount)).toBe(0);
    const fallback = await perMinute(false, mount);
    expect(fallback).toBeGreaterThanOrEqual(11);
    expect(fallback).toBeLessThanOrEqual(13);
    expect(OLD_POLL).toBe(40);
  });

  it("(b) student in a live quiz: 0 while connected, about 12 when disconnected (was 40)", async () => {
    const mount = (wrapper: (p: { children: ReactNode }) => ReactNode) => void renderHook(() => useStudentQuiz("s1"), { wrapper });
    expect(await perMinute(true, mount)).toBe(0);
    const fallback = await perMinute(false, mount);
    expect(fallback).toBeGreaterThanOrEqual(11);
    expect(fallback).toBeLessThanOrEqual(13);
  });

  it("(c) teacher on the live board: 0 while connected, about 24 when disconnected (was 40 + 12 = 52)", async () => {
    const mount = (wrapper: (p: { children: ReactNode }) => ReactNode) => {
      renderHook(() => useTeacherSession("s1"), { wrapper });
      renderHook(() => useResults("l1", "s1"), { wrapper });
    };
    expect(await perMinute(true, mount)).toBe(0);
    const fallback = await perMinute(false, mount);
    expect(fallback).toBeGreaterThanOrEqual(22);
    expect(fallback).toBeLessThanOrEqual(26);
    expect(OLD_POLL + OLD_RESULTS).toBe(52);
  });
});
