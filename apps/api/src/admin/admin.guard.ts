import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { AUTH, type Auth } from "../auth/auth.factory";
import { toWebHeaders, type TeacherRequest } from "../auth/teacher.guard";
import { notFound, unauthorized } from "../common/problem";
import { PrismaService } from "../prisma/prisma.service";

/** Role ADMIN only. Anyone else signed in gets a 404 (the admin area does not reveal itself); nobody signed in gets 401. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<TeacherRequest>();
    const session = await this.auth.api.getSession({ headers: toWebHeaders(req.headers) });
    if (!session?.user) throw unauthorized();
    const user = await this.prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
    if (user?.role !== "ADMIN") throw notFound("Page");
    req.teacher = { id: session.user.id, name: session.user.name, email: session.user.email };
    return true;
  }
}
