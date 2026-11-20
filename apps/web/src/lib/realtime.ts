"use client";

import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { RealtimeEvents } from "@helpo/shared";
import { api } from "./api";

/**
 * Socket.IO transport for live updates (spec section 10). Enabled with NEXT_PUBLIC_REALTIME=socket, when the API runs
 * on a long-lived host (Railway). The socket connects straight to the API origin with a 5-minute token from
 * GET /api/realtime/token (same-origin through the rewrite), joins `lesson:{id}` / `session:{id}` rooms and turns each
 * event into a React Query invalidation. Polling stays on as the fallback, so a dropped socket never freezes the UI.
 */
export const REALTIME_SOCKET = process.env.NEXT_PUBLIC_REALTIME === "socket";

type Room = `lesson:${string}` | `session:${string}`;

/** Query keys to refresh for an event. Pure, so it is unit-tested. */
export function keysForEvent(event: keyof RealtimeEvents, payload: { lessonId?: string; sessionId?: string }): unknown[][] {
  const keys: unknown[][] = [];
  if (payload.lessonId) keys.push(["lesson", payload.lessonId]);
  if (event === "resource.ready" || event === "resource.failed" || event === "lesson.status") keys.push(["lessons"]);
  if (payload.sessionId) keys.push(["session", payload.sessionId]);
  if (event === "session.studentJoined" || event === "session.answer" || event === "session.leaderboard") keys.push(["results"]);
  return keys;
}

const EVENTS: (keyof RealtimeEvents)[] = [
  "lesson.status",
  "resource.progress",
  "resource.ready",
  "resource.failed",
  "session.studentJoined",
  "session.question",
  "session.answer",
  "session.leaderboard",
];

function invalidate(client: QueryClient, event: keyof RealtimeEvents, payload: unknown) {
  for (const queryKey of keysForEvent(event, (payload ?? {}) as { lessonId?: string; sessionId?: string })) {
    void client.invalidateQueries({ queryKey });
  }
}

/** Subscribes the current page to one realtime room while mounted. No-op unless NEXT_PUBLIC_REALTIME=socket. */
export function useRealtimeRoom(room: Room | null) {
  const client = useQueryClient();
  useEffect(() => {
    if (!REALTIME_SOCKET || !room) return;
    let closed = false;
    let socket: import("socket.io-client").Socket | null = null;
    void (async () => {
      try {
        const [{ io }, auth] = await Promise.all([
          import("socket.io-client"),
          api<{ token: string; url: string }>("/realtime/token"),
        ]);
        const url = auth.url || process.env.NEXT_PUBLIC_API_WS_URL || "";
        if (closed || !url || !auth.token) return;
        socket = io(url, { auth: { token: auth.token }, transports: ["websocket"], reconnectionAttempts: 5 });
        socket.on("connect", () => socket?.emit("join", { room }));
        for (const event of EVENTS) socket.on(event, (payload: unknown) => invalidate(client, event, payload));
      } catch {
        // Realtime is an enhancement: polling keeps the screen correct.
      }
    })();
    return () => {
      closed = true;
      socket?.emit("leave", { room });
      socket?.close();
    };
  }, [client, room]);
}
