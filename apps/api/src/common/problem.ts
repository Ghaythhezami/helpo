import { HttpException } from "@nestjs/common";

/** Domain error rendered as RFC 9457 problem+json by the exception filter. */
export class ProblemException extends HttpException {
  constructor(
    status: number,
    public readonly title: string,
    public readonly detail?: string,
    public readonly errors?: { path: string; message: string }[],
    /** Extra RFC 9457 members, e.g. `existingLessonId`. */
    public readonly extensions?: Record<string, unknown>,
  ) {
    super({ title, detail }, status);
  }
}

export const notFound = (what = "Resource") => new ProblemException(404, "Not found", `${what} was not found.`);
export const badRequest = (detail: string) => new ProblemException(400, "Bad request", detail);
export const conflict = (detail: string) => new ProblemException(409, "Conflict", detail);
/** 409 that tells the client which lesson already holds the same file. */
export const duplicateUpload = (existingLessonId: string) =>
  new ProblemException(409, "Duplicate upload", "You already uploaded this file. Open the existing lesson instead.", undefined, { existingLessonId });

export const unauthorized = (detail = "Sign in to continue.") => new ProblemException(401, "Unauthorized", detail);
