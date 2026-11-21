import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z, type ZodType } from "zod";
import {
  LIMITS,
  AiChecksSchema,
  BlueprintSchema,
  RefinedPromptSchema,
  ReteachPlanSchema,
  RewriteOutSchema,
  type AiCheckOut,
  type Blueprint,
  type Locale,
  type RefinedPrompt,
  type ReteachPlan,
  type ResourceKind,
} from "@helpo/shared";
import type { AiProvider, CheckText, RefineInput, GenerateOptions, GeneratedResource, LessonContext, LessonMeta, RewriteAction } from "./ai.provider";
import { CONTENT_SCHEMAS, type ResourceContent } from "./content";
import { AiBadRequestError, AiError, AiMaxTokensError, AiOutputError, AiRateLimitError, AiRefusalError, AiUnavailableError } from "./errors";
import {
  CHECKS_TASK,
  SYSTEM_PROMPT,
  TRANSCRIBE_TASK,
  analyzeTask,
  changeTask,
  chunkTask,
  documentBlock,
  lessonSourceBlock,
  reduceTask,
  REFINE_TASK,
  refineBlock,
  reteachTask,
  rewriteTask,
  translateTask,
  translationBlock,
} from "./prompts";
import { PROMPT_VERSIONS, taskFor } from "./prompts/index";
import { CheckTextsSchema, LessonMetaSchema } from "./translate-schemas";

export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Maps the SDK's typed error chain to friendly problem details. */
export function mapSdkError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Anthropic.RateLimitError) return new AiRateLimitError();
  if (error instanceof Anthropic.BadRequestError) return new AiBadRequestError();
  if (error instanceof Anthropic.APIError) {
    const status = typeof error.status === "number" ? error.status : 0;
    if (status === 401 || status === 403) return new AiUnavailableError("The AI service rejected Nibras's credentials. Ask your administrator to check the API key.");
    return new AiUnavailableError();
  }
  return new AiUnavailableError();
}

type TextBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };
type Effort = "low" | "medium" | "high" | "xhigh" | "max";

interface AskOptions {
  model: string;
  effort: Effort;
}

interface Asked<T> {
  out: T;
  tokensIn: number;
  tokensOut: number;
}

export class ClaudeAiProvider implements AiProvider {
  readonly mode = "claude" as const;
  private readonly client: Anthropic;
  /** Analysis, review and retry-after-failure use the stronger model. */
  readonly analysisModel = process.env.CLAUDE_ANALYSIS_MODEL || process.env.CLAUDE_MODEL || "claude-opus-5-5";
  /** The five generators use the cheaper model. */
  readonly genModel = process.env.CLAUDE_GEN_MODEL || "claude-sonnet-5-5";
  private readonly analysisEffort = (process.env.CLAUDE_EFFORT || "medium") as Effort;

  constructor(client?: Anthropic) {
    // SDK default is 10 min per call; keep it inside the 3 min job timeout and the Vercel maxDuration. The SDK's own 2 retries (429/5xx) stay on.
    this.client = client ?? new Anthropic({ timeout: LIMITS.aiCallTimeoutMs, maxRetries: 2 });
  }

  /** One structured call. The shared block is cached; the variable task text comes after it. */
  private async ask<S extends ZodType>(schema: S, ctxBlock: string, task: string, o: AskOptions): Promise<Asked<z.infer<S>>> {
    const content: TextBlock[] = [
      { type: "text", text: ctxBlock, cache_control: { type: "ephemeral" } },
      { type: "text", text: task },
    ];
    try {
      // Refusal fallbacks are on by default: beta.messages.parse accepts `betas` + `fallbacks` in this SDK version.
      const response = await this.client.beta.messages.parse({
        model: o.model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
        output_config: { format: zodOutputFormat(schema), effort: o.effort },
        betas: [FALLBACK_BETA],
        fallbacks: "default",
      });
      if (response.stop_reason === "refusal") throw new AiRefusalError(response.stop_details);
      if (response.stop_reason === "max_tokens") throw new AiMaxTokensError();
      if (response.parsed_output === null || response.parsed_output === undefined) throw new AiOutputError();
      return {
        out: response.parsed_output as z.infer<S>,
        tokensIn: response.usage?.input_tokens ?? 0,
        tokensOut: response.usage?.output_tokens ?? 0,
      };
    } catch (e) {
      throw mapSdkError(e);
    }
  }

  private strong(): AskOptions {
    return { model: this.analysisModel, effort: this.analysisEffort };
  }

  private cheap(): AskOptions {
    return { model: this.genModel, effort: "low" };
  }

  async analyze(ctx: LessonContext): Promise<Blueprint> {
    return (await this.ask(BlueprintSchema, documentBlock({ ...ctx, objectives: [], blueprint: null }), analyzeTask(), this.strong())).out;
  }

