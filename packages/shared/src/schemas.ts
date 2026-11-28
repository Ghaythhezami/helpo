import { z } from "zod";

/* =============================================================================
 * AI content schemas. These are passed to Claude as structured-output formats,
 * so they avoid numeric/length constraints the structured-output subset may not
 * support; extra rules are enforced after parsing (see validate* helpers).
 * ========================================================================== */

export const BloomLevel = z.enum(["remember", "understand", "apply", "analyze", "evaluate", "create"]);
export type BloomLevel = z.infer<typeof BloomLevel>;

export const ObjectiveSchema = z.object({
  code: z.string().describe('Short code such as "O1"'),
  text: z.string().describe("One sentence, written for the teacher"),
  bloom: BloomLevel,
  sourcePage: z.number().int().nullable().describe("Page in the teacher's file, or null"),
});
export type Objective = z.infer<typeof ObjectiveSchema>;

export const LessonPlanSchema = z.object({
  title: z.string(),
  standard: z.string().nullable().describe('Curriculum standard code if obvious, e.g. "NGSS MS-LS1-6", else null'),
  objectives: z.array(ObjectiveSchema),
  summary: z.string().describe("Two sentences describing the lesson"),
});
export type LessonPlan = z.infer<typeof LessonPlanSchema>;

/* -----------------------------------------------------------------------------
 * AI Integration Spec, section 5: the Lesson Blueprint. ONE analysis call builds it; all five generators read
 * the blueprint, never the raw file. Counts (objectives 3–6, concepts 5–15, vocabulary ≤ 15, misconceptions ≤ 5)
 * are business rules checked after parsing (validateBlueprint), because structured outputs ignore min/max.
 * Deviation from the spec, on purpose: objectives are objects with a code and Bloom level (not plain strings),
 * because results and mastery are reported per objective (v5 mockups). `standard` is an extra field.
 * --------------------------------------------------------------------------- */
export const BlueprintSchema = z.object({
  title: z.string(),
  subject: z.string(),
  gradeLevel: z.string().describe('e.g. "Grade 6"'),
  language: z.string().describe('ISO 639-1 code of the lesson, e.g. "en", "ar", "fr". Resources follow it.'),
  summary: z.string().describe("120 to 200 words. If the document is thin, say so instead of inventing."),
  standard: z.string().nullable(),
  objectives: z.array(ObjectiveSchema).describe("3 to 6 objectives, codes O1, O2..."),
  keyConcepts: z.array(z.object({ name: z.string(), definition: z.string(), sourcePage: z.number().int().nullable() })).describe("5 to 15"),
  vocabulary: z.array(z.object({ term: z.string(), meaning: z.string() })).describe("At most 15"),
  processes: z.array(z.object({ name: z.string(), steps: z.array(z.string()) })).describe("Ordered sequences"),
  relations: z.array(z.object({ left: z.string(), right: z.string() })).describe("Pairs for matching"),
  commonMisconceptions: z.array(z.string()).describe("At most 5"),
  difficulty: z.enum(["easy", "medium", "hard"]),
  suggestedGameType: z.enum(["matching", "sorting", "memory", "sequence", "truefalse_rush", "odd_one_out"]),
});
export type Blueprint = z.infer<typeof BlueprintSchema>;
/** @deprecated use BlueprintSchema */
export const LessonBlueprintSchema = BlueprintSchema;
export type LessonBlueprint = Blueprint;

/**
 * 7.3 Presentation (slides.v2): 8 to 14 slides, fixed layouts; the AI picks the layout, never positions pixels.
 * Every field is present-or-null (structured outputs). Which fields a layout uses:
 *  - title:      title, subtitle, question (the hook), emoji
 *  - bullets:    title, keyIdea, bullets (at most 5)
 *  - twoColumn:  title, keyIdea, columns (exactly 2)
 *  - definition: term, definition, example (title is the term)
 *  - process:    title, steps (2 to 6)
 *  - quizBreak:  title, question, options (3 or 4), answerIndex (shown only on reveal), keyIdea (why, shown on reveal)
 *  - summary:    title, takeaways (3), question (the exit ticket)
 * Slides stored before v2 only have the v1 fields: use `migrateSlides` when reading.
 */
