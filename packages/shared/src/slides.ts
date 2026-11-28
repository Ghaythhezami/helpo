import type { Slide, SlidesContent } from "./schemas.js";

type Loose = Partial<Slide> & { layout?: Slide["layout"]; title?: string };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const strs = (v: unknown): string[] | null => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null);

/**
 * Brings a slide stored before slides.v2 (or with missing fields) to the current shape: every new field is present
 * or null. Old definition / quizBreak / summary slides kept their text in `bullets`; it is lifted into the new
 * fields so the designed layouts have something to show. Idempotent: a v2 slide comes back unchanged.
 */
export function migrateSlide(raw: unknown): Slide {
  const s = (raw && typeof raw === "object" ? raw : {}) as Loose;
  const layout = s.layout ?? "bullets";
  const bullets = strs(s.bullets) ?? [];
  const slide: Slide = {
    layout,
    title: typeof s.title === "string" ? s.title : "",
    subtitle: str(s.subtitle),
    keyIdea: str(s.keyIdea),
    bullets,
    columns: Array.isArray(s.columns) ? s.columns : null,
    term: str(s.term),
    definition: str(s.definition),
    example: str(s.example),
    steps: Array.isArray(s.steps) ? s.steps : null,
    question: str(s.question),
    options: strs(s.options),
    answerIndex: typeof s.answerIndex === "number" ? s.answerIndex : null,
    takeaways: strs(s.takeaways),
    speakerNotes: typeof s.speakerNotes === "string" ? s.speakerNotes : "",
    imagePrompt: str(s.imagePrompt),
    emoji: str(s.emoji),
    objectiveCodes: strs(s.objectiveCodes) ?? [],
  };
  const isOld = !("question" in s) && !("takeaways" in s) && !("term" in s) && !("steps" in s) && !("columns" in s);
  if (!isOld) return slide;
  switch (layout) {
    case "title":
      slide.subtitle = bullets[0] ?? null;
      break;
    case "definition":
      slide.term = slide.title;
      slide.definition = bullets[0] ?? null;
      slide.example = bullets[1] ?? null;
      break;
    case "quizBreak":
      slide.question = bullets[0] ?? null;
      break;
    case "summary":
      slide.takeaways = bullets.slice(0, 3);
      break;
    case "process":
      slide.steps = bullets.map((b, i) => ({ title: `${i + 1}`, detail: b }));
      break;
    case "twoColumn":
      if (bullets.length > 1) {
        const half = Math.ceil(bullets.length / 2);
        slide.columns = [
          { heading: "", points: bullets.slice(0, half) },
          { heading: "", points: bullets.slice(half) },
        ];
      }
      break;
    default:
      break;
  }
  return slide;
}

/** Read-time migration for a whole deck. Returns the input untouched when it is not a deck. */
export function migrateSlides<T>(content: T): T extends null | undefined ? T : SlidesContent {
  const c = content as unknown as { deckTitle?: unknown; slides?: unknown } | null | undefined;
  if (!c || typeof c !== "object" || !Array.isArray(c.slides)) return content as never;
  return { deckTitle: typeof c.deckTitle === "string" ? c.deckTitle : "", slides: c.slides.map(migrateSlide) } as never;
}
