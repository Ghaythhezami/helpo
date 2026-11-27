import { Global, Logger, Module } from "@nestjs/common";
import { BullMqJobQueue } from "./bullmq.queue";
import { EventBus, InlineJobQueue, JobQueue, PollEventBus, generationMode, selectDrivers } from "./job-queue";
import { SocketEventBus } from "../realtime/socket-hub";

/** Picks the drivers from QUEUE_DRIVER / REALTIME (inline + poll by default, which is what Vercel runs). */
export function createJobQueue(env: NodeJS.ProcessEnv = process.env): JobQueue {
  const logger = new Logger("Drivers");
  const choice = selectDrivers(env);
  choice.warnings.forEach((w) => logger.warn(w));
  logger.log(`queue=${choice.queue} realtime=${choice.realtime} generation=${generationMode(env)}`);
  return choice.queue === "bullmq" ? new BullMqJobQueue(env.REDIS_URL as string) : new InlineJobQueue();
}

export function createEventBus(env: NodeJS.ProcessEnv = process.env): EventBus {
  return selectDrivers(env).realtime === "socket" ? new SocketEventBus() : new PollEventBus();
}

@Global()
@Module({
  providers: [
    { provide: JobQueue, useFactory: () => createJobQueue() },
    { provide: EventBus, useFactory: () => createEventBus() },
  ],
  exports: [JobQueue, EventBus],
})
export class JobsModule {}
