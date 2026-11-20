import { Module } from "@nestjs/common";
import { LessonsModule } from "../lessons/lessons.module";
import { ResultsController } from "./results.controller";
import { ResultsService } from "./results.service";

@Module({ imports: [LessonsModule], controllers: [ResultsController], providers: [ResultsService] })
export class ResultsModule {}
