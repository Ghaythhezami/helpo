import { Logger } from "@nestjs/common";
import { ConnectedSocket, MessageBody, OnGatewayInit, SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { allowedOrigins } from "../common/origins";
import { verifyRealtimeToken, type RealtimeIdentity } from "../common/realtime-token";
import { PrismaService } from "../prisma/prisma.service";
import { socketHub } from "./socket-hub";

/** May this identity join this room? Teachers: their own lessons and sessions. Students: sessions of their class. */
export async function canJoin(prisma: PrismaService, identity: RealtimeIdentity, room: string): Promise<boolean> {
  const [kind, id] = room.split(":");
  if (!id) return false;
  if (identity.kind === "teacher") {
    if (kind === "lesson") return Boolean(await prisma.lesson.findFirst({ where: { id, teacherId: identity.id }, select: { id: true } }));
    if (kind === "session") return Boolean(await prisma.activitySession.findFirst({ where: { id, lesson: { teacherId: identity.id } }, select: { id: true } }));
    return false;
  }
  if (kind !== "session") return false;
  return Boolean(await prisma.activitySession.findFirst({ where: { id, classId: identity.classId ?? "" }, select: { id: true } }));
}

/**
 * Socket.IO on the same port (REALTIME=socket, IoAdapter). The handshake carries a 5-minute signed token
 * (`auth: { token }` from GET /api/realtime/token); a cross-site cookie would not reach this host from the web domain.
 */
@WebSocketGateway({ cors: { origin: allowedOrigins(), credentials: true } })
export class RealtimeGateway implements OnGatewayInit {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private readonly prisma: PrismaService) {}

  afterInit(server: Server): void {
    socketHub.server = server;
    server.use((socket, next) => {
      const identity = verifyRealtimeToken((socket.handshake.auth as { token?: string } | undefined)?.token);
      if (!identity) return next(new Error("unauthorized"));
      socket.data.identity = identity;
      next();
    });
    this.logger.log("Socket.IO gateway ready");
  }

  @SubscribeMessage("join")
  async join(@ConnectedSocket() socket: Socket, @MessageBody() body: { room?: string }): Promise<{ ok: boolean }> {
    const identity = socket.data.identity as RealtimeIdentity | undefined;
    if (!identity || typeof body?.room !== "string" || !(await canJoin(this.prisma, identity, body.room))) return { ok: false };
    await socket.join(body.room);
    return { ok: true };
  }

  @SubscribeMessage("leave")
  async leave(@ConnectedSocket() socket: Socket, @MessageBody() body: { room?: string }): Promise<{ ok: boolean }> {
    if (typeof body?.room === "string") await socket.leave(body.room);
    return { ok: true };
  }
}
