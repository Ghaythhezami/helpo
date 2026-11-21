import IORedis from "ioredis";

/** The storage contract Better Auth expects for `secondaryStorage` (a key/value store with TTL in seconds). */
export interface SecondaryStorage {
  get(key: string): Promise<string | null>;
  getAndDelete(key: string): Promise<string | null>;
  /** Atomic counter: created at 1 with the TTL, later increments never extend it (fixed window). */
  increment(key: string, ttl: number): Promise<number>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

interface RedisLike {
  get(key: string): Promise<string | null>;
  getdel(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  set(key: string, value: string, mode?: "EX", seconds?: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

/** Better Auth's secondary storage on Redis (shared by every instance). */
export function redisSecondaryStorage(client: RedisLike): SecondaryStorage {
  return {
    get: (key) => client.get(key),
    getAndDelete: (key) => client.getdel(key),
    increment: async (key, ttl) => {
      const n = await client.incr(key);
      if (n === 1) await client.expire(key, ttl);
      return n;
    },
    set: async (key, value, ttl) => {
      if (ttl) await client.set(key, value, "EX", ttl);
      else await client.set(key, value);
    },
    delete: async (key) => {
      await client.del(key);
    },
  };
}

export const createRedisSecondaryStorage = (url: string): SecondaryStorage => redisSecondaryStorage(new IORedis(url, { maxRetriesPerRequest: 1 }) as unknown as RedisLike);

/**
 * Better Auth's own limiter, moved off its per-process memory store: the `rateLimit` table by default, Redis when
 * REDIS_URL is set, so limits hold across instances. Sign-in and sign-up stay strict (10 per minute per IP: tight enough
 * to slow password guessing, loose enough for a staff room behind one NAT). Server-side `auth.api.*` calls (demo login)
 * do not pass through this limiter. It is on in production, or when BETTER_AUTH_RATE_LIMIT=true.
 */
export function authRateLimit(env: NodeJS.ProcessEnv = process.env) {
  return {
    enabled: env.NODE_ENV === "production" || env.BETTER_AUTH_RATE_LIMIT === "true",
    window: 60,
    max: 100,
    storage: env.REDIS_URL ? ("secondary-storage" as const) : ("database" as const),
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 10 },
      "/forget-password": { window: 60, max: 3 },
      "/reset-password": { window: 60, max: 5 },
    },
  };
}