export const SlideLayout = z.enum(["title", "bullets", "twoColumn", "definition", "process", "quizBreak", "summary"]);
export const SlideSchema = z.object({
  layout: SlideLayout,
  title: z.string(),
  subtitle: z.string().nullable().describe("title layout: one short line such as the grade and topic; else null"),
  keyIdea: z.string().nullable().describe("One bold line (at most 14 words) that carries the slide's main idea; on quizBreak it is the explanation shown after the reveal"),
  bullets: z.array(z.string()).describe("bullets layout: at most 5 bullets of at most 12 words each; other layouts: an empty array"),
  columns: z
    .array(z.object({ heading: z.string(), points: z.array(z.string()).describe("2 to 4 short points") }))
    .nullable()
    .describe("twoColumn layout only: exactly 2 columns (compare and contrast); else null"),
  term: z.string().nullable().describe("definition layout only: the vocabulary word"),
  definition: z.string().nullable().describe("definition layout only: a plain-language meaning, at most 20 words"),
  example: z.string().nullable().describe("definition layout only: one concrete everyday example"),
  steps: z
    .array(z.object({ title: z.string().describe("At most 5 words"), detail: z.string().describe("At most 14 words") }))
    .nullable()
    .describe("process layout only: 2 to 6 ordered steps; else null"),
  question: z.string().nullable().describe("title: the hook question; quizBreak: the check question; summary: the exit-ticket question; else null"),
  options: z.array(z.string()).nullable().describe("quizBreak only: 3 or 4 answer options; else null"),
  answerIndex: z.number().int().nullable().describe("quizBreak only: zero-based index of the correct option; else null"),
  takeaways: z.array(z.string()).nullable().describe("summary only: exactly 3 key takeaways of at most 14 words; else null"),
  speakerNotes: z.string().describe("For the teacher: what to say, one question to ask, and one likely misconception to watch for"),
  imagePrompt: z.string().nullable().describe("Optional idea for an illustration; icons/emoji are used for now"),
  emoji: z.string().nullable().describe("One emoji that fits the slide"),
  objectiveCodes: z.array(z.string()),
});
export const SlidesContentSchema = z.object({ deckTitle: z.string(), slides: z.array(SlideSchema) });
export type SlidesContent = z.infer<typeof SlidesContentSchema>;
export type Slide = z.infer<typeof SlideSchema>;

/**
 * 7.2 Worksheet: sections by exercise type with a separate answer key (answer per item). Difficulty goes from
 * recall to application. `level` keeps the v5 differentiation (support / core / stretch) on each section.
 */
export const WorksheetItemSchema = z.object({
  prompt: z.string(),
  options: z.array(z.string()).nullable().describe("mcq options or matching right-hand column; null otherwise"),
  answer: z.string().describe("Answer key entry; never shown to students"),
  points: z.number().int(),
});
export const WorksheetSectionSchema = z.object({
  type: z.enum(["mcq", "tf", "fill", "short", "matching"]),
  heading: z.string(),
  level: z.enum(["support", "core", "stretch"]),
  objectiveCode: z.string(),
  items: z.array(WorksheetItemSchema),
});
export const WorksheetContentSchema = z.object({
  title: z.string(),
  instructions: z.string(),
  sections: z.array(WorksheetSectionSchema),
  totalPoints: z.number().int(),
});
export type WorksheetContent = z.infer<typeof WorksheetContentSchema>;

/**
 * 7.4 Quiz: 10 questions by default (5–20). mcq = 4 options with exactly one correct; tf = 2 options;
 * short = acceptedAnswers; matching = pairs. Post-processing in code: shuffle options, exactly-one-correct check,
 * de-duplicate, balance difficulty. Correct flags are stripped before anything reaches a student.
 */
export const QuestionSchema = z.object({
  id: z.string().describe('"Q1", "Q2"...'),
  type: z.enum(["mcq", "tf", "short", "matching"]),
  prompt: z.string(),
  options: z.array(z.object({ text: z.string(), correct: z.boolean() })).nullable(),
  acceptedAnswers: z.array(z.string()).nullable().describe("For short answers, matched after normalization"),
  pairs: z.array(z.object({ left: z.string(), right: z.string() })).nullable().describe("For matching questions"),
  explanation: z.string().describe("Shown after answering, at the class reading level"),
  concept: z.string().describe("A keyConcepts name or vocabulary term from the blueprint (grounding)"),
  objectiveCode: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  timeLimitSec: z.number().int(),
});
export const QuizContentSchema = z.object({ questions: z.array(QuestionSchema) });
export type QuizContent = z.infer<typeof QuizContentSchema>;
export type Question = z.infer<typeof QuestionSchema>;

