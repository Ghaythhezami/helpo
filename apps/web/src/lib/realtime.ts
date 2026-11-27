"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { LessonDetail } from "@helpo/shared";
import { ApiError, api } from "./api";
import type { LessonStatusView } from "./queries";

/**
 * Socket.IO transport for live updates (spec section 10). Enabled with NEXT_PUBLIC_REALTIME=socket, when the API runs
 * on a long-lived host (Railway). ONE socket per browser tab serves every component: rooms (`lesson:{id}` /
 * `session:{id}`) are ref-counted, the 5-minute token is fetched once and shared, and reconnects use exponential
 * backoff with jitter. Events patch or refresh React Query caches. While the socket is connected the query hooks stop
 * polling; while it is down (or realtime is off) they fall back to a slow poll.
 */
export const REALTIME_SOCKET = process.env.NEXT_PUBLIC_REALTIME === "socket";

export type Room = `lesson:${string}` | `session:${string}`;

/** Event names the socket listens to. Plain strings: the shared RealtimeEvents type may lag behind the API. */
export const REALTIME_EVENTS = [
  "lesson.status",
  "resource.progress",
  "resource.ready",
  "resource.failed",
  "session.state",
  "session.studentJoined",
  "session.question",
  "session.answer",
  "session.leaderboard",
] as const;

type EventPayload = { lessonId?: string; sessionId?: string; kind?: string; percent?: number };

/** Query keys to refresh for an event. Pure, so it is unit-tested. `resource.progress` patches the cache instead. */
export function keysForEvent(event: string, payload: EventPayload): unknown[][] {
  const keys: unknown[][] = [];
  if (event === "resource.ready" || event === "resource.failed" || event === "lesson.status") {
    if (payload.lessonId) keys.push(["lesson", payload.lessonId]);
    keys.push(["lessons"]);
  }
  if (event.startsWith("session.") && payload.sessionId) {
    keys.push(["session", payload.sessionId], ["play", "quiz", payload.sessionId]);
    if (event === "session.answer" || event === "session.state" || event === "session.studentJoined") keys.push(["results"]);
  }
  return keys;
}

/** Writes a progress tick into the cached lesson (and the light status) without a request. */
function patchProgress(client: QueryClient, payload: EventPayload) {
  const { lessonId, kind, percent } = payload;
  if (!lessonId || !kind || typeof percent !== "number") return;
  const progress = Math.max(0, Math.min(100, Math.round(percent)));
  client.setQueryData<LessonDetail>(["lesson", lessonId], (old) =>
    old
      ? { ...old, resources: old.resources.map((r) => (r.kind === kind && r.status !== "READY" ? { ...r, status: "WORKING" as const, progress } : r)) }
      : old,
  );
  client.setQueryData<LessonStatusView>(["lesson", lessonId, "status"], (old) =>
    old
      ? { ...old, resources: old.resources.map((r) => (r.kind === kind && r.status !== "READY" ? { ...r, status: "WORKING" as const, progress } : r)) }
      : old,
  );
}

/** Turns one socket event into cache work. Only ready / failed / status events cause refetches of the lesson. */
export function applyRealtimeEvent(client: QueryClient, event: string, payload: unknown) {
  const p = (payload ?? {}) as EventPayload;
  if (event === "resource.progress") {
    patchProgress(client, p);
    return;
  }
  for (const queryKey of keysForEvent(event, p)) void client.invalidateQueries({ queryKey });
}

/* -------------------------------- manager -------------------------------- */

export interface RealtimeSocket {
  on(event: string, cb: (payload?: unknown) => void): unknown;
  emit(event: string, payload?: unknown): unknown;
  close(): unknown;
}
export interface RealtimeAuth {
  token: string;
  url: string;
}
export type IoFactory = (
  url: string,
  opts: { auth: { token: string }; transports: string[]; reconnection: boolean },
) => RealtimeSocket | Promise<RealtimeSocket>;
export type RoomHandler = (event: string, payload: EventPayload) => void;

export interface RealtimeManager {
  /** Joins `room` (first subscriber) and returns the unsubscribe function (last one leaves). */
  subscribe(room: Room, handler: RoomHandler): () => void;
  isConnected(): boolean;
  subscribeConnected(listener: () => void): () => void;
  /** Number of distinct rooms currently joined. */
  roomCount(): number;
  /** Closes everything at once (tests, sign-out). */
  destroy(): void;
}

