import { readFileSync } from "node:fs";
import path from "node:path";
import { LIMITS } from "@helpo/shared";
import { ClaudeAiProvider } from "../ai/claude.provider";
import { HEALTH_DB_TIMEOUT_MS, pingWithTimeout } from "../health/health.controller";
import { PrismaShutdown, getPrisma } from "../prisma/prisma.service";
import { RealtimeController } from "../realtime/realtime.controller";
import { mockPrisma } from "../testing/mock-prisma";
import { LESSON_LIST_CAP, LessonsService } from "../lessons/lessons.service";
import { DemoAiProvider } from "../ai/demo.provider";
import { DocumentsService } from "../documents/documents.service";
import { HTTP_TIMEOUTS, trustProxyHops, tuneHttpServer } from "./http-server";
import { ProblemException } from "./problem";
import { ProblemFilter, retryAfterSeconds, toProblem } from "./problem.filter";
import { RATE_LIMIT_KEY, RateLimitGuard } from "./rate-limit";
import { securityHeaders } from "./security-headers";

describe("security headers (KB T09)", () => {
  const run = (env: NodeJS.ProcessEnv) => {
    const headers: Record<string, string> = {};
    const next = jest.fn();
    securityHeaders(env)({} as never, { setHeader: (k: string, v: string) => (headers[k] = v) } as never, next);
    return { headers, next };
  };

  it("sets nosniff, frame, referrer, cross-domain and COOP headers and continues", () => {
    const { headers, next } = run({});
    expect(headers).toMatchObject({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer", "Cross-Origin-Opener-Policy": "same-origin" });
    expect(headers["Strict-Transport-Security"]).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("adds HSTS only in production", () => {
    expect(run({ NODE_ENV: "production" }).headers["Strict-Transport-Security"]).toContain("max-age=");
  });
});

describe("HTTP server timeouts (KB T09/T14)", () => {
  it("bounds slow requests and keeps keep-alive above the 60 s proxy idle timeout", () => {
    const server = { requestTimeout: 0, headersTimeout: 0, keepAliveTimeout: 0 };
    tuneHttpServer(server);
    expect(server).toEqual(HTTP_TIMEOUTS);
    expect(server.keepAliveTimeout).toBeGreaterThan(60_000);
    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);
  });
});

describe("rate limiting hardening (KB T07/T09)", () => {
  it("keys on req.ip (trust proxy), not on a client-supplied X-Forwarded-For", async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue({ bucket: "b", max: 1, windowMs: 1000 }) };
    const guard = new RateLimitGuard(reflector as never);
    const ctx = (xff: string) => ({ getHandler: jest.fn(), getClass: jest.fn(), switchToHttp: () => ({ getRequest: () => ({ headers: { "x-forwarded-for": xff }, ip: "9.9.9.9" }) }) }) as never;
    expect(await guard.canActivate(ctx("1.1.1.1"))).toBe(true);
    await expect(guard.canActivate(ctx("2.2.2.2"))).rejects.toMatchObject({ status: 429 }); // spoofed header does not get a fresh bucket
  });

  it("a 429 carries Retry-After (window in seconds) in the header but not in the problem body", () => {
    const guard = new RateLimitGuard({ getAllAndOverride: jest.fn() } as never);
    let err: unknown;
    try {
      guard.check("k", 1, 30_000, 0);
      guard.check("k", 1, 30_000, 1);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ProblemException);
    expect(retryAfterSeconds(err)).toBe(30);
    expect(toProblem(err)).not.toHaveProperty("retryAfter");
    const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), type: jest.fn().mockReturnThis(), send: jest.fn() };
    new ProblemFilter().catch(err, { switchToHttp: () => ({ getResponse: () => res }) } as never);
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "30");
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it("falls back to 60 s for a 429 without a window and sends no header for other statuses", () => {
    expect(retryAfterSeconds(new Error("x"))).toBe(60);
    const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), type: jest.fn().mockReturnThis(), send: jest.fn() };
    new ProblemFilter().catch(new ProblemException(404, "Not found"), { switchToHttp: () => ({ getResponse: () => res }) } as never);
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it("the realtime token endpoint is rate limited", () => {
    const cfg = Reflect.getMetadata(RATE_LIMIT_KEY, RealtimeController.prototype.token) as { bucket: string; max: number };
    expect(cfg).toMatchObject({ bucket: "rt-token" });
    expect(cfg.max).toBeGreaterThan(0);
  });
});

describe("AI client timeout (KB T15)", () => {
  it("the Anthropic client uses LIMITS.aiCallTimeoutMs instead of the 10 minute SDK default", () => {
    process.env.ANTHROPIC_API_KEY ??= "test-key";
    const provider = new ClaudeAiProvider();
    const client = (provider as unknown as { client: { timeout: number; maxRetries: number } }).client;
    expect(client.timeout).toBe(LIMITS.aiCallTimeoutMs);
    expect(client.maxRetries).toBe(2);
  });
});

describe("health probe timeout (KB T10)", () => {
  afterEach(() => jest.useRealTimers());

  it("resolves when the database answers and rejects when it hangs", async () => {
    await expect(pingWithTimeout(Promise.resolve(1))).resolves.toBeUndefined();
    jest.useFakeTimers();
    const hung = pingWithTimeout(new Promise(() => undefined));
    const assertion = expect(hung).rejects.toThrow("timed out");
    await jest.advanceTimersByTimeAsync(HEALTH_DB_TIMEOUT_MS + 1);
    await assertion;
  });
});

describe("graceful shutdown (KB T29)", () => {
  it("closes the Prisma pool from Nest's shutdown hook", async () => {
    const prisma = getPrisma();
    const spy = jest.spyOn(prisma, "$disconnect").mockResolvedValue(undefined);
    await new PrismaShutdown().onApplicationShutdown();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe("bounded queries (KB T05/T04)", () => {
  it("the lesson list is capped", async () => {
    const db = mockPrisma();
    const views = { summaries: jest.fn().mockResolvedValue([]) };
    const service = new LessonsService(db, views as never, new DocumentsService(), {} as never, new DemoAiProvider());
    await service.list("T1", "en");
    expect(db.lesson.findMany.mock.calls[0][0].take).toBe(LESSON_LIST_CAP);
  });
});

describe("Prisma schema indexes (KB T05)", () => {
  const schema = readFileSync(path.resolve(__dirname, "../../prisma/schema/domain.prisma"), "utf8");
  const block = (model: string) => schema.split(new RegExp(`^model ${model} {`, "m"))[1].split(/^\}/m)[0];

  it.each([
    ["Participant", "@@index([studentId])"],
    ["GameResult", "@@index([lessonId])"],
    ["XpEvent", "@@index([studentId, createdAt])"],
  ])("%s has %s for its foreign-key lookups", (model, index) => {
    expect(block(model)).toContain(index);
  });
});

describe("trust proxy hops", () => {
  it("defaults to 1 and accepts 1–3 from TRUST_PROXY_HOPS", () => {
    expect(trustProxyHops(undefined)).toBe(1);
    expect(trustProxyHops("2")).toBe(2);
    expect(trustProxyHops("9")).toBe(1);
    expect(trustProxyHops("abc")).toBe(1);
  });
});
