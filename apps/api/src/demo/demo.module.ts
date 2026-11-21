import { Module } from "@nestjs/common";
import { JoinService } from "../join/join.service";
import { DemoController } from "./demo.controller";
import { DemoService } from "./demo.service";

@Module({ controllers: [DemoController], providers: [DemoService, JoinService] })
export class DemoModule {}
