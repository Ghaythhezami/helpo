import { z } from "zod";
import { ObjectiveSchema } from "@helpo/shared";

export const LessonMetaSchema = z.object({
  title: z.string(),
  unitTitle: z.string().nullable(),
  description: z.string().nullable(),
  objectives: z.array(ObjectiveSchema),
});

export const CheckTextsSchema = z.object({
  items: z.array(z.object({ itemRef: z.string(), message: z.string(), suggestion: z.string().nullable() })),
});
