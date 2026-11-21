import { mockPrisma } from "../testing/mock-prisma";
import { AdminGuard } from "./admin.guard";
import { adminGuard } from "./bull-board";
import { AdminService } from "./admin.service";

const ctxFor = (req: Record<string, unknown>) => ({ switchToHttp: () => ({ getRequest: () => req }) }) as never;

describe("AdminGuard", () => {
  const make = (session: unknown, role: string | null) => {
    const db = mockPrisma();
    db.user.findUnique.mockResolvedValue(role ? { role } : null);
    const auth = { api: { getSession: jest.fn().mockResolvedValue(session) } };
    return { db, guard: new AdminGuard(auth as never, db) };
  };

  it("role ADMIN passes and is exposed on the request", async () => {
    const { guard, db } = make({ user: { id: "A1", name: "Nibras Admin", email: "admin@helpo.test" } }, "ADMIN");
    const req: Record<string, unknown> = { headers: {} };
    expect(await guard.canActivate(ctxFor(req))).toBe(true);
    expect(req.teacher).toEqual({ id: "A1", name: "Nibras Admin", email: "admin@helpo.test" });
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { id: "A1" }, select: { role: true } });
  });

  it("any other role gets a 404 (the area does not reveal itself); nobody signed in gets 401", async () => {
    const teacher = make({ user: { id: "T1", name: "t", email: "t@x.test" } }, "TEACHER");
    await expect(teacher.guard.canActivate(ctxFor({ headers: {} }))).rejects.toMatchObject({ status: 404 });
    const gone = make({ user: { id: "T2", name: "t", email: "t@x.test" } }, null);
    await expect(gone.guard.canActivate(ctxFor({ headers: {} }))).rejects.toMatchObject({ status: 404 });
    const anon = make(null, null);
    await expect(anon.guard.canActivate(ctxFor({ headers: {} }))).rejects.toMatchObject({ status: 401 });
  });
});

describe("Bull Board guard allows role ADMIN as well as ADMIN_EMAILS", () => {
  const run = async (email: string | null, env: Record<string, string>, isAdminRole?: (id: string) => Promise<boolean>) => {
    const auth = { api: { getSession: jest.fn().mockResolvedValue(email ? { user: { id: "U1", email } } : null) } };
    const res = { status: jest.fn().mockReturnThis(), type: jest.fn().mockReturnThis(), send: jest.fn() };
    const next = jest.fn();
    await adminGuard(auth as never, env as unknown as NodeJS.ProcessEnv, isAdminRole)({ headers: {} } as never, res as never, next);
    return { res, next };
  };

  it("a user with role ADMIN gets in even when ADMIN_EMAILS is empty", async () => {
    const isAdminRole = jest.fn().mockResolvedValue(true);
    expect((await run("admin@helpo.test", {}, isAdminRole)).next).toHaveBeenCalled();
    expect(isAdminRole).toHaveBeenCalledWith("U1");
  });

  it("a non-admin role is a 404, a failing role lookup is a 404, and the e-mail allow-list still works", async () => {
    expect((await run("t@x.test", {}, async () => false)).res.status).toHaveBeenCalledWith(404);
    expect((await run("t@x.test", {}, async () => Promise.reject(new Error("db")))).res.status).toHaveBeenCalledWith(404);
    expect((await run("t@x.test", {})).res.status).toHaveBeenCalledWith(404);
    const viaEmail = jest.fn();
    expect((await run("boss@x.test", { ADMIN_EMAILS: "boss@x.test" }, viaEmail)).next).toHaveBeenCalled();
    expect(viaEmail).not.toHaveBeenCalled(); // allow-listed: no role lookup needed
    expect((await run(null, {}, async () => true)).res.status).toHaveBeenCalledWith(404);
  });
});

describe("AdminService.overview", () => {
  function setup() {
    const db = mockPrisma();
    db.school.count.mockResolvedValue(1);
    db.user.count.mockResolvedValue(2);
    db.classRoom.count.mockResolvedValue(5);
    db.student.count.mockResolvedValue(104);
    db.lesson.count.mockResolvedValue(6);
    db.activitySession.count.mockResolvedValue(5);
    db.answer.count.mockResolvedValue(700);
    db.lesson.groupBy.mockResolvedValue([{ status: "READY", _count: { _all: 5 } }, { status: "FAILED", _count: { _all: 1 } }]);
    db.resource.groupBy.mockResolvedValue([
      { model: "claude-sonnet-5-5", _count: { _all: 20 }, _sum: { tokensIn: 1000, tokensOut: 4000 } },
      { model: "demo", _count: { _all: 5 }, _sum: { tokensIn: null, tokensOut: null } },
    ]);
    db.lesson.findMany.mockResolvedValue([{ id: "L1", titleEn: null, titleAr: "التمثيل الضوئي", status: "READY", createdAt: new Date("2026-11-20T10:00:00Z"), teacher: { name: "Alex Green" } }]);
    db.activitySession.findMany.mockResolvedValue([{ id: "SE1", type: "LIVE_QUIZ", joinCode: "202020", status: "LOBBY", createdAt: new Date("2026-11-20T11:00:00Z"), _count: { participants: 3 } }]);
    return { db, service: new AdminService(db) };
  }

  it("totals, lessons by status, AI tokens summed with a per-model breakdown, recents and runtime flags", async () => {
    const { db, service } = setup();
    const o = await service.overview({ QUEUE_DRIVER: "inline", REALTIME: "poll", DEMO_LOGIN: "true", ANTHROPIC_API_KEY: "k" } as unknown as NodeJS.ProcessEnv);
    expect(o.totals).toEqual({ schools: 1, teachers: 2, classes: 5, students: 104, lessons: 6, sessions: 5, answers: 700 });
    expect(o.lessonsByStatus).toEqual({ READY: 5, FAILED: 1 });
    expect(o.ai).toEqual({
      resources: 25,
      tokensIn: 1000,
      tokensOut: 4000,
      byModel: [
        { model: "claude-sonnet-5-5", resources: 20, tokensIn: 1000, tokensOut: 4000 },
        { model: "demo", resources: 5, tokensIn: 0, tokensOut: 0 },
      ],
    });
    expect(o.recentLessons).toEqual([{ id: "L1", title: "التمثيل الضوئي", teacherName: "Alex Green", status: "READY", createdAt: "2026-11-20T10:00:00.000Z" }]);
    expect(o.recentSessions[0]).toMatchObject({ joinCode: "202020", joined: 3, status: "LOBBY" });
    expect(o.runtime).toEqual({ queueDriver: "inline", realtime: "poll", aiMode: "claude", demoLogin: true });
    expect(db.lesson.findMany.mock.calls[0][0].take).toBe(10);
    expect(db.activitySession.findMany.mock.calls[0][0].take).toBe(10);
    expect(JSON.stringify(o)).not.toMatch(/fullName|password|email/);
  });

  it("an empty platform and demo AI mode", async () => {
    const { db, service } = setup();
    db.resource.groupBy.mockResolvedValue([]);
    db.lesson.groupBy.mockResolvedValue([]);
    db.lesson.findMany.mockResolvedValue([]);
    db.activitySession.findMany.mockResolvedValue([]);
    const o = await service.overview({} as NodeJS.ProcessEnv);
    expect(o.ai).toEqual({ resources: 0, tokensIn: 0, tokensOut: 0, byModel: [] });
    expect(o.lessonsByStatus).toEqual({});
    expect(o.runtime).toMatchObject({ aiMode: "demo", demoLogin: false, queueDriver: "inline" });
  });
});
