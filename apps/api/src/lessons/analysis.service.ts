import { Inject, Injectable, Logger } from "@nestjs/common";
import { BlueprintSchema, LIMITS, type Blueprint } from "@helpo/shared";
import { AI_PROVIDER, type AiProvider, type LessonContext } from "../ai/ai.provider";
import { blueprintProblems } from "../ai/content";
import { chunkText } from "../documents/documents.service";

/** Map-reduce kicks in above this share of the analysis budget (spec section 6). */
export const MAP_REDUCE_SHARE = 0.6;
const CHUNK_TOKENS = 4000;
const OVERLAP_TOKENS = 400;
const CONCURRENCY = 3;

/** Runs `fn` over `items` with at most `limit` in flight, keeping order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Trims a blueprint to the spec limits. Too few items is allowed (a thin document stays thin). */
export function normalizeBlueprint(b: Blueprint): Blueprint {
  const L = LIMITS.blueprint;
  return {
    ...b,
    objectives: b.objectives.slice(0, L.objectivesMax),
    keyConcepts: b.keyConcepts.slice(0, L.conceptsMax),
    vocabulary: b.vocabulary.slice(0, L.vocabularyMax),
    commonMisconceptions: b.commonMisconceptions.slice(0, L.misconceptionsMax),
  };
}

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(@Inject(AI_PROVIDER) private readonly ai: AiProvider) {}

  /** ONE analysis call (or map-reduce for long documents) that returns a validated Blueprint. */
  async build(ctx: LessonContext, tokenCount: number | null): Promise<Blueprint> {
    const budget = Number(process.env.ANALYSIS_BUDGET_TOKENS) || 150_000;
    const long = (tokenCount ?? Math.ceil(ctx.sourceText.length / 4)) > budget * MAP_REDUCE_SHARE;
    let blueprint: Blueprint;
    if (long) {
      const chunks = chunkText(ctx.sourceText, CHUNK_TOKENS * 4, OVERLAP_TOKENS * 4);
      this.logger.log(`Map-reduce analysis: ${chunks.length} chunks`);
      const parts = await mapLimit(chunks, CONCURRENCY, (chunk) => this.ai.analyzeChunk(ctx, chunk));
      blueprint = await this.ai.reduceBlueprints(ctx, parts);
    } else {
      blueprint = await this.ai.analyze(ctx);
    }
    const parsed = BlueprintSchema.parse(blueprint);
    const problems = blueprintProblems(parsed);
    if (problems.length) this.logger.warn(`Blueprint outside the usual limits (trimmed): ${problems.join(" ")}`);
    return normalizeBlueprint(parsed);
  }
}
