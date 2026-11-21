import { EventEmitter } from "node:events";
import { RATE_LIMIT_KEY } from "./rate-limit";
import { HourlyLimiter, DEMO_EMAILS, isDemoEmail, lessonQuotaLimit } from "./quota";
import { REQUEST_ID_HEADER, isQuietPath, requestContext, resolveRequestId, routePattern, type AccessLine } from "./request-context";
import { ProblemFilter } from "./problem.filter";
import { notFound } from "./problem";
import { authRateLimit, redisSecondaryStorage } from "../auth/auth-rate-limit";
import { JoinController } from "../join/join.controller";
import { PlayController } from "../play/play.controller";
import { RealtimeController } from "../realtime/realtime.controller";
import { RESERVED_JOIN_CODES, SessionsService } from "../sessions/sessions.service";
import { mockPrisma } from "../testing/mock-prisma";
import { UploadLimiter } from "../lessons/pipeline.service";

const meta = (target: object, method: string) => Reflect.getMetadata(RATE_LIMIT_KEY, (target as Record<string, object>)[method]) as { bucket: string; max: number };

describe("public join lookups are throttled per IP, generously", () => {
  it("lookups allow 120/min and joins 60/min (a classroom behind one NAT is never locked out)", () => {
    const proto = JoinController.prototype;
    expect(meta(proto, "classes")).toEqual(expect.objectContaining({ bucket: "join-lookup", max: 120 }));
    expect(meta(proto, "students")).toEqual(expect.objectContaining({ bucket: "join-lookup", max: 120 }));
    expect(meta(proto, "byCode")).toEqual(expect.objectContaining({ bucket: "join-lookup", max: 120 }));
    expect(meta(proto, "create")).toEqual(expect.objectContaining({ bucket: "join", max: 60 }));
    expect(meta(PlayController.prototype, "byCode")).toEqual(expect.objectContaining({ bucket: "join-lookup", max: 120 }));
    expect(meta(PlayController.prototype, "joinByCode")).toEqual(expect.objectContaining({ bucket: "join", max: 60 }));
    expect(meta(RealtimeController.prototype, "token")).toBeDefined();
  });
});

