import { Module } from "@nestjs/common";
import { SessionsModule } from "../sessions/sessions.module";
import { ResourcesController } from "./resources.controller";
import { ExportService } from "./export.service";
import { ResourcesService } from "./resources.service";

@Module({ imports: [SessionsModule], controllers: [ResourcesController], providers: [ResourcesService, ExportService] })
export class ResourcesModule {}
