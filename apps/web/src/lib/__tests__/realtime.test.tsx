import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { makeClient, mockFetch } from "@/test/utils";

jest.setTimeout(30000);

describe("realtime (socket.io)", () => {
  type Handler = (payload?: unknown) => void;
  const handlers: Record<string, Handler> = {};
  const socket = { on: jest.fn((event: string, cb: Handler) => void (handlers[event] = cb)), emit: jest.fn(), close: jest.fn() };
  const io = jest.fn(() => socket);
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
  const wrapper = (client = makeClient()) => {
    const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return Wrapper;
  };

  it("maps each event to the queries it refreshes", () => {
    expect(mod.keysForEvent("resource.ready", { lessonId: "l1" })).toEqual([["lesson", "l1"], ["lessons"]]);
    expect(mod.keysForEvent("session.studentJoined", { sessionId: "s1" })).toEqual([["session", "s1"], ["results"]]);
    expect(mod.keysForEvent("resource.progress", {})).toEqual([]);
    expect(mod.keysForEvent("lesson.status", { lessonId: "l1" })).toContainEqual(["lessons"]);
  });

  it("connects with a token, joins the room and invalidates queries on events", async () => {
    mockFetch({ "GET /realtime/token": () => ({ body: { token: "tok", url: "http://ws.example" } }) });
    const client = makeClient();
    const spy = jest.spyOn(client, "invalidateQueries");
    const { unmount } = renderHook(() => mod.useRealtimeRoom("lesson:l1"), { wrapper: wrapper(client) });
    await waitFor(() => expect(io).toHaveBeenCalledWith("http://ws.example", expect.objectContaining({ auth: { token: "tok" }, transports: ["websocket"] })));
    handlers.connect();
    expect(socket.emit).toHaveBeenCalledWith("join", { room: "lesson:l1" });
    handlers["resource.ready"]({ lessonId: "l1" });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["lesson", "l1"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["lessons"] });
    handlers["session.answer"](undefined);
    unmount();
    expect(socket.emit).toHaveBeenCalledWith("leave", { room: "lesson:l1" });
    expect(socket.close).toHaveBeenCalled();
  });

  it("stays quiet without a room or when the token request fails (polling keeps working)", async () => {
    mockFetch({ "GET /realtime/token": () => ({ status: 500, body: { title: "x", status: 500 } }) });
    renderHook(() => mod.useRealtimeRoom(null), { wrapper: wrapper() });
    renderHook(() => mod.useRealtimeRoom("session:s1"), { wrapper: wrapper() });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(io).not.toHaveBeenCalled();
  });

  it("does not connect when the API returns no URL or token", async () => {
    mockFetch({ "GET /realtime/token": () => ({ body: { token: "", url: "" } }) });
    renderHook(() => mod.useRealtimeRoom("lesson:l9"), { wrapper: wrapper() });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(io).not.toHaveBeenCalled();
  });
});

