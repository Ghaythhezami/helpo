import { CanActivate, ExecutionContext, Inject, Injectable, createParamDecorator } from "@nestjs/common";
import type { Request } from "express";
import { unauthorized } from "../common/problem";
import { AUTH, type Auth } from "./auth.factory";

export interface TeacherContext {
  id: string;
  name: string;
  email: string;
}

export type TeacherRequest = Request & { teacher?: TeacherContext };

export function toWebHeaders(headers: Request["headers"]): Headers {
  const out = new Headers();
  for (const [k, v] of Object.entries(headers)) {
    if (Array.isArray(v)) v.forEach((x) => out.append(k, x));
    else if (typeof v === "string") out.set(k, v);
  }
  return out;
}

/** Requires a valid Better Auth session cookie; exposes the teacher through `@CurrentTeacher()`. */
@Injectable()
export class TeacherGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<TeacherRequest>();
    const session = await this.auth.api.getSession({ headers: toWebHeaders(req.headers) });
    if (!session?.user) throw unauthorized();
    req.teacher = { id: session.user.id, name: session.user.name, email: session.user.email };
    return true;
  }
}

export const CurrentTeacher = createParamDecorator((_data: unknown, ctx: ExecutionContext): TeacherContext => {
  return ctx.switchToHttp().getRequest<TeacherRequest>().teacher as TeacherContext;
});
