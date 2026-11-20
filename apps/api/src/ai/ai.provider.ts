import type { AiCheckOut, Band, Blueprint, Locale, Objective, RefinedPrompt, ReteachPlan, ResourceKind } from "@helpo/shared";
import type { ResourceContent } from "./content";

/** Everything a prompt needs about the lesson. Never contains student names. */
export interface LessonContext {
  title: string;
  grade: number;
  band: Band;
  /** Language the output must be written in; Arabic means Modern Standard Arabic at the class reading level. */
  locale: Locale;
  language: string;
  durationMin: number;
  standard: string | null;
  objectives: Objective[];
  sourceText: string;
  description?: string | null;
  /** Result of the single analysis call; every generator reads the same blueprint (never the raw file). */
  blueprint?: Blueprint | null;
  /** Teacher instructions (prompt-only lessons are AI-written). */
  prompt?: string | null;
}

/** The translatable lesson-level texts. */
export interface LessonMeta {
  title: string;
  unitTitle: string | null;
  description: string | null;
  objectives: Objective[];
}

export interface CheckText {
  itemRef: string;
  message: string;
  suggestion: string | null;
}

/** Facts about the class that help the refinement (never student names). */
export interface RefineInput {
  prompt: string;
  locale: Locale;
  grade?: number;
  subject?: string;
  durationMin?: number;
}

export type RewriteAction = "simpler" | "example" | "translate" | "regenerate";

/** What one AI call cost and which prompt/model produced it (stored on the resource). */
export interface Usage {
  model: string;
  promptVersion: string;
  tokensIn: number;
  tokensOut: number;
}

export interface GenerateOptions {
  /** 1-based attempt number of the repair loop; later attempts use the stronger analysis model. */
  attempt?: number;
  /** Business-rule problems of the previous attempt, appended to the prompt. */
  problems?: string[];
  quizCount?: number;
  difficulty?: "easy" | "medium" | "hard";
}

export interface GeneratedResource {
  content: ResourceContent;
  usage: Usage;
}

export interface AiProvider {
  readonly mode: "claude" | "demo";
  /** ONE analysis call: the cleaned source becomes a Blueprint. */
  analyze(ctx: LessonContext): Promise<Blueprint>;
  /** Map-reduce analysis for long documents: a mini-blueprint of one chunk, then one reduce call. */
  analyzeChunk(ctx: LessonContext, chunk: string): Promise<Blueprint>;
  reduceBlueprints(ctx: LessonContext, parts: Blueprint[]): Promise<Blueprint>;
  /** client.messages.countTokens, falling back to characters / 4. */
  countTokens(text: string): Promise<number>;
  /** Scanned PDFs: the AI reads the PDF directly and returns markdown with page markers ("" in demo mode). */
  transcribePdf(pdf: Buffer): Promise<string>;
  generateResource(kind: ResourceKind, ctx: LessonContext, opts?: GenerateOptions): Promise<GeneratedResource>;
  /** Review pass: fact checks against the source, reading level, order, age-appropriateness, language, grounding. */
  generateChecks(ctx: LessonContext, resources: Partial<Record<ResourceKind, ResourceContent>>): Promise<AiCheckOut[]>;
  rewrite(ctx: LessonContext, text: string, action: RewriteAction, language?: string): Promise<string>;
  changeRequest(ctx: LessonContext, kind: ResourceKind, content: ResourceContent, request: string): Promise<{ summary: string; content: ResourceContent }>;
  /** Faithful translation of a resource's content (same schema, same ids and enums). */
  translateContent(kind: ResourceKind, content: ResourceContent, ctx: LessonContext, to: Locale): Promise<ResourceContent>;
  translateMeta(meta: LessonMeta, ctx: LessonContext, to: Locale): Promise<LessonMeta>;
  translateChecks(checks: CheckText[], ctx: LessonContext, to: Locale): Promise<CheckText[]>;
  /** "Refine with AI": a rough teacher prompt becomes a clear lesson brief (cheap model, structured output). */
  refinePrompt(input: RefineInput): Promise<RefinedPrompt>;
  reteachPlan(ctx: LessonContext, weak: { objectiveCode: string; objectiveText: string; misconception: string | null }): Promise<ReteachPlan>;
}

export const AI_PROVIDER = Symbol("AI_PROVIDER");

/** Demo mode when there is no API key, or AI_MODE=demo. */
export function isDemoMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AI_MODE === "demo" || !env.ANTHROPIC_API_KEY;
}
