import type { Locale, QuizContent } from "@helpo/shared";
import type { PrismaService } from "../prisma/prisma.service";
import { contentOf } from "./views";

/**
 * A small in-memory LRU with a time-to-live. Entries are evicted oldest-first once `max` is reached, and a read older
 * than `ttlMs` is a miss. Used for hot, read-mostly data that every poll would otherwise reload from Postgres.
 */
export class TtlLruCache<V> {
  private readonly map = new Map<string, { value: V; at: number }>();

  constructor(
    private readonly max = 300,
    private readonly ttlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): { value: V } | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (this.now() - hit.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key); // refresh recency
    this.map.set(key, hit);
    return { value: hit.value };
  }

  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, { value, at: this.now() });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/** The part of a QUIZ resource row that identifies one version of its content. */
export interface QuizRef {
  id: string;
  updatedAt: Date;
  status?: string;
}

/** Select this with the session or lesson query so a poll does not need a separate round trip for the key. */
export const QUIZ_REF_SELECT = { id: true, updatedAt: true, status: true } as const;

const ttl = Number(process.env.QUIZ_CACHE_TTL_MS) || 60_000;
export const quizCache = new TtlLruCache<QuizContent | null>(300, ttl);

/**
 * The quiz content of a resource, parsed once. Keyed by resource id + updatedAt + locale, so any teacher edit (which
 * bumps updatedAt) is a new key; the TTL only bounds memory. A miss costs one query, a hit costs none.
 */
export async function cachedQuiz(prisma: PrismaService, ref: QuizRef | null | undefined, locale: Locale): Promise<QuizContent | null> {
  if (!ref) return null;
  const key = `${ref.id}:${ref.updatedAt.getTime()}:${locale}`;
  const hit = quizCache.get(key);
  if (hit) return hit.value;
  const row = await prisma.resource.findUnique({ where: { id: ref.id }, select: { contentEn: true, contentAr: true } });
  const content = row ? contentOf<QuizContent>(row, locale).content : null;
  quizCache.set(key, content);
  return content;
}

/** QR codes depend only on the join link; the teacher's session view polls, so they are made once. */
export const qrCache = new TtlLruCache<string>(200, 30 * 60_000);
