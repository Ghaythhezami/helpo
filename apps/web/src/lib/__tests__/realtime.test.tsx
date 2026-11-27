import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { makeClient, mockFetch } from "@/test/utils";

jest.setTimeout(30000);

describe("realtime (socket.io, default singleton)", () => {
  type Handler = (payload?: unknown) => void;
  const handlers: Record<string, Handler> = {};
  const socket = { on: jest.fn((event: string, cb: Handler) => void (handlers[event] = cb)), emit: jest.fn(), close: jest.fn() };
  const io = jest.fn((...args: unknown[]) => (void args, socket));
  jest.mock("socket.io-client", () => ({ io: (...args: unknown[]) => (io as (...a: unknown[]) => unknown)(...args) }), { virtual: true });
  let mod: typeof import("../realtime");

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_REALTIME = "socket";
    mod = await import("../realtime");
  });
  beforeEach(() => {
    io.mockClear();
    socket.emit.mockClear();
    socket.close.mockClear();
    for (const k of Object.keys(handlers)) delete handlers[k];
  });
  afterEach(() => {
    mod.getRealtimeManager().destroy();
  });
  const wrapper = (client = makeClient()) => {
    const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return Wrapper;
  };

  it("connects with a token, joins the room, patches progress and refreshes on ready", async () => {
    const { calls } = mockFetch({ "GET /realtime/token": () => ({ body: { token: "tok", url: "http://ws.example" } }) });
    const client = makeClient();
    const spy = jest.spyOn(client, "invalidateQueries");
    const { unmount } = renderHook(
      () => {
        mod.useRealtimeRoom("lesson:l1");
        mod.useRealtimeRoom("lesson:l1");
        return mod.useRealtimeConnected();
      },
      { wrapper: wrapper(client) },
    );
    await waitFor(() => expect(io).toHaveBeenCalledWith("http://ws.example", expect.objectContaining({ auth: { token: "tok" }, transports: ["websocket"] })));
    expect(io).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c.path === "/realtime/token")).toHaveLength(1);
    expect(mod.isRealtimeConnected()).toBe(false);
    act(() => handlers.connect());
    expect(mod.isRealtimeConnected()).toBe(true);
    expect(socket.emit).toHaveBeenCalledWith("join", { room: "lesson:l1" });
    act(() => handlers["resource.progress"]({ lessonId: "l1", kind: "QUIZ", percent: 10 }));
    expect(spy).not.toHaveBeenCalled();
    act(() => handlers["resource.ready"]({ lessonId: "l1" }));
    expect(spy).toHaveBeenCalledWith({ queryKey: ["lesson", "l1"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["lessons"] });
    unmount();
    expect(socket.emit).toHaveBeenCalledWith("leave", { room: "lesson:l1" });
  });

  it("re-renders hooks when connectivity changes", async () => {
    mockFetch({ "GET /realtime/token": () => ({ body: { token: "tok", url: "http://ws.example" } }) });
    const { result } = renderHook(
      () => {
        mod.useRealtimeRoom("session:s1");
        return mod.useRealtimeConnected();
      },
      { wrapper: wrapper() },
    );
    expect(result.current).toBe(false);
    await waitFor(() => expect(io).toHaveBeenCalled());
    act(() => handlers.connect());
    expect(result.current).toBe(true);
    act(() => handlers.disconnect());
    expect(result.current).toBe(false);
  });

  it("stays quiet without a room or when the token request fails with a server error (backs off)", async () => {
    mockFetch({ "GET /realtime/token": () => ({ status: 500, body: { title: "x", status: 500 } }) });
    renderHook(() => mod.useRealtimeRoom(null), { wrapper: wrapper() });
    renderHook(() => mod.useRealtimeRoom("session:s1"), { wrapper: wrapper() });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(io).not.toHaveBeenCalled();
  });

  it("gives up quietly when the API says 401 or returns no URL or token", async () => {
    const { calls } = mockFetch({ "GET /realtime/token": () => ({ status: 401, body: { title: "no", status: 401 } }) });
    renderHook(() => mod.useRealtimeRoom("lesson:l9"), { wrapper: wrapper() });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(io).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.path === "/realtime/token")).toHaveLength(1);
    mod.getRealtimeManager().destroy();
    mockFetch({ "GET /realtime/token": () => ({ body: { token: "", url: "" } }) });
    renderHook(() => mod.useRealtimeRoom("lesson:l10"), { wrapper: wrapper() });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(io).not.toHaveBeenCalled();
  });

  it("uses NEXT_PUBLIC_API_WS_URL when the token response has no url", async () => {
    process.env.NEXT_PUBLIC_API_WS_URL = "http://fallback.example";
    mockFetch({ "GET /realtime/token": () => ({ body: { token: "tok", url: "" } }) });
    renderHook(() => mod.useRealtimeRoom("lesson:l11"), { wrapper: wrapper() });
    await waitFor(() => expect(io).toHaveBeenCalledWith("http://fallback.example", expect.anything()));
    delete process.env.NEXT_PUBLIC_API_WS_URL;
  });

  it("setRealtimeManager swaps the singleton", () => {
    const fake = { ...mod.getRealtimeManager(), isConnected: () => true };
    const previous = mod.setRealtimeManager(fake);
    expect(mod.isRealtimeConnected()).toBe(true);
    mod.setRealtimeManager(previous);
    expect(mod.isRealtimeConnected()).toBe(false);
  });
});
