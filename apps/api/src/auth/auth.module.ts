import { Global, Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AUTH, createAuth } from "./auth.factory";
import { TeacherGuard } from "./teacher.guard";
import { StudentGuard } from "./student.guard";

@Global()
@Module({
  providers: [
    { provide: AUTH, inject: [PrismaService], useFactory: (prisma: PrismaService) => createAuth(prisma) },
    TeacherGuard,
    StudentGuard,
  ],
  exports: [AUTH, TeacherGuard, StudentGuard],
})
export class AuthModule {}
