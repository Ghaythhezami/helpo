import { Module } from "@nestjs/common";
import { LessonsModule } from "../lessons/lessons.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({ imports: [LessonsModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
