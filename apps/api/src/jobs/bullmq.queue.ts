import { Logger, type OnModuleDestroy } from "@nestjs/common";
import { FlowProducer, Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { LIMITS, type ResourceKind } from "@helpo/shared";
import { InlineJobQueue, JobQueue, type GenerationHandlers, type GenerationJob } from "./job-queue";

export const GENERATION_QUEUE = "nibras-generation";
export const AI_CONCURRENCY = 5;
export const JOB_ATTEMPTS = 3;
export const BACKOFF_MS = 4000;

/** Rejects when `work` takes longer than `ms` (BullMQ has no per-job timeout of its own). */
export async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`Job timed out after ${Math.round(ms / 1000)} s`)), ms)))]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Options shared by every child job: retries with exponential backoff, and a failed child never blocks the parent. */
export const CHILD_JOB_OPTS = {
  attempts: JOB_ATTEMPTS,
  backoff: { type: "exponential" as const, delay: BACKOFF_MS },
  removeOnComplete: true,
  removeOnFail: { age: 86_400 },
  ignoreDependencyOnFailure: true,
};

/** The flow tree for one generation: parent `finalize`, children `generate.{kind}` with jobId `${lessonId}__${kind}` (BullMQ forbids ":" in custom ids). */
export function buildFlow(job: GenerationJob) {
  const retry = !job.replaceAllChecks ? `__retry__${job.kinds.join("+")}` : "";
  return {
    name: "finalize",
    queueName: GENERATION_QUEUE,
    data: job,
    opts: { jobId: `${job.lessonId}__finalize${retry}`, removeOnComplete: true, removeOnFail: { age: 86_400 } },
    children: job.kinds.map((kind) => ({
      name: `generate.${kind}`,
      queueName: GENERATION_QUEUE,
      data: { lessonId: job.lessonId, kind },
      opts: { ...CHILD_JOB_OPTS, jobId: `${job.lessonId}__${kind}` },
    })),
  };
}

/**
 * BullMQ driver (QUEUE_DRIVER=bullmq + REDIS_URL). Use a fixed-price Redis (not pay-per-command) with
 * maxRetriesPerRequest: null. WORKER_ENABLED=false makes an instance enqueue only; WORKER_ONLY=true (see main.ts)
 * runs workers without an HTTP listener.
 */
export class BullMqJobQueue extends JobQueue implements OnModuleDestroy {
  readonly driver = "bullmq" as const;
  private readonly logger = new Logger("BullMQ");
  private readonly inline = new InlineJobQueue();
  private readonly connection: IORedis;
  readonly queue: Queue;
  private readonly flow: FlowProducer;
  private worker?: Worker;
  private handlers?: GenerationHandlers;

  constructor(redisUrl: string) {
    super();
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(GENERATION_QUEUE, { connection: this.connection });
    this.flow = new FlowProducer({ connection: this.connection });
  }

  /** Same in-process helpers as the inline driver (the upload pipeline carries a file buffer and stays in this process). */
  schedule(key: string, work: () => Promise<unknown>): boolean {
    return this.inline.schedule(key, work);
  }

  guard<T>(key: string, work: () => Promise<T>) {
    return this.inline.guard(key, work);
  }

  isRunning(key: string): boolean {
    return this.inline.isRunning(key);
  }

  registerGeneration(handlers: GenerationHandlers): void {
    this.handlers = handlers;
    if (process.env.WORKER_ENABLED === "false" || this.worker) return;
    this.worker = new Worker(GENERATION_QUEUE, (job) => this.process(job), { connection: this.connection, concurrency: AI_CONCURRENCY });
    this.worker.on("failed", (job, err) => this.logger.warn(`Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`));
    // global limiter: at most AI_CONCURRENCY AI jobs at once across all workers
    void (this.queue as unknown as { setGlobalConcurrency?: (n: number) => Promise<void> }).setGlobalConcurrency?.(AI_CONCURRENCY).catch(() => undefined);
  }

  private async process(job: Job): Promise<void> {
    const h = this.handlers;
    if (!h) throw new Error("No generation handlers registered");
    if (job.name === "finalize") return h.finalize(job.data as GenerationJob);
    const kind = job.name.replace("generate.", "") as ResourceKind;
    const final = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await withTimeout(h.generateKind((job.data as { lessonId: string }).lessonId, kind, { final, onProgress: (p) => job.updateProgress(p) }), LIMITS.jobTimeoutMs);
  }

  async enqueueGeneration(job: GenerationJob): Promise<boolean> {
    const tree = buildFlow(job);
    const existing = await this.queue.getJob(tree.opts.jobId);
    if (existing && ["waiting", "waiting-children", "active", "delayed"].includes(await existing.getState())) return false; // double click
    await this.flow.add(tree);
    return true;
  }

  async cancel(lessonId: string): Promise<void> {
    const waiting = await this.queue.getJobs(["waiting", "delayed", "prioritized"]);
    await Promise.all(waiting.filter((j) => (j.data as { lessonId?: string }).lessonId === lessonId).map((j) => j.remove().catch(() => undefined)));
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.flow.close();
    await this.queue.close();
    this.connection.disconnect();
  }
}
