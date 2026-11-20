import { Module } from "@nestjs/common";
import { selectDrivers } from "../jobs/job-queue";
import { RealtimeController } from "./realtime.controller";
import { RealtimeGateway } from "./realtime.gateway";

/** The token endpoint is always there; the Socket.IO gateway only loads with REALTIME=socket. */
@Module({
  controllers: [RealtimeController],
  providers: selectDrivers().realtime === "socket" ? [RealtimeGateway] : [],
})
export class RealtimeModule {}
