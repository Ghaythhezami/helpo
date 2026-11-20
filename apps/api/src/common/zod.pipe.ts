import { Injectable, PipeTransform } from "@nestjs/common";
import type { ZodType, z } from "zod";
import { ProblemException } from "./problem";

/** Validates a body/query value with a Zod schema; failures become 400 problem+json with per-field errors. */
@Injectable()
export class ZodValidationPipe<S extends ZodType> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    throw new ProblemException(
      400,
      "Validation failed",
      "Some fields are not valid.",
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
}