describe("Better Auth rate limit storage", () => {
  it("uses the database table by default and Redis secondary storage when REDIS_URL is set", () => {
    expect(authRateLimit({} as NodeJS.ProcessEnv).storage).toBe("database");
    expect(authRateLimit({ REDIS_URL: "redis://x" } as unknown as NodeJS.ProcessEnv).storage).toBe("secondary-storage");
  });

  it("is enabled in production (or on request), and keeps sign-in and sign-up strict", () => {
    expect(authRateLimit({ NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv).enabled).toBe(true);
    expect(authRateLimit({ NODE_ENV: "test" } as unknown as NodeJS.ProcessEnv).enabled).toBe(false);
    expect(authRateLimit({ BETTER_AUTH_RATE_LIMIT: "true" } as unknown as NodeJS.ProcessEnv).enabled).toBe(true);
    const r = authRateLimit({} as NodeJS.ProcessEnv);
    expect(r.customRules["/sign-in/email"].max).toBeLessThanOrEqual(10);
    expect(r.customRules["/sign-in/email"].max).toBeLessThan(r.max);
    expect(r.customRules["/forget-password"].max).toBeLessThanOrEqual(r.customRules["/sign-in/email"].max);
  });

  it("the Redis secondary storage is a fixed-window counter plus get/set/delete with TTL", async () => {
    const data = new Map<string, string>();
    const expire = jest.fn();
    const client = {
      get: jest.fn(async (k: string) => data.get(k) ?? null),
      getdel: jest.fn(async (k: string) => {
        const v = data.get(k) ?? null;
        data.delete(k);
        return v;
      }),
      incr: jest.fn(async (k: string) => {
        const n = Number(data.get(k) ?? 0) + 1;
        data.set(k, String(n));
        return n;
      }),
      expire,
      set: jest.fn(async (k: string, v: string) => void data.set(k, v)),
      del: jest.fn(async (k: string) => void data.delete(k)),
    };
    const s = redisSecondaryStorage(client);
    expect(await s.increment("rl:a", 60)).toBe(1);
    expect(await s.increment("rl:a", 60)).toBe(2);
    expect(expire).toHaveBeenCalledTimes(1); // TTL only on creation: a fixed window
    expect(expire).toHaveBeenCalledWith("rl:a", 60);
    await s.set("k", "v", 30);
    expect(client.set).toHaveBeenLastCalledWith("k", "v", "EX", 30);
    await s.set("k2", "v2");
    expect(client.set).toHaveBeenLastCalledWith("k2", "v2");
    expect(await s.get("k")).toBe("v");
    expect(await s.getAndDelete("k")).toBe("v");
    expect(await s.get("k")).toBeNull();
    await s.delete("k2");
    expect(data.has("k2")).toBe(false);
  });
});

describe("UploadLimiter on the shared store", () => {
  it("with a Redis-style store it counts per teacher with a one-hour expiry and answers 429 + retryAfter over the max", async () => {
    const counts = new Map<string, number>();
    const store = { incr: jest.fn(async (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1) && (counts.get(k) as number)), pexpire: jest.fn().mockResolvedValue(1) };
    const limiter = new UploadLimiter(store);
    for (let i = 0; i < 3; i++) await limiter.check("T1", 0, 3);
    await expect(limiter.check("T1", 0, 3)).rejects.toMatchObject({ status: 429, extensions: { retryAfter: 3600 } });
    await expect(limiter.check("T2", 0, 3)).resolves.toBeUndefined();
    expect(store.pexpire).toHaveBeenCalledWith("rl:upload:T1", 3_600_000);
    expect(store.pexpire).toHaveBeenCalledTimes(2); // once per teacher, on the first hit
  });

  it("falls back to memory when Redis is down, and uses memory without a store", async () => {
    const down = new UploadLimiter({ incr: jest.fn().mockRejectedValue(new Error("redis down")), pexpire: jest.fn() });
    await down.check("T1", 1000, 2);
    await down.check("T1", 1001, 2);
    await expect(down.check("T1", 1002, 2)).rejects.toMatchObject({ status: 429 });
    await expect(down.check("T1", 1002 + 3_600_001, 2)).resolves.toBeUndefined(); // the hour passed
    const memory = new UploadLimiter(undefined);
    for (let i = 0; i < 10; i++) await memory.check("T9", 5000 + i);
    await expect(memory.check("T9", 6000)).rejects.toMatchObject({ status: 429 });
  });
});

describe("request id and access log", () => {
  const UUID = "0b8f6f5e-2c1d-4a53-9a1e-7b8d3f2a1c44";

  it("accepts an incoming valid uuid, otherwise generates one", () => {
    expect(resolveRequestId(UUID)).toBe(UUID);
    expect(resolveRequestId(UUID.toUpperCase())).toBe(UUID);
    expect(resolveRequestId([UUID, "x"])).toBe(UUID);
    for (const bad of ["not-a-uuid", "1234", "'; DROP TABLE", "0b8f6f5e-2c1d-4a53-9a1e-7b8d3f2a1c4", undefined, ""]) {
      const id = resolveRequestId(bad as string | undefined);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(id).not.toBe(bad);
    }
    expect(resolveRequestId(undefined)).not.toBe(resolveRequestId(undefined));
  });

  function run(req: Record<string, unknown>, status = 200) {
    const lines: AccessLine[] = [];
    const res = Object.assign(new EventEmitter(), { statusCode: status, headers: {} as Record<string, string>, setHeader(k: string, v: string) { this.headers[k] = v; } });
    const next = jest.fn();
    requestContext((l) => lines.push(l))({ headers: {}, method: "GET", baseUrl: "", originalUrl: "/api/x", ...req } as never, res as never, next);
    res.emit("finish");
    return { lines, res, next };
  }

  it("echoes the id in the response header and logs method, route pattern, status, ms and the id: nothing else", () => {
    const { lines, res, next } = run({ headers: { [REQUEST_ID_HEADER]: UUID }, method: "POST", baseUrl: "/api", route: { path: "/lessons/:id" }, originalUrl: "/api/lessons/L1?code=202020", body: { name: "Sara Ahmed" }, ip: "10.0.0.1" }, 201);
    expect(next).toHaveBeenCalled();
    expect(res.headers[REQUEST_ID_HEADER]).toBe(UUID);
    expect(lines).toHaveLength(1);
    expect(Object.keys(lines[0]).sort()).toEqual(["method", "ms", "requestId", "route", "status"]);
    expect(lines[0]).toMatchObject({ method: "POST", route: "/api/lessons/:id", status: 201, requestId: UUID });
    expect(lines[0].ms).toBeGreaterThanOrEqual(0);
    const text = JSON.stringify(lines[0]);
    expect(text).not.toMatch(/10\.0\.0\.1|Sara|202020|L1/); // no ip, no body, no query string, no raw ids
  });

  it("a request without a valid id gets a generated one; unmatched routes are logged as such", () => {
    const { lines, res } = run({ headers: { [REQUEST_ID_HEADER]: "garbage" } });
    expect(res.headers[REQUEST_ID_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers[REQUEST_ID_HEADER]).not.toBe("garbage");
    expect(lines[0].route).toBe("unmatched");
    expect(routePattern({ baseUrl: "/api", route: { path: "/health" } } as never)).toBe("/api/health");
  });

  it("skips /api/health in the access log but still sets the header", () => {
    const { lines, res } = run({ originalUrl: "/api/health", url: "/api/health" });
    expect(lines).toEqual([]);
    expect(res.headers[REQUEST_ID_HEADER]).toBeDefined();
    expect(isQuietPath("/api/health?x=1")).toBe(true);
    expect(isQuietPath("/api/healthz")).toBe(false);
    expect(isQuietPath(undefined)).toBe(false);
  });

  it("the problem+json body carries the request id", () => {
    const send = jest.fn();
    const res = { req: { requestId: UUID }, status: jest.fn().mockReturnThis(), type: jest.fn().mockReturnThis(), send, setHeader: jest.fn() };
    new ProblemFilter().catch(notFound("Class"), { switchToHttp: () => ({ getResponse: () => res }) } as never);
    expect(send.mock.calls[0][0]).toMatchObject({ status: 404, requestId: UUID });
    const bare = { ...res, req: {}, send: jest.fn() };
    new ProblemFilter().catch(notFound("Class"), { switchToHttp: () => ({ getResponse: () => bare }) } as never);
    expect(bare.send.mock.calls[0][0].requestId).toBeUndefined();
  });
});

describe("demo quota and reserved join codes", () => {
  it("demo accounts get DEMO_LESSON_QUOTA (default 30), everyone else MONTHLY_LESSON_QUOTA (default 100)", () => {
    const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;
    expect(DEMO_EMAILS).toEqual(["demo@helpo.test", "admin@helpo.test"]);
    expect(lessonQuotaLimit("demo@helpo.test", env({}))).toBe(30);
    expect(lessonQuotaLimit("ADMIN@helpo.test", env({ DEMO_LESSON_QUOTA: "12" }))).toBe(12);
    expect(lessonQuotaLimit("teacher@school.test", env({ DEMO_LESSON_QUOTA: "12" }))).toBe(100);
    expect(lessonQuotaLimit("teacher@school.test", env({ MONTHLY_LESSON_QUOTA: "250" }))).toBe(250);
    expect(lessonQuotaLimit(undefined, env({}))).toBe(100);
    expect(isDemoEmail(null)).toBe(false);
  });

  it("a per-user hourly limiter blocks after its max and recovers after the hour", () => {
    const l = new HourlyLimiter(2, "slow down");
    expect([l.allow("u", 0), l.allow("u", 1), l.allow("u", 2)]).toEqual([true, true, false]);
    expect(l.allow("other", 2)).toBe(true);
    expect(l.allow("u", 3_600_001)).toBe(true);
    expect(l.reason).toBe("slow down");
  });

  it("the random join-code generator never hands out the fixed demo codes", async () => {
    expect([...RESERVED_JOIN_CODES].sort()).toEqual(["202020", "303030"]);
    const db = mockPrisma();
    db.activitySession.findFirst.mockResolvedValue(null);
    const svc = new SessionsService(db);
    const codes = ["202020", "303030", "111111"];
    expect(await svc.uniqueJoinCode(() => codes.shift() as string)).toBe("111111");
    expect(db.activitySession.findFirst).toHaveBeenCalledTimes(1); // the reserved ones were skipped before any lookup
  });
});
