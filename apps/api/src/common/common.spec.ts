import { BadRequestException, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import { AiRateLimitError } from "../ai/errors";
import { toProblem } from "./problem.filter";
import { ProblemException, conflict, notFound, unauthorized } from "./problem";
import { RateLimitGuard } from "./rate-limit";
import { schoolDay, slugify, startOfIsoWeek } from "./time";
import { ZodValidationPipe } from "./zod.pipe";

describe("problem+json", () => {
  it("maps domain, AI, HTTP and unknown errors", () => {
    expect(toProblem(notFound("Class"))).toMatchObject({ status: 404, title: "Not found" });
    expect(toProblem(conflict("dup")).status).toBe(409);
    expect(toProblem(unauthorized()).status).toBe(401);
    expect(toProblem(new AiRateLimitError())).toMatchObject({ status: 429, title: "AI service busy" });
    expect(toProblem(new NotFoundException("gone"))).toMatchObject({ status: 404, detail: "gone" });
    expect(toProblem(new BadRequestException(["a", "b"])).detail).toBe("a; b");
    expect(toProblem(new Error("boom"))).toMatchObject({ status: 500 });
    expect(toProblem(new Error("boom")).detail).not.toContain("boom");
  });
});

describe("ZodValidationPipe", () => {
  const pipe = new ZodValidationPipe(z.object({ n: z.number().int() }));
  it("passes valid input and parses it", () => {
    expect(pipe.transform({ n: 3 })).toEqual({ n: 3 });
  });
  it("throws 400 with per-field errors", () => {
    try {
      pipe.transform({ n: "x" });
      fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ProblemException);
      expect((e as ProblemException).getStatus()).toBe(400);
      expect((e as ProblemException).errors?.[0].path).toBe("n");
    }
  });
});

describe("RateLimitGuard", () => {
  it("allows up to max per window, then 429, then resets", () => {
    const guard = new RateLimitGuard({ getAllAndOverride: jest.fn() } as never);
    expect(guard.check("k", 2, 1000, 0)).toBe(true);
    expect(guard.check("k", 2, 1000, 10)).toBe(true);
    expect(() => guard.check("k", 2, 1000, 20)).toThrow(ProblemException);
    expect(guard.check("k", 2, 1000, 1500)).toBe(true);
    expect(guard.check("other", 2, 1000, 20)).toBe(true);
  });

  it("only applies to routes with @RateLimit and can be disabled", async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
    const guard = new RateLimitGuard(reflector as never);
    const ctx = { getHandler: jest.fn(), getClass: jest.fn(), switchToHttp: () => ({ getRequest: () => ({ headers: {}, ip: "1.1.1.1" }) }) } as never;
    expect(await guard.canActivate(ctx)).toBe(true);
    reflector.getAllAndOverride.mockReturnValue({ bucket: "b", max: 1, windowMs: 1000 });
    expect(await guard.canActivate(ctx)).toBe(true);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ProblemException);
    process.env.RATE_LIMIT_DISABLED = "1";
    expect(await guard.canActivate(ctx)).toBe(true);
    delete process.env.RATE_LIMIT_DISABLED;
  });

  it("with Redis the counter is shared: first hit sets the expiry, over the max is 429, a Redis outage falls back to memory", async () => {
    const counts = new Map<string, number>();
    const store = {
      incr: jest.fn(async (k: string) => {
        counts.set(k, (counts.get(k) ?? 0) + 1);
        return counts.get(k) as number;
      }),
      pexpire: jest.fn().mockResolvedValue(1),
    };
    const guard = new RateLimitGuard({ getAllAndOverride: jest.fn() } as never, store);
    expect(guard.backend).toBe("redis");
    expect(await guard.checkRedis("join:1.1.1.1", 2, 1000)).toBe(true);
    expect(await guard.checkRedis("join:1.1.1.1", 2, 1000)).toBe(true);
    await expect(guard.checkRedis("join:1.1.1.1", 2, 1000)).rejects.toMatchObject({ status: 429 });
    expect(store.pexpire).toHaveBeenCalledTimes(1);
    expect(store.pexpire).toHaveBeenCalledWith("rl:join:1.1.1.1", 1000);
    store.incr.mockRejectedValue(new Error("redis down"));
    expect(await guard.checkRedis("x", 1, 1000)).toBe(true);
    expect(new RateLimitGuard({ getAllAndOverride: jest.fn() } as never).backend).toBe("memory");
  });
});

describe("time helpers", () => {
  it("finds the Monday of the ISO week", () => {
    expect(startOfIsoWeek(new Date("2026-11-20T10:00:00Z")).toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(startOfIsoWeek(new Date("2026-11-22T23:59:00Z")).toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(startOfIsoWeek(new Date("2026-11-23T00:00:00Z")).toISOString()).toBe("2026-11-23T00:00:00.000Z");
  });
  it("formats the school day and slugs names", () => {
    expect(schoolDay(new Date("2026-11-20T23:30:00Z"), "UTC")).toBe("2026-11-20");
    expect(slugify("Riverside Middle School")).toBe("riverside-middle-school");
    expect(slugify("!!!")).toBe("school");
  });
});