/**
 * 7.5 Mini-game: a JSON game spec, rendered by pre-built React templates (no AI-written code). `type` is the
 * primary template (blueprint.suggestedGameType); the generator also fills the other fields it can, so one stored
 * spec feeds every compatible template (GAME_TEMPLATES / playableTemplates) with no further AI calls.
 */
export const GameContentSchema = z.object({
  type: z.enum(["matching", "sorting", "memory", "sequence", "truefalse_rush", "odd_one_out"]),
  title: z.string(),
  instructions: z.string(),
  timeLimitSec: z.number().int().nullable(),
  pairs: z.array(z.object({ left: z.string(), right: z.string() })).describe("matching / memory: 6 to 8 pairs"),
  gridSize: z.number().int().nullable().describe("memory: number of cards, e.g. 12"),
  sortBaskets: z.object({ yes: z.string(), no: z.string() }).describe("sorting: two categories"),
  sortItems: z.array(z.object({ label: z.string(), belongsInYes: z.boolean() })).describe("sorting: 6 to 10 items"),
  equationTiles: z.array(z.string()).describe("sequence: steps in the correct order, 4 to 8"),
  statements: z.array(z.object({ text: z.string(), isTrue: z.boolean(), explanation: z.string() })).describe("truefalse_rush: 6 to 10"),
  oddOneOut: z.array(z.object({ items: z.array(z.string()), oddIndex: z.number().int(), explanation: z.string() }))
    .describe("odd_one_out: 4 to 6 rounds of exactly 4 items; oddIndex points at the item that does not belong; explanation says why"),
});
export type GameContent = z.infer<typeof GameContentSchema>;

/** 7.1 Summary cards: 8–15, front ≤ 12 words, back ≤ 35 words, one idea per card, no duplicates. */
export const CardSchema = z.object({
  front: z.string(),
  back: z.string(),
  emoji: z.string().nullable(),
  tag: z.enum(["concept", "vocabulary", "process", "fact"]),
  concept: z.string().describe("The keyConcepts name or vocabulary term it covers (grounding)"),
  objectiveCode: z.string(),
});
export const CardsContentSchema = z.object({ cards: z.array(CardSchema) });
export type CardsContent = z.infer<typeof CardsContentSchema>;

export const AiCheckSchema = z.object({
  resource: z.enum(["SLIDES", "WORKSHEET", "QUIZ", "GAME", "CARDS"]),
  itemRef: z.string().describe('Which item, e.g. "Q4", "A5", "S3"'),
  kind: z.enum(["FACT_CHECK", "READING_LEVEL", "ORDER", "AGE_APPROPRIATE", "LANGUAGE", "GROUNDING"]),
  message: z.string().describe("Plain teacher language: what to check and why"),
  suggestion: z.string().nullable().describe("Replacement text the teacher can accept, or null"),
  sourcePage: z.number().int().nullable(),
});
export const AiChecksSchema = z.object({ checks: z.array(AiCheckSchema) });
export type AiCheckOut = z.infer<typeof AiCheckSchema>;

export const RewriteOutSchema = z.object({ text: z.string() });

export const ChangeRequestOutSchema = z.object({
  summary: z.string().describe('One short line for the change log, e.g. "Made Q3 easier"'),
  content: z.unknown().describe("The full updated resource content in the same shape as the input"),
});

export const ReteachPlanSchema = z.object({
  warmUpTitle: z.string(),
  warmUpSteps: z.array(z.string()),
  smallGroupTask: z.string(),
  targetObjectiveCode: z.string(),
});
export type ReteachPlan = z.infer<typeof ReteachPlanSchema>;

/* =============================================================================
 * API request bodies (validated server-side with Zod).
 * ========================================================================== */

export const CreateClassBody = z.object({
  name: z.string().trim().min(1).max(20),
  grade: z.number().int().min(2).max(12),
  subject: z.string().trim().min(1).max(40).default("Science"),
});