  async analyzeChunk(ctx: LessonContext, chunk: string): Promise<Blueprint> {
    return (await this.ask(BlueprintSchema, documentBlock({ ...ctx, objectives: [], blueprint: null, sourceText: chunk }), chunkTask(), this.strong())).out;
  }

  async reduceBlueprints(ctx: LessonContext, parts: Blueprint[]): Promise<Blueprint> {
    return (await this.ask(BlueprintSchema, documentBlock({ ...ctx, objectives: [], blueprint: null, sourceText: "" }), reduceTask(parts), this.strong())).out;
  }

  /** client.messages.countTokens, falling back to an estimate of characters / 4. */
  async countTokens(text: string): Promise<number> {
    try {
      const r = await this.client.messages.countTokens({ model: this.analysisModel, messages: [{ role: "user", content: text }] });
      return r.input_tokens;
    } catch {
      return Math.ceil(text.length / 4);
    }
  }

  /** Scanned PDF: Claude reads the document directly (base64 `document` block) and transcribes it. */
  async transcribePdf(pdf: Buffer): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.analysisModel,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
              { type: "text", text: TRANSCRIBE_TASK },
            ],
          },
        ],
      });
      if (response.stop_reason === "refusal") throw new AiRefusalError(response.stop_details);
      return response.content.map((b) => (b.type === "text" ? b.text : "")).join("\n").trim();
    } catch (e) {
      throw mapSdkError(e);
    }
  }

  async generateResource(kind: ResourceKind, ctx: LessonContext, opts: GenerateOptions = {}): Promise<GeneratedResource> {
    const attempt = opts.attempt ?? 1;
    const model = attempt >= 2 ? this.analysisModel : this.genModel; // retry-after-failure uses the stronger model
    const problems = opts.problems?.length ? `\n\n## Fix these problems from your previous answer\n- ${opts.problems.join("\n- ")}` : "";
    const task = `## Task\n${taskFor(kind, { quizCount: opts.quizCount, difficulty: opts.difficulty, suggestedGame: ctx.blueprint?.suggestedGameType })}${problems}`;
    const r = await this.ask(CONTENT_SCHEMAS[kind], lessonSourceBlock(ctx), task, { model, effort: "low" });
    return { content: r.out as ResourceContent, usage: { model, promptVersion: PROMPT_VERSIONS[kind], tokensIn: r.tokensIn, tokensOut: r.tokensOut } };
  }

  async generateChecks(ctx: LessonContext, resources: Partial<Record<ResourceKind, ResourceContent>>): Promise<AiCheckOut[]> {
    const task = `${CHECKS_TASK}\n\n## Resources\n${JSON.stringify(resources)}`;
    const r = await this.ask(AiChecksSchema, documentBlock(ctx), task, this.strong());
    return r.out.checks.slice(0, 5);
  }

  async rewrite(ctx: LessonContext, text: string, action: RewriteAction, language?: string): Promise<string> {
    return (await this.ask(RewriteOutSchema, lessonSourceBlock(ctx), rewriteTask(text, action, language), this.cheap())).out.text;
  }

  async changeRequest(ctx: LessonContext, kind: ResourceKind, content: ResourceContent, request: string) {
    const schema = z.object({ summary: z.string(), content: CONTENT_SCHEMAS[kind] });
    const r = await this.ask(schema, lessonSourceBlock(ctx), changeTask(kind, content, request), this.cheap());
    return { summary: r.out.summary, content: r.out.content as ResourceContent };
  }

  async refinePrompt(input: RefineInput): Promise<RefinedPrompt> {
    return (await this.ask(RefinedPromptSchema, refineBlock(input), REFINE_TASK, this.cheap())).out;
  }

  async reteachPlan(ctx: LessonContext, weak: { objectiveCode: string; objectiveText: string; misconception: string | null }): Promise<ReteachPlan> {
    return (await this.ask(ReteachPlanSchema, lessonSourceBlock(ctx), reteachTask(weak), this.cheap())).out;
  }

  async translateContent(kind: ResourceKind, content: ResourceContent, ctx: LessonContext, to: Locale): Promise<ResourceContent> {
    return (await this.ask(CONTENT_SCHEMAS[kind], translationBlock(ctx, to), translateTask(kind, content), this.cheap())).out as ResourceContent;
  }

  async translateMeta(meta: LessonMeta, ctx: LessonContext, to: Locale): Promise<LessonMeta> {
    return (await this.ask(LessonMetaSchema, translationBlock(ctx, to), translateTask("lesson title, description and objectives", meta), this.cheap())).out;
  }

  async translateChecks(checks: CheckText[], ctx: LessonContext, to: Locale): Promise<CheckText[]> {
    if (checks.length === 0) return [];
    return (await this.ask(CheckTextsSchema, translationBlock(ctx, to), translateTask("review flags", { items: checks }), this.cheap())).out.items;
  }
}
