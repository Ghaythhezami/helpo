import { Module } from "@nestjs/common";
import { LessonsModule } from "../lessons/lessons.module";
import { ClassesController } from "./classes.controller";
import { ClassesService } from "./classes.service";

@Module({ imports: [LessonsModule], controllers: [ClassesController], providers: [ClassesService] })
export class ClassesModule {}