export interface RealtimeManagerOptions {
  enabled?: boolean;
  ioFactory?: IoFactory;
  /** Resolves null when realtime is not available (no URL, not signed in): the manager then stays quiet. */
  fetchToken?: () => Promise<RealtimeAuth | null>;
  now?: () => number;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
  random?: () => number;
}

export const TOKEN_TTL_MS = 5 * 60_000;
export const TOKEN_MARGIN_MS = 30_000;
export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_MAX_MS = 30_000;
export const CLOSE_GRACE_MS = 3000;

const defaultIo: IoFactory = async (url, opts) => {
  const { io } = await import("socket.io-client");
  return io(url, opts) as unknown as RealtimeSocket;
};

const defaultFetchToken = async (): Promise<RealtimeAuth | null> => {
  try {
    const auth = await api<{ token: string; url: string }>("/realtime/token");
    const url = auth.url || process.env.NEXT_PUBLIC_API_WS_URL || "";
    return url && auth.token ? { token: auth.token, url } : null;
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) return null;
    throw error;
  }
};

export function createRealtimeManager(options: RealtimeManagerOptions = {}): RealtimeManager {
  const enabled = options.enabled ?? true;
  const ioFactory = options.ioFactory ?? defaultIo;
  const fetchToken = options.fetchToken ?? defaultFetchToken;
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimeoutFn ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const random = options.random ?? Math.random;

  const rooms = new Map<Room, Map<RoomHandler, number>>();
  const listeners = new Set<() => void>();
  let connected = false;
  let socket: RealtimeSocket | null = null;
  let connecting = false;
  let gaveUp = false;
  let everConnected = false;
  let attempt = 0;
  let reconnectTimer: unknown = null;
  let closeTimer: unknown = null;
  let tokenCache: { auth: RealtimeAuth; expiresAt: number } | null = null;
  let tokenInflight: Promise<RealtimeAuth | null> | null = null;

  const setConnected = (value: boolean) => {
    if (connected === value) return;
    connected = value;
    for (const l of [...listeners]) l();
  };

  function getToken(): Promise<RealtimeAuth | null> {
    if (tokenCache && now() < tokenCache.expiresAt) return Promise.resolve(tokenCache.auth);
    if (!tokenInflight) {
      tokenInflight = fetchToken()
        .then((auth) => {
          if (auth) tokenCache = { auth, expiresAt: now() + TOKEN_TTL_MS - TOKEN_MARGIN_MS };
          return auth;
        })
        .finally(() => {
          tokenInflight = null;
        });
    }
    return tokenInflight;
  }

  function dispatch(event: string, payload: unknown) {
    const p = (payload ?? {}) as EventPayload;
    const id = event.startsWith("session.") ? p.sessionId : p.lessonId;
    const handlers = new Set<RoomHandler>();
    if (id) {
      for (const h of rooms.get(`${event.startsWith("session.") ? "session" : "lesson"}:${id}` as Room)?.keys() ?? []) handlers.add(h);
    } else {
      for (const m of rooms.values()) for (const h of m.keys()) handlers.add(h);
    }
    for (const h of handlers) h(event, p);
  }

  function scheduleReconnect() {
    if (reconnectTimer !== null || rooms.size === 0) return;
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.min(attempt, 10));
    attempt += 1;
    const delay = Math.round(base * (0.5 + random() / 2));
    reconnectTimer = setTimer(() => {
      reconnectTimer = null;
      void open();
    }, delay);
  }

  function lost(s: RealtimeSocket) {
    if (socket !== s) return;
    socket = null;
    try {
      s.close();
    } catch {
      // already closed
    }
    tokenCache = null;
    setConnected(false);
    scheduleReconnect();
  }

  function attach(s: RealtimeSocket) {
    s.on("connect", () => {
      if (socket !== s) return;
      attempt = 0;
      const resync = everConnected;
      everConnected = true;
      setConnected(true);
      for (const room of rooms.keys()) s.emit("join", { room });
      if (resync) {
        // Events may have been missed while we were down: refresh whatever the rooms show.
        for (const room of [...rooms.keys()]) {
          const [kind, id] = room.split(":");
          dispatch(kind === "lesson" ? "lesson.status" : "session.state", kind === "lesson" ? { lessonId: id } : { sessionId: id });
        }
      }
    });
    s.on("disconnect", () => lost(s));
    s.on("connect_error", () => lost(s));
    for (const event of REALTIME_EVENTS) s.on(event, (payload) => socket === s && dispatch(event, payload));
  }

  async function open() {
    if (!enabled || socket || connecting || gaveUp || rooms.size === 0) return;
    connecting = true;
    try {
      const auth = await getToken();
      if (!auth) {
        gaveUp = true;
        return;
      }
      if (rooms.size === 0) return;
      const s = await ioFactory(auth.url, { auth: { token: auth.token }, transports: ["websocket"], reconnection: false });
      if (rooms.size === 0) {
        s.close();
        return;
      }
      socket = s;
      attach(s);
    } catch {
      scheduleReconnect();
    } finally {
      connecting = false;
    }
  }

  function shutdown() {
    if (reconnectTimer !== null) clearTimer(reconnectTimer);
    reconnectTimer = null;
    const s = socket;
    socket = null;
    s?.close();
    setConnected(false);
    gaveUp = false;
    everConnected = false;
    attempt = 0;
  }

  function scheduleClose() {
    if (closeTimer !== null) return;
    closeTimer = setTimer(() => {
      closeTimer = null;
      if (rooms.size === 0) shutdown();
    }, CLOSE_GRACE_MS);
  }

  return {
    subscribe(room, handler) {
      if (!enabled) return () => undefined;
      if (closeTimer !== null) {
        clearTimer(closeTimer);
        closeTimer = null;
      }
      let handlers = rooms.get(room);
      const isNew = !handlers;
      if (!handlers) {
        handlers = new Map();
        rooms.set(room, handlers);
      }
      handlers.set(handler, (handlers.get(handler) ?? 0) + 1);
      if (isNew && socket && connected) socket.emit("join", { room });
      void open();
      let done = false;
      return () => {
        if (done) return;
        done = true;
        const current = rooms.get(room);
        if (!current) return;
        const count = (current.get(handler) ?? 0) - 1;
        if (count > 0) current.set(handler, count);
        else current.delete(handler);
        if (current.size > 0) return;
        rooms.delete(room);
        if (socket && connected) socket.emit("leave", { room });
        if (rooms.size === 0) scheduleClose();
      };
    },
    isConnected: () => connected,
    subscribeConnected(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    roomCount: () => rooms.size,
    destroy() {
      rooms.clear();
      if (closeTimer !== null) clearTimer(closeTimer);
      closeTimer = null;
      shutdown();
    },
  };
}

