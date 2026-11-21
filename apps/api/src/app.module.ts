import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { AiModule } from "./ai/ai.module";
import { AuthModule } from "./auth/auth.module";
import { ChecksModule } from "./checks/checks.module";
import { ClassesModule } from "./classes/classes.module";
import { ProblemFilter } from "./common/problem.filter";
import { RateLimitGuard } from "./common/rate-limit";
import { DashboardModule } from "./dashboard/dashboard.module";
import { HealthModule } from "./health/health.module";
import { JoinModule } from "./join/join.module";
import { JobsModule } from "./jobs/jobs.module";
import { StorageModule } from "./storage/storage.module";
import { LessonsModule } from "./lessons/lessons.module";
import { MeModule } from "./me/me.module";
import { AdminModule } from "./admin/admin.module";
import { DemoModule } from "./demo/demo.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { PlayModule } from "./play/play.module";
import { PrismaModule } from "./prisma/prisma.service";
import { ResourcesModule } from "./resources/resources.module";
import { ResultsModule } from "./results/results.module";
import { SessionsModule } from "./sessions/sessions.module";
import { StudentsModule } from "./students/students.module";

@Module({
  imports: [
    PrismaModule,
    JobsModule,
    StorageModule,
    AiModule,
    AuthModule,
    MeModule,
    DashboardModule,
    ClassesModule,
    StudentsModule,
    LessonsModule,
    ResourcesModule,
    ChecksModule,
    SessionsModule,
    ResultsModule,
    JoinModule,
    PlayModule,
    HealthModule,
    RealtimeModule,
    DemoModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ProblemFilter },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
