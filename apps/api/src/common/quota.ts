import { LIMITS } from "@helpo/shared";

/** The pre-configured demo accounts: a public demo link must not be able to burn the AI budget. */
export const DEMO_EMAILS: readonly string[] = ["demo@helpo.test", "admin@helpo.test"];

export const isDemoEmail = (email: string | null | undefined): boolean => Boolean(email) && DEMO_EMAILS.includes((email as string).toLowerCase());

/** Lessons per month: DEMO_LESSON_QUOTA (default 30) for demo accounts, MONTHLY_LESSON_QUOTA (default 100) for everyone else. */
export function lessonQuotaLimit(email: string | null | undefined, env: NodeJS.ProcessEnv = process.env): number {
  if (isDemoEmail(email)) return Number(env.DEMO_LESSON_QUOTA) || 30;
  return Number(env.MONTHLY_LESSON_QUOTA) || LIMITS.monthlyLessonQuota;
}

/** Fixed sliding-hour counter per key (per user), in memory and best effort. */
export class HourlyLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly max: number,
    private readonly message: string,
  ) {}

  /** Returns false when the key has used its quota in the last hour. */
  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    this.hits.set(key, [...recent, now]);
    return true;
  }

  get reason(): string {
    return this.message;
  }
}
