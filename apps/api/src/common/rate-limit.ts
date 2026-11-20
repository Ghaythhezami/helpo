import { CanActivate, ExecutionContext, Inject, Injectable, Optional, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import IORedis from "ioredis";
import { ProblemException } from "./problem";

export const RATE_LIMIT_KEY = "helpo:rate-limit";
/** Best-effort per-IP limit: `max` requests per `windowMs` for this route. */
export const RateLimit = (bucket: string, max: number, windowMs = 60_000) => SetMetadata(RATE_LIMIT_KEY, { bucket, max, windowMs });

interface Hit {
  count: number;
  resetAt: number;
}

/** The two calls the limiter needs from Redis (ioredis satisfies it). */
export interface CounterStore {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<unknown>;
}

/** Optional DI token for a shared counter store (tests inject a fake; production builds one from REDIS_URL). */
export const RATE_LIMIT_STORE = Symbol("RATE_LIMIT_STORE");

const tooMany = () => new ProblemException(429, "Too many requests", "Slow down a little and try again in a minute.");

/**
 * Per-IP limits. In memory by default; shared across instances through Redis when REDIS_URL is set
 * (a fixed window counter: INCR, with the expiry set on the first hit).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, Hit>();
  private readonly store?: CounterStore;

  constructor(
    private readonly reflector: Reflector,
    @Optional() @Inject(RATE_LIMIT_STORE) store?: CounterStore,
  ) {
    this.store = store ?? (process.env.REDIS_URL ? (new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 }) as unknown as CounterStore) : undefined);
  }

  get backend(): "redis" | "memory" {
    return this.store ? "redis" : "memory";
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const cfg = this.reflector.getAllAndOverride<{ bucket: string; max: number; windowMs: number } | undefined>(RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]);
    if (!cfg || process.env.RATE_LIMIT_DISABLED === "1") return true;
    const req = context.switchToHttp().getRequest<Request>();
    const ip = String(req.headers["x-forwarded-for"] ?? req.ip ?? "unknown").split(",")[0].trim();
    const key = `${cfg.bucket}:${ip}`;
    return this.store ? this.checkRedis(key, cfg.max, cfg.windowMs) : this.check(key, cfg.max, cfg.windowMs);
  }

  async checkRedis(key: string, max: number, windowMs: number): Promise<boolean> {
    const store = this.store as CounterStore;
    try {
      const n = await store.incr(`rl:${key}`);
      if (n === 1) await store.pexpire(`rl:${key}`, windowMs);
      if (n > max) throw tooMany();
      return true;
    } catch (e) {
      if (e instanceof ProblemException) throw e;
      return this.check(key, max, windowMs); // Redis down: fall back to memory, never block students
    }
  }

  check(key: string, max: number, windowMs: number, now = Date.now()): boolean {
    const hit = this.hits.get(key);
    if (!hit || hit.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + windowMs });
      if (this.hits.size > 5000) this.prune(now);
      return true;
    }
    hit.count += 1;
    if (hit.count > max) throw tooMany();
    return true;
  }

  private prune(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}