/* ------------------------------ app singleton ------------------------------ */

let manager: RealtimeManager = createRealtimeManager({ enabled: REALTIME_SOCKET });

export const getRealtimeManager = () => manager;
/** Swaps the singleton (tests). Returns the previous one. */
export function setRealtimeManager(next: RealtimeManager): RealtimeManager {
  const previous = manager;
  manager = next;
  return previous;
}

/** Module-level getter for refetchInterval functions. */
export const isRealtimeConnected = () => manager.isConnected();

/** True while the shared socket is connected; re-renders on change so query hooks recompute their polling. */
export function useRealtimeConnected(): boolean {
  const m = manager;
  return useSyncExternalStore(m.subscribeConnected, m.isConnected, () => false);
}

const handlers = new WeakMap<QueryClient, RoomHandler>();
function handlerFor(client: QueryClient): RoomHandler {
  let h = handlers.get(client);
  if (!h) {
    h = (event, payload) => applyRealtimeEvent(client, event, payload);
    handlers.set(client, h);
  }
  return h;
}

/** Subscribes the current page to one realtime room while mounted. No-op unless NEXT_PUBLIC_REALTIME=socket. */
export function useRealtimeRoom(room: Room | null) {
  const client = useQueryClient();
  useEffect(() => {
    if (!room) return;
    return manager.subscribe(room, handlerFor(client));
  }, [client, room]);
}
