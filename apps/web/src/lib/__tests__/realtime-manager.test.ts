import { QueryClient } from "@tanstack/react-query";
import { BACKOFF_MAX_MS, CLOSE_GRACE_MS, TOKEN_MARGIN_MS, TOKEN_TTL_MS, applyRealtimeEvent, createRealtimeManager, type RealtimeAuth, type RealtimeSocket } from "../realtime";
import { lesson } from "@/test/fixtures";
import type { LessonStatusView } from "../queries";

class FakeSocket implements RealtimeSocket {
  handlers: Record<string, (payload?: unknown) => void> = {};
  emitted: [string, unknown][] = [];
  closed = false;
  on(event: string, cb: (payload?: unknown) => void) {
    this.handlers[event] = cb;
  }
  emit(event: string, payload?: unknown) {
    this.emitted.push([event, payload]);
  }
  close() {
    this.closed = true;
  }
  fire(event: string, payload?: unknown) {
    this.handlers[event]?.(payload);
  }
  joins() {
    return this.emitted.filter(([e]) => e === "join").map(([, p]) => (p as { room: string }).room);
  }
  leaves() {
    return this.emitted.filter(([e]) => e === "leave").map(([, p]) => (p as { room: string }).room);
  }
}

/** Manual clock and scheduler so timing is exact. */
function harness(overrides: { fetchToken?: () => Promise<RealtimeAuth | null>; enabled?: boolean; random?: () => number } = {}) {
  let clock = 1_000_000;
  const timers: { id: number; at: number; fn: () => void }[] = [];
  let nextId = 1;
  const sockets: FakeSocket[] = [];
  const delays: number[] = [];
  const ioFactory = jest.fn((...args: unknown[]) => {
    void args;
    const s = new FakeSocket();
    sockets.push(s);
    return s;
  });
  const fetchToken = jest.fn(overrides.fetchToken ?? (async () => ({ token: "tok", url: "ws://x" })));
  const manager = createRealtimeManager({
    enabled: overrides.enabled,
    ioFactory,
    fetchToken,
    now: () => clock,
    random: overrides.random ?? (() => 1),
    setTimeoutFn: (fn, ms) => {
      delays.push(ms);
      const t = { id: nextId++, at: clock + ms, fn };
      timers.push(t);
      return t.id;
    },
    clearTimeoutFn: (h) => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
  });
  const flush = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  const advance = async (ms: number) => {
    clock += ms;
    for (const t of timers.filter((x) => x.at <= clock).sort((a, b) => a.at - b.at)) {
      timers.splice(timers.indexOf(t), 1);
      t.fn();
    }
    await flush();
  };
  const connect = async (s: FakeSocket) => {
    s.fire("connect");
    await flush();
  };
  return { manager, sockets, ioFactory, fetchToken, delays, timers, flush, advance, connect, tick: (ms: number) => (clock += ms) };
}

const noop = () => undefined;

