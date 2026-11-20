import { Logger } from "@nestjs/common";
import type { ResourceKind } from "@helpo/shared";
import { runInBackground } from "../common/background";

export interface GenerationJob {
  lessonId: string;
  kinds: ResourceKind[];
  /** true: replace all checks (full generate); false: only the checks of `kinds` (single retry). */
  replaceAllChecks: boolean;
}

/** What the generation service offers to whichever driver runs the work. */
export interface GenerationHandlers {
  /** Inline driver: the whole flow in this process. */
  run(job: GenerationJob): Promise<void>;
  /** BullMQ child job `generate.{kind}`. With `final` false a failure is thrown so the queue retries it. */
  generateKind(lessonId: string, kind: ResourceKind, opts: { final: boolean; onProgress?: (percent: number) => void | Promise<void> }): Promise<void>;
  /** BullMQ parent job `finalize`: checks, trace counts, final lesson status. */
  finalize(job: GenerationJob): Promise<void>;
}

/**
 * The job runner port. Two drivers, chosen by QUEUE_DRIVER:
 *  - inline (default, Vercel): work runs in this process (waitUntil on Vercel) with an idempotency key per job;
 *    retries and progress are persisted in Postgres by the processors.
 *  - bullmq (+ REDIS_URL): a Flow with one parent `finalize` and one child `generate.{kind}` per resource,
 *    jobId `${lessonId}:${kind}`, 3 attempts with exponential backoff (4 s), a 3 min timeout and a global limiter.
 */
export abstract class JobQueue {
  abstract readonly driver: "inline" | "bullmq";
  /** Runs `work` in the background unless a job with the same key is already running. Returns false for a duplicate. */
  abstract schedule(key: string, work: () => Promise<unknown>): boolean;
  /** Runs `work` now (awaited), skipping it when the same key is already running. */
  abstract guard<T>(key: string, work: () => Promise<T>): Promise<{ ran: boolean; value?: T }>;
  abstract isRunning(key: string): boolean;
  abstract registerGeneration(handlers: GenerationHandlers): void;
  /** Starts the generation flow. Returns false when the same flow is already queued or running (idempotent). */
  abstract enqueueGeneration(job: GenerationJob): Promise<boolean>;
  /** Stops queued jobs of a lesson (running ones stop at their next resource through the cancel flag). */
  abstract cancel(lessonId: string): Promise<void>;
}

export class InlineJobQueue extends JobQueue {
  readonly driver = "inline" as const;
  private readonly logger = new Logger("JobQueue");
  private readonly running = new Set<string>();
  private handlers?: GenerationHandlers;

  registerGeneration(handlers: GenerationHandlers): void {
    this.handlers = handlers;
  }

  async enqueueGeneration(job: GenerationJob): Promise<boolean> {
    const handlers = this.handlers;
    if (!handlers) throw new Error("No generation handlers registered");
    return this.schedule(`${job.lessonId}:generate`, () => handlers.run(job));
  }

  async cancel(): Promise<void> {
    /* inline jobs stop at their next resource through the lesson's cancel flag */
  }

  schedule(key: string, work: () => Promise<unknown>): boolean {
    if (this.running.has(key)) return false;
    this.running.add(key);
    runInBackground(
      work().finally(() => {
        this.running.delete(key);
      }),
    );
    return true;
  }

  async guard<T>(key: string, work: () => Promise<T>): Promise<{ ran: boolean; value?: T }> {
    if (this.running.has(key)) {
      this.logger.log(`Skipped duplicate job ${key}`);
      return { ran: false };
    }
    this.running.add(key);
    try {
      return { ran: true, value: await work() };
    } finally {
      this.running.delete(key);
    }
  }

  isRunning(key: string): boolean {
    return this.running.has(key);
  }
}

/** Real-time events (lesson.status, resource.progress ...) to a room such as `lesson:{id}` or `session:{id}`. */
export abstract class EventBus {
  abstract emit(room: string, event: string, payload: unknown): void;
}

/** REALTIME=poll: nothing to push, clients read GET /lessons/:id and GET /sessions/:id every 1.5 s. */
export class PollEventBus extends EventBus {
  emit(): void {
    /* polling clients read the database */
  }
}

/** Which drivers the environment asks for. BullMQ needs Redis, Socket.IO needs a long-running host. */
export function selectDrivers(env: NodeJS.ProcessEnv = process.env): { queue: "inline" | "bullmq"; realtime: "poll" | "socket"; warnings: string[] } {
  const warnings: string[] = [];
  let queue: "inline" | "bullmq" = "inline";
  if (env.QUEUE_DRIVER === "bullmq") {
    if (env.REDIS_URL) queue = "bullmq";
    else warnings.push("QUEUE_DRIVER=bullmq needs REDIS_URL; using the inline driver.");
  }
  const realtime = env.REALTIME === "socket" ? "socket" : "poll";
  if (env.VERCEL && (queue === "bullmq" || realtime === "socket")) warnings.push("Vercel Functions cannot hold WebSockets or workers; use QUEUE_DRIVER=inline and REALTIME=poll there.");
  return { queue, realtime, warnings };
}
