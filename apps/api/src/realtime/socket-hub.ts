import type { Server } from "socket.io";
import { EventBus } from "../jobs/job-queue";

/** Holds the Socket.IO server once the gateway has started (REALTIME=socket). */
export const socketHub: { server?: Server } = {};

/** Emits to a room (`lesson:{id}`, `session:{id}`); a no-op until the gateway is up. */
export class SocketEventBus extends EventBus {
  emit(room: string, event: string, payload: unknown): void {
    socketHub.server?.to(room).emit(event, payload);
  }
}