export const UpdateClassSettingsBody = z.object({
  pointsEnabled: z.boolean().optional(),
  teamsEnabled: z.boolean().optional(),
  soundsEnabled: z.boolean().optional(),
  celebrationsEnabled: z.boolean().optional(),
  weeklyGoalXp: z.number().int().min(50).max(10_000).optional(),
});

export const AddStudentsBody = z.object({
  names: z.array(z.string().trim().min(1).max(60)).min(1).max(60),
});

/**
 * POST /lessons (multipart: optional `file` + these fields). File, prompt, or both (teacher instructions such as
 * "grade 6, 20 minutes, focus on vocabulary"). Prompt 10–4000 chars, control characters stripped (cleanPrompt).
 */
export const CreateLessonBody = z.object({
  classId: z.string().min(1),
  /** National curriculum the lesson follows; steers vocabulary, standards and examples. */
  curriculum: z.enum(["GENERAL", "AMERICAN", "BRITISH", "EGYPTIAN", "TUNISIAN"]).default("GENERAL"),
  title: z.string().trim().max(140).optional(),
  prompt: z.string().trim().min(10).max(4000).optional(),
  unitTitle: z.string().trim().max(140).optional(),
  lessonNumber: z.coerce.number().int().min(1).max(99).optional(),
  durationMin: z.coerce.number().int().min(10).max(180).default(45),
  /** Page range when the file is above the 150-page soft limit, e.g. "12-40". */
  pageRange: z.string().regex(/^\d{1,4}-\d{1,4}$/).optional(),
  /** Generate in this language; default = the document's detected language. */
  contentLocale: z.enum(["en", "ar"]).optional(),
  /** Reuse extraction + blueprint of an earlier upload with the same file hash (cache by hash). */
  reuse: z.coerce.boolean().default(true),
  /** Simplified flow: one click. When true the API starts generation as soon as the blueprint is ready. */
  autoGenerate: z.coerce.boolean().default(true),
  resources: z.preprocess((v) => (typeof v === "string" ? v.split(",") : v), z.array(z.enum(["SLIDES", "WORKSHEET", "QUIZ", "GAME", "CARDS"])).min(1)).optional(),
  quizCount: z.coerce.number().int().min(5).max(20).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});

/** POST /lessons/refine-prompt: "Refine with AI" turns a rough teacher prompt into a clear lesson brief. */
export const RefinePromptBody = z.object({
  prompt: z.string().trim().min(10).max(4000),
  classId: z.string().optional(),
  locale: z.enum(["en", "ar"]).optional(),
});
/** Structured output of the refine call (also the API response). */
export const RefinedPromptSchema = z.object({
  prompt: z.string().describe("The improved prompt, in the teacher's language, at most about 600 characters"),
  suggestions: z.array(z.string()).describe("2 or 3 short optional additions the teacher can tap, e.g. '+ Add an experiment'"),
});
export type RefinedPrompt = z.infer<typeof RefinedPromptSchema>;

/** POST /lessons/:id/generate (one click). Optional: which resources, quiz length, difficulty. */
export const GenerateBody = z.object({
  resources: z.array(z.enum(["SLIDES", "WORKSHEET", "QUIZ", "GAME", "CARDS"])).min(1).default(["CARDS", "WORKSHEET", "SLIDES", "QUIZ", "GAME"]),
  quizCount: z.number().int().min(5).max(20).default(10),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});

/** POST /resources/:id/share → session with code, link and QR. */
export const ShareBody = z.object({
  mode: z.enum(["LIVE_QUIZ", "GAME", "ASSIGNMENT"]),
  game: z.enum(["MATCH", "SORT", "EQUATION", "MEMORY", "TRUE_FALSE", "ODD_ONE_OUT"]).optional(),
  /** Games the teacher publishes with this share (e.g. 2 of 6 when there are 10 minutes). Points are split among them. */
  games: z.array(z.enum(["MATCH", "SORT", "EQUATION", "MEMORY", "TRUE_FALSE", "ODD_ONE_OUT"])).min(1).max(6).optional(),
  dueAt: z.string().datetime().optional(),
  expiresInHours: z.number().int().min(1).max(24 * 14).default(24),
  leaderboard: z.enum(["OFF", "TEAMS", "INDIVIDUAL"]).default("TEAMS"),
  /** Sharing is the approval: true approves the kit even with open checks (the UI confirms first). */
  approveAnyway: z.boolean().default(false),
});

