import { Module } from "@nestjs/common";
import { JoinService } from "../join/join.service";
import { GamificationService } from "./gamification.service";
import { PlayController } from "./play.controller";
import { PlayService } from "./play.service";
import { PracticeService } from "./practice.service";

@Module({ controllers: [PlayController], providers: [PlayService, PracticeService, GamificationService, JoinService] })
export class PlayModule {}
