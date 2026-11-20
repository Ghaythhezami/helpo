import { Global, Injectable, Module } from "@nestjs/common";
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

@Global()
@Module({
  providers: [{ provide: PrismaService, useFactory: () => getPrisma() as PrismaService }],
  exports: [PrismaService],
})
export class PrismaModule {}