describe("realtime manager", () => {
  it("opens ONE connection and fetches ONE token for many subscribers, joining each room once", async () => {
    const h = harness();
    const handler = jest.fn();
    h.manager.subscribe("lesson:l1", handler);
    h.manager.subscribe("lesson:l1", handler);
    h.manager.subscribe("session:s1", noop);
    h.manager.subscribe("session:s2", noop);
    await h.flush();
    expect(h.ioFactory).toHaveBeenCalledTimes(1);
    expect(h.fetchToken).toHaveBeenCalledTimes(1);
    expect(h.ioFactory).toHaveBeenCalledWith("ws://x", { auth: { token: "tok" }, transports: ["websocket"], reconnection: false });
    expect(h.manager.isConnected()).toBe(false);
    await h.connect(h.sockets[0]);
    expect(h.manager.isConnected()).toBe(true);
    expect(h.sockets[0].joins().sort()).toEqual(["lesson:l1", "session:s1", "session:s2"]);
    expect(h.manager.roomCount()).toBe(3);
  });

  it("joins a room added while connected and leaves only when the last subscriber goes", async () => {
    const h = harness();
    const a = h.manager.subscribe("lesson:l1", noop);
    await h.flush();
    const s = h.sockets[0];
    await h.connect(s);
    const b = h.manager.subscribe("lesson:l1", noop);
    expect(s.joins()).toEqual(["lesson:l1"]);
    const c = h.manager.subscribe("session:s1", noop);
    expect(s.joins()).toEqual(["lesson:l1", "session:s1"]);
    a();
    a(); // double unsubscribe is harmless
    expect(s.leaves()).toEqual([]);
    b();
    expect(s.leaves()).toEqual(["lesson:l1"]);
    c();
    expect(s.leaves()).toEqual(["lesson:l1", "session:s1"]);
    expect(h.manager.roomCount()).toBe(0);
  });

  it("closes the socket after a grace period, but not when a new subscriber arrives in time", async () => {
    const h = harness();
    const off = h.manager.subscribe("lesson:l1", noop);
    await h.flush();
    await h.connect(h.sockets[0]);
    off();
    await h.advance(CLOSE_GRACE_MS - 1);
    expect(h.sockets[0].closed).toBe(false);
    const again = h.manager.subscribe("lesson:l2", noop);
    await h.advance(CLOSE_GRACE_MS * 2);
    expect(h.sockets[0].closed).toBe(false);
    expect(h.manager.isConnected()).toBe(true);
    expect(h.ioFactory).toHaveBeenCalledTimes(1);
    again();
    await h.advance(CLOSE_GRACE_MS);
    expect(h.sockets[0].closed).toBe(true);
    expect(h.manager.isConnected()).toBe(false);
    // unsubscribing twice while a close is pending does not stack timers
    const x = h.manager.subscribe("lesson:l3", noop);
    await h.flush();
    expect(h.ioFactory).toHaveBeenCalledTimes(2);
    x();
    const y = h.manager.subscribe("lesson:l4", noop);
    y();
    expect(h.timers.length).toBe(1);
  });

  it("caches the token until 30 s before it expires, then refetches", async () => {
    const h = harness();
    const off = h.manager.subscribe("lesson:l1", noop);
    await h.flush();
    await h.connect(h.sockets[0]);
    off();
    await h.advance(CLOSE_GRACE_MS);
    h.manager.subscribe("lesson:l1", noop);
    await h.flush();
    expect(h.fetchToken).toHaveBeenCalledTimes(1); // still cached
    h.manager.destroy();
    h.tick(TOKEN_TTL_MS - TOKEN_MARGIN_MS + 1);
    h.manager.subscribe("lesson:l1", noop);
    await h.flush();
    expect(h.fetchToken).toHaveBeenCalledTimes(2);
  });

  it("reconnects with exponential backoff, capped at 30 s, and resets after a connect", async () => {
    const h = harness();
    h.manager.subscribe("lesson:l1", noop);
    await h.flush();
    const delays: number[] = [];
    for (let i = 0; i < 8; i++) {
      const s = h.sockets[h.sockets.length - 1];
      h.delays.length = 0;
      s.fire("connect_error");
      expect(s.closed).toBe(true);
      delays.push(h.delays[0]);
      await h.advance(h.delays[0]);
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, BACKOFF_MAX_MS, BACKOFF_MAX_MS, BACKOFF_MAX_MS]);
    await h.connect(h.sockets[h.sockets.length - 1]);
    h.delays.length = 0;
    h.sockets[h.sockets.length - 1].fire("disconnect");
    expect(h.delays).toEqual([1000]);
  });

  it("applies jitter: between 50% and 100% of the backoff step", async () => {
    const h = harness({ random: () => 0 });
    h.manager.subscribe("lesson:l1", noop);
    await h.flush();
    h.sockets[0].fire("connect_error");
    expect(h.delays).toEqual([500]);
  });

  it("re-fetches the token on reconnect, re-joins every room and asks handlers to resync", async () => {
    const h = harness();
    const handler = jest.fn();
    h.manager.subscribe("lesson:l1", handler);
    h.manager.subscribe("session:s1", handler);
    await h.flush();
    await h.connect(h.sockets[0]);
    expect(handler).not.toHaveBeenCalled(); // the first connect is not a resync
    h.sockets[0].fire("disconnect");
    expect(h.manager.isConnected()).toBe(false);
    await h.advance(1000);
    expect(h.fetchToken).toHaveBeenCalledTimes(2);
    expect(h.sockets).toHaveLength(2);
    await h.connect(h.sockets[1]);
    expect(h.manager.isConnected()).toBe(true);
    expect(h.sockets[1].joins().sort()).toEqual(["lesson:l1", "session:s1"]);
    expect(handler).toHaveBeenCalledWith("lesson.status", { lessonId: "l1" });
    expect(handler).toHaveBeenCalledWith("session.state", { sessionId: "s1" });
  });

  it("backs off when the token request or the socket factory fails", async () => {
    let fail = true;
    const h = harness({ fetchToken: async () => (fail ? Promise.reject(new Error("net")) : { token: "t", url: "u" }) });
    h.manager.subscribe("lesson:l1", noop);
    await h.flush();
    expect(h.delays).toEqual([1000]);
    fail = false;
    await h.advance(1000);
    expect(h.sockets).toHaveLength(1);
    const delays: number[] = [];
    const boom = createRealtimeManager({
      ioFactory: () => Promise.reject(new Error("no module")),
      fetchToken: async () => ({ token: "t", url: "u" }),
      setTimeoutFn: (_fn, ms) => (delays.push(ms), 1),
      random: () => 1,
    });
    boom.subscribe("lesson:l1", noop);
    await h.flush();
    expect(delays).toEqual([1000]);
  });

  it("stays quiet when realtime is unavailable, and retries after everyone left", async () => {
    const h = harness({ fetchToken: async () => null });
    h.manager.subscribe("lesson:l1", noop);
    await h.flush();
    h.manager.subscribe("lesson:l2", noop);
    await h.flush();
    expect(h.fetchToken).toHaveBeenCalledTimes(1);
    expect(h.ioFactory).not.toHaveBeenCalled();
    expect(h.delays).toEqual([]);
    h.manager.destroy();
    h.manager.subscribe("lesson:l1", noop);
    await h.flush();
    expect(h.fetchToken).toHaveBeenCalledTimes(2);
  });

  it("is a no-op when disabled", async () => {
    const h = harness({ enabled: false });
    const off = h.manager.subscribe("lesson:l1", noop);
    off();
    await h.flush();
    expect(h.fetchToken).not.toHaveBeenCalled();
    expect(h.manager.roomCount()).toBe(0);
  });

  it("does not open a socket if every subscriber left while the token or factory was pending", async () => {
    const h = harness();
    const off = h.manager.subscribe("lesson:l1", noop);
    off();
    await h.flush();
    expect(h.ioFactory).not.toHaveBeenCalled();

    let resolveIo: (s: FakeSocket) => void = noop;
    const late = new FakeSocket();
    const m = createRealtimeManager({
      ioFactory: () => new Promise<FakeSocket>((r) => (resolveIo = r)),
      fetchToken: async () => ({ token: "t", url: "u" }),
      setTimeoutFn: () => 1,
    });
    const off2 = m.subscribe("lesson:l1", noop);
    await h.flush();
    off2();
    resolveIo(late);
    await h.flush();
    expect(late.closed).toBe(true);
  });

  it("routes events to the handlers of the matching room only", async () => {
    const h = harness();
    const lessonHandler = jest.fn();
    const sessionHandler = jest.fn();
    h.manager.subscribe("lesson:l1", lessonHandler);
    h.manager.subscribe("session:s1", sessionHandler);
    await h.flush();
    const s = h.sockets[0];
    await h.connect(s);
    s.fire("resource.progress", { lessonId: "l1", kind: "QUIZ", percent: 40 });
    expect(lessonHandler).toHaveBeenCalledWith("resource.progress", { lessonId: "l1", kind: "QUIZ", percent: 40 });
    expect(sessionHandler).not.toHaveBeenCalled();
    s.fire("session.answer", { sessionId: "s1" });
    s.fire("session.answer", { sessionId: "other" });
    expect(sessionHandler).toHaveBeenCalledTimes(1);
    expect(lessonHandler).toHaveBeenCalledTimes(1);
    s.fire("session.state", undefined); // no id: everyone is told
    expect(sessionHandler).toHaveBeenCalledTimes(2);
    expect(lessonHandler).toHaveBeenCalledTimes(2);
    // events of a closed (stale) socket are ignored
    s.fire("disconnect");
    s.fire("lesson.status", { lessonId: "l1" });
    expect(lessonHandler).toHaveBeenCalledTimes(2);
  });

  it("notifies connection listeners on change only", async () => {
    const h = harness();
    const listener = jest.fn();
    const off = h.manager.subscribeConnected(listener);
    h.manager.subscribe("lesson:l1", noop);
    await h.flush();
    await h.connect(h.sockets[0]);
    await h.connect(h.sockets[0]);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    h.sockets[0].fire("disconnect");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("survives a socket whose close throws", async () => {
    const h = harness();
    h.manager.subscribe("lesson:l1", noop);
    await h.flush();
    await h.connect(h.sockets[0]);
    h.sockets[0].close = () => {
      throw new Error("closed");
    };
    expect(() => h.sockets[0].fire("disconnect")).not.toThrow();
  });

  it("destroy closes the socket and cancels a pending reconnect", async () => {
    const h = harness();
    h.manager.subscribe("lesson:l1", noop);
    await h.flush();
    h.sockets[0].fire("disconnect");
    expect(h.timers).toHaveLength(1);
    h.manager.destroy();
    expect(h.timers).toHaveLength(0);
    await h.advance(60_000);
    expect(h.ioFactory).toHaveBeenCalledTimes(1);
  });
});

describe("event handling", () => {
  const client = () => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const status = (): LessonStatusView => ({
    status: "GENERATING",
    resources: [{ kind: "QUIZ", status: "WORKING", progress: 10, error: null }],
    translations: {} as LessonStatusView["translations"],
    updatedAt: "now",
  });

  it("resource.progress patches the cached lesson and light status without any refetch", () => {
    const qc = client();
    const base = lesson({ id: "l1" });
    qc.setQueryData(["lesson", "l1"], {
      ...base,
      status: "GENERATING",
      resources: [
        { ...base.resources[0], kind: "QUIZ", status: "WAITING", progress: 0 },
        { ...base.resources[1], kind: "SLIDES", status: "READY", progress: 100 },
      ],
    });
    qc.setQueryData(["lesson", "l1", "status"], status());
    const spy = jest.spyOn(qc, "invalidateQueries");
    const refetch = jest.spyOn(qc, "refetchQueries");
    applyRealtimeEvent(qc, "resource.progress", { lessonId: "l1", kind: "QUIZ", percent: 55.4 });
    applyRealtimeEvent(qc, "resource.progress", { lessonId: "l1", kind: "SLIDES", percent: 20 });
    const cached = qc.getQueryData<ReturnType<typeof lesson>>(["lesson", "l1"])!;
    expect(cached.resources.find((r) => r.kind === "QUIZ")).toMatchObject({ status: "WORKING", progress: 55 });
    expect(cached.resources.find((r) => r.kind === "SLIDES")).toMatchObject({ status: "READY", progress: 100 }); // never regresses
    expect(qc.getQueryData<LessonStatusView>(["lesson", "l1", "status"])!.resources[0]).toMatchObject({ status: "WORKING", progress: 55 });
    expect(spy).not.toHaveBeenCalled();
    expect(refetch).not.toHaveBeenCalled();
    applyRealtimeEvent(qc, "resource.progress", { lessonId: "l1", kind: "QUIZ", percent: 999 });
    expect(qc.getQueryData<ReturnType<typeof lesson>>(["lesson", "l1"])!.resources.find((r) => r.kind === "QUIZ")!.progress).toBe(100);
  });

  it("ignores progress for uncached lessons and malformed payloads", () => {
    const qc = client();
    applyRealtimeEvent(qc, "resource.progress", { lessonId: "nope", kind: "QUIZ", percent: 5 });
    applyRealtimeEvent(qc, "resource.progress", { lessonId: "nope" });
    applyRealtimeEvent(qc, "resource.progress", undefined);
    expect(qc.getQueryData(["lesson", "nope"])).toBeUndefined();
    expect(qc.getQueryData(["lesson", "nope", "status"])).toBeUndefined();
  });

  it("only ready, failed and lesson.status events refetch the lesson (and the lessons list)", () => {
    const qc = client();
    const spy = jest.spyOn(qc, "invalidateQueries");
    applyRealtimeEvent(qc, "resource.progress", { lessonId: "l1", kind: "QUIZ", percent: 5 });
    expect(spy).not.toHaveBeenCalled();
    for (const e of ["resource.ready", "resource.failed", "lesson.status"]) applyRealtimeEvent(qc, e, { lessonId: "l1" });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["lesson", "l1"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["lessons"] });
    spy.mockClear();
    applyRealtimeEvent(qc, "session.answer", { sessionId: "s1" });
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual([["session", "s1"], ["play", "quiz", "s1"], ["results"]]);
  });
});
