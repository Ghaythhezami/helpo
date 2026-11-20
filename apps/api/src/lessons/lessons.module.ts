import { Module } from "@nestjs/common";
import { DocumentsService } from "../documents/documents.service";
import { GenerationService } from "./generation.service";
import { LessonViewService } from "./lesson-view.service";
import { LessonsController } from "./lessons.controller";
import { LessonsService } from "./lessons.service";
import { TranslationService } from "./translation.service";
import { AnalysisService } from "./analysis.service";
import { PipelineService } from "./pipeline.service";

@Module({
  controllers: [LessonsController],
  providers: [LessonsService, GenerationService, TranslationService, AnalysisService, PipelineService, LessonViewService, DocumentsService],
  exports: [LessonViewService],
})
export class LessonsModule {}
