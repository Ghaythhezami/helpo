import { Module } from "@nestjs/common";
import { JoinService } from "../join/join.service";
import { GamificationService } from "./gamification.service";
import { PlayController } from "./play.controller";
import { PlayService } from "./play.service";

@Module({ controllers: [PlayController], providers: [PlayService, GamificationService, JoinService] })
export class PlayModule {}
