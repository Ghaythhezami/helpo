import { allowedOrigins } from "../common/origins";
import { REALTIME_TOKEN_TTL_SECONDS, signRealtimeToken, verifyRealtimeToken } from "../common/realtime-token";
import { mockPrisma } from "../testing/mock-prisma";
import { adminEmails, adminGuard } from "../admin/bull-board";
import { captureError, initSentry, sentryEnabled } from "../observability/sentry";
import { canJoin } from "./realtime.gateway";
import { RealtimeController } from "./realtime.controller";

beforeAll(() => {
  process.env.STUDENT_COOKIE_SECRET = "unit-test-secret-1234567890";
});

describe("realtime token", () => {
  const now = 1_800_000_000;

  it("signs a 5-minute token for a teacher or a student and verifies it", () => {
    const t = signRealtimeToken({ kind: "teacher", id: "T1" }, now);
    expect(verifyRealtimeToken(t, now + 10)).toMatchObject({ kind: "teacher", id: "T1", exp: now + REALTIME_TOKEN_TTL_SECONDS });
    expect(REALTIME_TOKEN_TTL_SECONDS).toBe(300);
    expect(verifyRealtimeToken(signRealtimeToken({ kind: "student", id: "S1", classId: "C1" }, now), now)).toMatchObject({ kind: "student", classId: "C1" });
  });

  it("rejects expired, tampered, foreign and malformed tokens", () => {
    const t = signRealtimeToken({ kind: "teacher", id: "T1" }, now);
    expect(verifyRealtimeToken(t, now + 301)).toBeNull();
    const [payload, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ kind: "teacher", id: "ADMIN", exp: now + 100 })).toString("base64url");
    expect(verifyRealtimeToken(`${forged}.${sig}`, now)).toBeNull();
    expect(verifyRealtimeToken(`${payload}.x`, now)).toBeNull();
    expect(verifyRealtimeToken(undefined, now)).toBeNull();
    expect(verifyRealtimeToken("a.b.c", now)).toBeNull();
    process.env.STUDENT_COOKIE_SECRET = "another-secret-entirely-1234";
    expect(verifyRealtimeToken(t, now)).toBeNull();
    process.env.STUDENT_COOKIE_SECRET = "unit-test-secret-1234567890";
  });
});

describe("GET /realtime/token", () => {
  const req = (cookie?: string) => ({ headers: cookie ? { cookie } : {} }) as never;

  it("gives a teacher token for a Better Auth session and returns the socket url", async () => {
    process.env.API_WS_URL = "https://api.example";
    const c = new RealtimeController({ api: { getSession: jest.fn().mockResolvedValue({ user: { id: "T1" } }) } } as never);
    const out = await c.token(req());
    expect(out.url).toBe("https://api.example");
    expect(verifyRealtimeToken(out.token)).toMatchObject({ kind: "teacher", id: "T1" });
    delete process.env.API_WS_URL;
  });

  it("gives a student token for a valid student cookie and 401 for nobody", async () => {
    const { signStudentToken } = jest.requireActual<typeof import("../common/student-cookie")>("../common/student-cookie");
    const cookie = `helpo_student=${signStudentToken({ studentId: "S1", classId: "C1", exp: Math.floor(Date.now() / 1000) + 100 })}`;
    const c = new RealtimeController({ api: { getSession: jest.fn().mockResolvedValue(null) } } as never);
    expect(verifyRealtimeToken((await c.token(req(cookie))).token)).toMatchObject({ kind: "student", id: "S1", classId: "C1" });
    await expect(c.token(req())).rejects.toMatchObject({ status: 401 });
    await expect(c.token(req("helpo_student=forged.value"))).rejects.toMatchObject({ status: 401 });
  });
});

describe("room authorization", () => {
  it("teachers join their own lessons and sessions only; students only sessions of their class", async () => {
    const db = mockPrisma();
    db.lesson.findFirst.mockResolvedValue({ id: "L1" });
    db.activitySession.findFirst.mockResolvedValue({ id: "SE1" });
    const teacher = { kind: "teacher" as const, id: "T1", exp: 1 };
    const student = { kind: "student" as const, id: "S1", classId: "C1", exp: 1 };
    expect(await canJoin(db, teacher, "lesson:L1")).toBe(true);
    expect(db.lesson.findFirst).toHaveBeenCalledWith({ where: { id: "L1", teacherId: "T1" }, select: { id: true } });
    expect(await canJoin(db, teacher, "session:SE1")).toBe(true);
    expect(await canJoin(db, student, "session:SE1")).toBe(true);
    expect(db.activitySession.findFirst).toHaveBeenLastCalledWith({ where: { id: "SE1", classId: "C1" }, select: { id: true } });
    expect(await canJoin(db, student, "lesson:L1")).toBe(false);
    expect(await canJoin(db, teacher, "class:C1")).toBe(false);
    expect(await canJoin(db, teacher, "nonsense")).toBe(false);
    db.lesson.findFirst.mockResolvedValue(null);
    expect(await canJoin(db, teacher, "lesson:OTHERS")).toBe(false);
  });
});

describe("origins", () => {
  it("WEB_URL (or WEB_ORIGIN) plus CORS_ORIGINS, trimmed and de-duplicated, for HTTP and Socket.IO", () => {
    const env = { WEB_URL: "https://web.example/", CORS_ORIGINS: " https://a.example, https://web.example ,https://b.example/ " } as unknown as NodeJS.ProcessEnv;
    expect(allowedOrigins(env)).toEqual(["https://web.example", "https://a.example", "https://b.example"]);
    expect(allowedOrigins({ WEB_ORIGIN: "http://localhost:3000" } as unknown as NodeJS.ProcessEnv)).toEqual(["http://localhost:3000"]);
    expect(allowedOrigins({} as NodeJS.ProcessEnv)).toEqual([]);
  });
});

describe("Bull Board guard and Sentry", () => {
  const run = async (email: string | null, env: Record<string, string>) => {
    const auth = { api: { getSession: jest.fn().mockResolvedValue(email ? { user: { email } } : null) } };
    const res = { status: jest.fn().mockReturnThis(), type: jest.fn().mockReturnThis(), send: jest.fn() };
    const next = jest.fn();
    await adminGuard(auth as never, env as unknown as NodeJS.ProcessEnv)({ headers: {} } as never, res as never, next);
    return { res, next };
  };

  it("only ADMIN_EMAILS may open the board; everyone else gets a 404", async () => {
    const env = { ADMIN_EMAILS: "Boss@Example.com, other@x.test" };
    expect((await run("boss@example.com", env)).next).toHaveBeenCalled();
    expect((await run("teacher@x.test", env)).res.status).toHaveBeenCalledWith(404);
    expect((await run(null, env)).res.status).toHaveBeenCalledWith(404);
    expect((await run("boss@example.com", {})).res.status).toHaveBeenCalledWith(404); // no admins configured
    expect(adminEmails({ ADMIN_EMAILS: " A@x.test ,, b@x.test" } as unknown as NodeJS.ProcessEnv)).toEqual(["a@x.test", "b@x.test"]);
  });

  it("Sentry stays off without SENTRY_DSN and never throws", () => {
    expect(initSentry({} as NodeJS.ProcessEnv)).toBe(false);
    expect(sentryEnabled()).toBe(false);
    expect(() => captureError(new Error("x"))).not.toThrow();
  });
});