/** POST /play/:code/submit: answers for an assignment / self-paced quiz; scored on the server. */
export const PlaySubmitBody = z.object({
  answers: z.array(z.object({
    questionId: z.string().max(10),
    optionIndex: z.number().int().min(0).max(9).optional(),
    text: z.string().max(1000).optional(),
    pairs: z.array(z.object({ left: z.string().max(200), right: z.string().max(200) })).max(10).optional(),
  })).max(20),
  durationSec: z.number().int().min(0).max(4 * 3600),
});

export const UpdateLessonBody = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  standard: z.string().max(80).nullable().optional(),
  objectives: z.array(ObjectiveSchema).max(10).optional(),
});

/** Teacher edits create a new version; `revertTo` restores an earlier one (version 1 = the AI original). */
export const UpdateResourceBody = z.object({ content: z.unknown() });
export const RevertResourceBody = z.object({ version: z.number().int().min(1) });

export const RewriteBody = z.object({
  text: z.string().min(1).max(4000),
  action: z.enum(["simpler", "example", "translate", "regenerate"]),
  language: z.string().max(40).optional(),
});

export const ChangeRequestBody = z.object({ request: z.string().trim().min(3).max(500) });

export const ResolveCheckBody = z.object({
  status: z.enum(["OPEN", "ACCEPTED", "EDITED", "DISMISSED"]),
  editedText: z.string().max(4000).optional(),
});

export const CreateSessionBody = z.object({
  lessonId: z.string().min(1),
  type: z.enum(["LIVE_QUIZ", "GAME", "ASSIGNMENT"]),
  game: z.enum(["MATCH", "SORT", "EQUATION", "MEMORY", "TRUE_FALSE", "ODD_ONE_OUT"]).optional(),
  dueAt: z.string().datetime().optional(),
  namesHidden: z.boolean().default(true),
});

export const SessionActionBody = z.object({ action: z.enum(["start", "next", "prev", "reveal", "end", "toggleNames", "open", "close"]) });

export const AwardBadgeBody = z.object({ badge: z.enum(["KIND_HELPER", "NEVER_GIVES_UP"]) });

export const JoinBody = z.object({
  code: z.string().optional(),
  classId: z.string().optional(),
  studentId: z.string().optional(),
}).refine((b) => Boolean(b.code || b.classId), { message: "Give a join code or pick a class" });

export const AnswerBody = z.object({
  questionIndex: z.number().int().min(0).max(199),
  optionIndex: z.number().int().min(0).max(9).optional(),
  text: z.string().max(1000).optional(),
});

export const GameResultBody = z.object({
  lessonId: z.string().min(1),
  sessionId: z.string().optional(),
  game: z.enum(["MATCH", "SORT", "EQUATION", "MEMORY", "TRUE_FALSE", "ODD_ONE_OUT"]),
  total: z.number().int().min(1).max(40),
  firstTryCorrect: z.number().int().min(0).max(40),
  retriedCorrect: z.number().int().min(0).max(40),
  wrongTries: z.number().int().min(0).max(200).default(0),
  hintsUsed: z.number().int().min(0).max(40).default(0),
});

export const LocaleEnum = z.enum(["en", "ar"]);

export const UpdateLocaleBody = z.object({ locale: LocaleEnum });

/** Dynamic translation: fill the other language's columns for a lesson (title, objectives, resources, checks). */
export const TranslateLessonBody = z.object({ to: LocaleEnum });

export const ExportQuery = z.object({ format: z.enum(["pptx", "docx", "pdf"]) });

/** Quick join by code + name (shared link / QR), alongside the grade → class → name picker. */
export const CodeJoinBody = z.object({ name: z.string().trim().min(1).max(40) });

export const AvatarBody = z.object({
  items: z.array(z.enum(["scarf", "hat", "glasses", "backpack"])).max(4),
  background: z.enum(["lavender", "meadow", "sky"]),
});

/** POST /api/demo/login: one-click sign-in to a pre-configured demo account (only when DEMO_LOGIN=true). */
export const DemoLoginBody = z.object({ account: z.enum(["teacher", "student", "admin"]) });

/** POST /api/play/practice/:lessonId/quiz body: same answer shape as a self-paced submit. */
export const PracticeSubmitBody = PlaySubmitBody;
