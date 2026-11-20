import { LIMITS } from "@helpo/shared";
import { BACKOFF_MS, CHILD_JOB_OPTS, GENERATION_QUEUE, JOB_ATTEMPTS, buildFlow, withTimeout } from "./bullmq.queue";
import { InlineJobQueue, PollEventBus, selectDrivers } from "./job-queue";
import { createEventBus, createJobQueue } from "./jobs.module";
import { SocketEventBus, socketHub } from "../realtime/socket-hub";

describe("driver selection", () => {
  it("defaults to inline + poll (what Vercel runs)", () => {
    expect(selectDrivers({} as NodeJS.ProcessEnv)).toEqual({ queue: "inline", realtime: "poll", warnings: [] });
    expect(createJobQueue({} as NodeJS.ProcessEnv)).toBeInstanceOf(InlineJobQueue);
    expect(createEventBus({} as NodeJS.ProcessEnv)).toBeInstanceOf(PollEventBus);
  });

  it("bullmq needs REDIS_URL, otherwise it warns and stays inline", () => {
    const noRedis = selectDrivers({ QUEUE_DRIVER: "bullmq" } as unknown as NodeJS.ProcessEnv);
    expect(noRedis.queue).toBe("inline");
    expect(noRedis.warnings[0]).toMatch(/REDIS_URL/);
    expect(selectDrivers({ QUEUE_DRIVER: "bullmq", REDIS_URL: "redis://x" } as unknown as NodeJS.ProcessEnv).queue).toBe("bullmq");
  });

  it("REALTIME=socket selects the Socket.IO event bus; Vercel is warned off long-running drivers", () => {
    const env = { QUEUE_DRIVER: "bullmq", REDIS_URL: "redis://x", REALTIME: "socket", VERCEL: "1" } as unknown as NodeJS.ProcessEnv;
    expect(selectDrivers(env)).toMatchObject({ queue: "bullmq", realtime: "socket" });
    expect(selectDrivers(env).warnings.join(" ")).toMatch(/Vercel/);
    expect(createEventBus({ REALTIME: "socket" } as unknown as NodeJS.ProcessEnv)).toBeInstanceOf(SocketEventBus);
    expect(selectDrivers({ REALTIME: "anything" } as unknown as NodeJS.ProcessEnv).realtime).toBe("poll");
  });
});

describe("BullMQ flow definition", () => {
  const job = { lessonId: "L1", kinds: ["QUIZ", "CARDS"] as never, replaceAllChecks: true };

  it("one parent finalize and one child generate.{kind} per resource, jobId lessonId:kind", () => {
    const flow = buildFlow(job);
    expect(flow).toMatchObject({ name: "finalize", queueName: GENERATION_QUEUE, opts: { jobId: "L1__finalize" } });
    expect(flow.children.map((c) => [c.name, c.opts.jobId])).toEqual([
      ["generate.QUIZ", "L1__QUIZ"],
      ["generate.CARDS", "L1__CARDS"],
    ]);
  });

  it("children retry 3 times with exponential 4 s backoff and never block the parent when they fail", () => {
    expect(CHILD_JOB_OPTS).toMatchObject({ attempts: JOB_ATTEMPTS, backoff: { type: "exponential", delay: BACKOFF_MS }, ignoreDependencyOnFailure: true });
    expect([JOB_ATTEMPTS, BACKOFF_MS]).toEqual([3, 4000]);
    expect(buildFlow(job).children[0].opts).toMatchObject(CHILD_JOB_OPTS);
  });

  it("a single-resource retry gets its own parent id so it can run after the full flow", () => {
    expect(buildFlow({ lessonId: "L1", kinds: ["QUIZ"] as never, replaceAllChecks: false }).opts.jobId).toBe("L1__finalize__retry__QUIZ");
  });

  it("the job timeout is 3 minutes and withTimeout rejects slow work", async () => {
    expect(LIMITS.jobTimeoutMs).toBe(180_000);
    await expect(withTimeout(new Promise(() => undefined), 10)).rejects.toThrow(/timed out/);
    await expect(withTimeout(Promise.resolve(5), 1000)).resolves.toBe(5);
  });
});

describe("InlineJobQueue", () => {
  it("runs scheduled work once per key and frees the key afterwards", async () => {
    const q = new InlineJobQueue();
    let runs = 0;
    const work = async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 15));
    };
    expect(q.schedule("L1:generate", work)).toBe(true);
    expect(q.schedule("L1:generate", work)).toBe(false);
    expect(q.isRunning("L1:generate")).toBe(true);
    await new Promise((r) => setTimeout(r, 40));
    expect(runs).toBe(1);
    expect(q.isRunning("L1:generate")).toBe(false);
  });

  it("enqueueGeneration hands the job to the registered handlers and is idempotent", async () => {
    const q = new InlineJobQueue();
    const run = jest.fn(() => new Promise<void>((r) => setTimeout(r, 15)));
    q.registerGeneration({ run, generateKind: jest.fn(), finalize: jest.fn() });
    const job = { lessonId: "L1", kinds: ["QUIZ"] as never, replaceAllChecks: true };
    expect(await q.enqueueGeneration(job)).toBe(true);
    expect(await q.enqueueGeneration(job)).toBe(false);
    await new Promise((r) => setTimeout(r, 40));
    expect(run).toHaveBeenCalledTimes(1);
    await expect(new InlineJobQueue().enqueueGeneration(job)).rejects.toThrow(/handlers/);
    await expect(q.cancel()).resolves.toBeUndefined();
  });
});

describe("SocketEventBus", () => {
  it("is a no-op until the gateway is up, then emits to the room", () => {
    const bus = new SocketEventBus();
    expect(() => bus.emit("lesson:L1", "lesson.status", {})).not.toThrow();
    const emit = jest.fn();
    socketHub.server = { to: jest.fn(() => ({ emit })) } as never;
    bus.emit("lesson:L1", "resource.ready", { kind: "QUIZ" });
    expect((socketHub.server as unknown as { to: jest.Mock }).to).toHaveBeenCalledWith("lesson:L1");
    expect(emit).toHaveBeenCalledWith("resource.ready", { kind: "QUIZ" });
    socketHub.server = undefined;
  });
});
