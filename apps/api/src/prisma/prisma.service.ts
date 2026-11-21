import { Global, Injectable, Module, type OnApplicationShutdown } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { __helpoPrisma?: PrismaClient };

/** One Prisma client per process / serverless instance. */
export function getPrisma(): PrismaClient {
  globalForPrisma.__helpoPrisma ??= new PrismaClient();
  return globalForPrisma.__helpoPrisma;
}

/** Injection token typed as the client itself. */
@Injectable()
export class PrismaService extends PrismaClient {}

/** Closes the pool after Nest has drained requests and queue workers (runs on SIGTERM/SIGINT via enableShutdownHooks). */
@Injectable()
export class PrismaShutdown implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await getPrisma().$disconnect();
  }
}

@Global()
@Module({
  providers: [{ provide: PrismaService, useFactory: () => getPrisma() as PrismaService }, PrismaShutdown],
  exports: [PrismaService],
})
export class PrismaModule {}
