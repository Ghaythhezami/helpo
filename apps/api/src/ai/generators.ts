import { Logger } from "@nestjs/common";
import type { ZodType } from "zod";
import type { ResourceKind } from "@helpo/shared";
import type { AiProvider, GenerateOptions, LessonContext, Usage } from "./ai.provider";
import {
  CONTENT_SCHEMAS,
  collectTexts,
  contentProblems,
  dedupe,
  dropUngrounded,
  languageMatches,
  postProcessQuiz,
  postProcessSlides,
  postProcessWorksheet,
  type ResourceContent,
} from "./content";
import { AiOutputError, AiRefusalError } from "./errors";
import { PROMPT_VERSIONS } from "./prompts/index";
import type { QuizContent, SlidesContent, WorksheetContent } from "@helpo/shared";

/**
 * One contract for the five generators (spec section 2): the kind, its Zod schema, the versioned prompt, and the
 * code that cleans and checks what the model returned. The repair loop below is shared.
 */
export interface Generator<T = ResourceContent> {
  kind: ResourceKind;
  schema: ZodType<T>;
  promptVersion: string;
  /** Deterministic clean-up: trim, shuffle quiz options, one correct option, order by difficulty, totals. */
  postProcess(out: T, rng?: () => number): T;
  /** Business rules for this kind. Empty array means valid. */
  validate(out: T, ctx: LessonContext, opts: GenerateOptions): string[];
}

const make = (kind: ResourceKind, postProcess: (c: ResourceContent, rng?: () => number) => ResourceContent): Generator => ({
  kind,
  schema: CONTENT_SCHEMAS[kind],
  promptVersion: PROMPT_VERSIONS[kind],
  postProcess,
  validate: (out, ctx, opts) => {
    const problems = contentProblems(kind, out, { quizCount: opts.quizCount });
    const language = ctx.blueprint?.language ?? ctx.locale;
    if (!languageMatches(collectTexts(out), language)) problems.push(`The text must be written in the language "${language}".`);
    return problems;
  },
});

export const GENERATORS: Record<ResourceKind, Generator> = {
  CARDS: make("CARDS", (c) => c),
  WORKSHEET: make("WORKSHEET", (c) => postProcessWorksheet(c as WorksheetContent)),
  SLIDES: make("SLIDES", (c) => postProcessSlides(c as SlidesContent)),
  QUIZ: make("QUIZ", (c, rng) => postProcessQuiz(c as QuizContent, rng)),
  GAME: make("GAME", (c) => c),
};

export const MAX_ATTEMPTS = 3;
const logger = new Logger("Generator");

export interface RepairDeps {
  /** Used in structured logs. */
  lessonId?: string;
  rng?: () => number;
  /** Called before each attempt (1-based), e.g. to write progress. */
  onAttempt?: (attempt: number) => void | Promise<void>;
}

export interface RepairResult {
  content: ResourceContent;
  usage: Usage;
  attempts: number;
}

/**
 * Repair loop (spec section 8): schema, then post-processing, grounding, de-duplication and business rules.
 * When something is wrong the call is retried with the list of problems appended, up to 3 attempts; later
 * attempts use the stronger model (the provider decides from `attempt`). A refusal is never retried.
 */
export async function generateWithRepair(
  provider: AiProvider,
  kind: ResourceKind,
  ctx: LessonContext,
  opts: GenerateOptions = {},
  deps: RepairDeps = {},
): Promise<RepairResult> {
  const gen = GENERATORS[kind];
  let problems: string[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let lastUsage: Usage = { model: "unknown", promptVersion: gen.promptVersion, tokensIn: 0, tokensOut: 0 };
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await deps.onAttempt?.(attempt);
    const started = Date.now();
    try {
      const raw = await provider.generateResource(kind, ctx, { ...opts, attempt, problems });
      tokensIn += raw.usage.tokensIn;
      tokensOut += raw.usage.tokensOut;
      lastUsage = raw.usage;

      const parsed = gen.schema.safeParse(raw.content);
      if (!parsed.success) {
        problems = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`);
      } else {
        let content = gen.postProcess(parsed.data, deps.rng);
        if (ctx.blueprint) {
          const g = dropUngrounded(kind, content, ctx.blueprint);
          if (g.dropped) logger.log(JSON.stringify({ lessonId: deps.lessonId, kind, attempt, grounding: `dropped ${g.dropped}` }));
          content = g.content;
        }
        content = dedupe(kind, content).content;
        // Dropping can leave fewer items than the minimum: the rules below then ask for a regeneration.
        // the offline demo provider has a fixed bank of 10 questions, so the requested length is only enforced for Claude
        problems = gen.validate(content, ctx, provider.mode === "demo" ? { ...opts, quizCount: undefined } : opts);
        if (problems.length === 0) {
          logger.log(JSON.stringify({ lessonId: deps.lessonId, kind, attempt, latencyMs: Date.now() - started, tokensIn, tokensOut, model: lastUsage.model }));
          return { content, usage: { ...lastUsage, tokensIn, tokensOut }, attempts: attempt };
        }
      }
      logger.warn(JSON.stringify({ lessonId: deps.lessonId, kind, attempt, latencyMs: Date.now() - started, problems: problems.slice(0, 5) }));
      lastError = new AiOutputError(`The ${kind.toLowerCase()} did not pass the checks: ${problems.slice(0, 3).join(" ")}`);
    } catch (e) {
      if (e instanceof AiRefusalError) throw e;
      lastError = e;
      problems = [];
      logger.warn(JSON.stringify({ lessonId: deps.lessonId, kind, attempt, latencyMs: Date.now() - started, error: e instanceof Error ? e.message : String(e) }));
    }
  }
  throw lastError instanceof Error ? lastError : new AiOutputError();
}
