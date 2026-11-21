import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import type { Express, NextFunction, Request, Response } from "express";
import type { Auth } from "../auth/auth.factory";
import { toWebHeaders } from "../auth/teacher.guard";
import type { BullMqJobQueue } from "../jobs/bullmq.queue";
import { getPrisma } from "../prisma/prisma.service";

export const BOARD_PATH = "/admin/queues";

export function adminEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/** Only a signed-in user with role ADMIN, or whose email is in ADMIN_EMAILS, may see the board. */
export function adminGuard(auth: Pick<Auth, "api">, env: NodeJS.ProcessEnv = process.env, isAdminRole: (userId: string) => Promise<boolean> = async () => false) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const allowed = adminEmails(env);
    const session = await auth.api.getSession({ headers: toWebHeaders(req.headers) }).catch(() => null);
    const byEmail = Boolean(session?.user && allowed.includes(session.user.email.toLowerCase()));
    const byRole = Boolean(session?.user) && !byEmail && (await isAdminRole((session as { user: { id: string } }).user.id).catch(() => false));
    if (!session?.user || !(byEmail || byRole)) {
      res.status(404).type("application/problem+json").send({ type: "https://nibras.app/problems/404", title: "Not found", status: 404 });
      return;
    }
    next();
  };
}

/** Bull Board at /admin/queues, behind ADMIN_EMAILS. Only for the BullMQ driver. */
export function mountBullBoard(server: Express, queue: BullMqJobQueue, auth: Auth): void {
  const adapter = new ExpressAdapter();
  adapter.setBasePath(BOARD_PATH);
  createBullBoard({ queues: [new BullMQAdapter(queue.queue)], serverAdapter: adapter });
  const isAdminRole = async (id: string) => (await getPrisma().user.findUnique({ where: { id }, select: { role: true } }))?.role === "ADMIN";
  server.use(BOARD_PATH, adminGuard(auth, process.env, isAdminRole), adapter.getRouter());
}
