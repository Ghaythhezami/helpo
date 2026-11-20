/**
 * Pure domain rules shared by the API and the web app.
 * No I/O here: everything is deterministic and unit-tested.
 */

/* --------------------------- Languages (i18n) --------------------------- */

/** Supported UI and content languages. Every translatable DB text has two columns: `<field>En` and `<field>Ar`. */
export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_LABELS: Record<Locale, string> = { en: "English", ar: "العربية" };
export const LOCALE_HEADER = "x-helpo-locale";
export const LOCALE_COOKIE = "helpo_locale";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ar";
}

export function isRtl(locale: Locale): boolean {
  return locale === "ar";
}

export function otherLocale(locale: Locale): Locale {
  return locale === "en" ? "ar" : "en";
}

/** Picks the value for the requested locale, falling back to the other language when it is missing. */
export function pickLocalized<T>(values: { en: T | null | undefined; ar: T | null | undefined }, locale: Locale): {
  value: T | null;
  locale: Locale | null;
  fallback: boolean;
} {
  const wanted = values[locale];
  if (wanted !== null && wanted !== undefined && wanted !== "") return { value: wanted, locale, fallback: false };
  const other = otherLocale(locale);
  const alt = values[other];
  if (alt !== null && alt !== undefined && alt !== "") return { value: alt, locale: other, fallback: true };
  return { value: null, locale: null, fallback: false };
}

/** Parses an Accept-Language-like header or explicit header value into a supported locale. */
export function resolveLocale(input: string | null | undefined): Locale {
  if (!input) return DEFAULT_LOCALE;
  const first = input.split(",")[0]?.trim().slice(0, 2).toLowerCase();
  return isLocale(first) ? first : DEFAULT_LOCALE;
}

export const RESOURCE_KINDS =["SLIDES", "WORKSHEET", "QUIZ", "GAME", "CARDS"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const RESOURCE_LABELS: Record<ResourceKind, string> = {
  SLIDES: "Slides",
  WORKSHEET: "Worksheet",
  QUIZ: "Quiz",
  GAME: "Game",
  CARDS: "Cards",
};

export type ResourceStatus = "WAITING" | "WORKING" | "READY" | "FAILED";
/** Pipeline (Ghayth technical flow): upload → extract (no AI) → analyze (one AI call → blueprint) → generate 5 → review. */
export type LessonStatus = "DRAFT" | "UPLOADED" | "EXTRACTING" | "ANALYZING" | "ANALYZED" | "GENERATING" | "READY" | "PARTIAL" | "FAILED";
export type CheckKind = "FACT_CHECK" | "READING_LEVEL" | "ORDER" | "AGE_APPROPRIATE" | "LANGUAGE" | "GROUNDING";
export type CheckStatus = "OPEN" | "ACCEPTED" | "EDITED" | "DISMISSED";
export type SessionType = "LIVE_QUIZ" | "GAME" | "ASSIGNMENT";
export type SessionStatus = "LOBBY" | "LIVE" | "ENDED";
/** Spec names: matching=MATCH, sorting=SORT, sequence=EQUATION, memory=MEMORY, truefalse_rush=TRUE_FALSE. */
export type GameKind = "MATCH" | "SORT" | "EQUATION" | "MEMORY" | "TRUE_FALSE";
export const GAME_KINDS: GameKind[] = ["MATCH", "MEMORY", "SORT", "EQUATION", "TRUE_FALSE"];
export const SPEC_GAME_TYPE: Record<GameKind, "matching" | "sorting" | "sequence" | "memory" | "truefalse_rush"> = {
  MATCH: "matching", SORT: "sorting", EQUATION: "sequence", MEMORY: "memory", TRUE_FALSE: "truefalse_rush",
};

/**
 * Game template library (Ghayth's proposal): games are reusable, pre-built React templates.
 * AI never writes game code; it only produces the structured GameContent JSON once per lesson, which is
 * stored in the GAME resource and injected into any compatible template for every student, with no further
 * AI calls. Add a template by adding an entry here plus its component in apps/web.
 */
export interface GameTemplate {
  kind: GameKind;
  name: string;
  nameAr: string;
  description: string;
  uses: ("pairs" | "sortItems" | "equationTiles" | "statements")[]; // GameContent fields the template reads
  minItems: number;
  bands: Band[]; // age bands it suits
  timed: boolean; // never timed for the Explorer band
}

export const GAME_TEMPLATES: Record<GameKind, GameTemplate> = {
  MATCH: { kind: "MATCH", name: "Match it", nameAr: "طابِق", description: "Tap a term, then its meaning.", uses: ["pairs"], minItems: 4, bands: ["EXPLORER", "NAVIGATOR", "STUDIO"], timed: false },
  MEMORY: { kind: "MEMORY", name: "Memory cards", nameAr: "بطاقات الذاكرة", description: "Flip two cards to find a matching pair.", uses: ["pairs"], minItems: 4, bands: ["EXPLORER", "NAVIGATOR"], timed: false },
  SORT: { kind: "SORT", name: "Sort it", nameAr: "صنِّف", description: "Put each item in the right basket.", uses: ["sortItems"], minItems: 4, bands: ["EXPLORER", "NAVIGATOR", "STUDIO"], timed: false },
  EQUATION: { kind: "EQUATION", name: "Build the sequence", nameAr: "رتِّب الخطوات", description: "Put the tiles in the right order.", uses: ["equationTiles"], minItems: 3, bands: ["NAVIGATOR", "STUDIO"], timed: false },
  TRUE_FALSE: { kind: "TRUE_FALSE", name: "True or false rush", nameAr: "صح أم خطأ", description: "Decide fast: true or false? See why after each one.", uses: ["statements"], minItems: 5, bands: ["EXPLORER", "NAVIGATOR", "STUDIO"], timed: true },
};

/** Templates a given lesson's GameContent can feed (enough items for each field the template reads). */
export function playableTemplates(content: { pairs: unknown[]; sortItems: unknown[]; equationTiles: unknown[]; statements?: unknown[] }, band: Band): GameKind[] {
  return (Object.values(GAME_TEMPLATES) as GameTemplate[])
    .filter((t) => t.bands.includes(band))
    .filter((t) => t.uses.every((field) => ((content as Record<string, unknown[] | undefined>)[field]?.length ?? 0) >= t.minItems))
    .map((t) => t.kind);
}

/** Brand shown in the UI. The logo/wordmark is always the Latin "Nibras" (also in Arabic UI); nameAr is for sentences only. */
export const BRAND = { name: "Nibras", nameAr: "نبراس", tagline: "Light the way to every lesson", taglineAr: "نُنير طريق كل درس" } as const;

export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024; // MAX_UPLOAD_MB on the server
/** Limits from the AI Integration Spec (section 3, 6, 7, 12). Tune with real lessons. */
export const LIMITS = {
  pageSoftLimit: 150, // above it, ask the teacher for a page range
  promptMin: 10,
  promptMax: 4000,
  uploadsPerHour: 10, // per teacher
  monthlyLessonQuota: 100, // per teacher, MONTHLY_LESSON_QUOTA
  scannedCharsPerPage: 50, // below → OCR fallback (Claude reads the PDF)
  cards: { min: 8, max: 15, frontWords: 12, backWords: 35 },
  slides: { min: 8, max: 14, bullets: 5, bulletWords: 14 },
  quiz: { min: 5, max: 20, default: 10 },
  blueprint: { objectivesMin: 3, objectivesMax: 6, conceptsMin: 5, conceptsMax: 15, vocabularyMax: 15, misconceptionsMax: 5 },
  aiCallTimeoutMs: 120_000, // spec says 60 s for OpenAI; Claude long structured outputs need more
  jobTimeoutMs: 180_000,
  jobAttempts: 3,
  repairAttempts: 3,
} as const;

/** Removes control characters (keeps newlines and tabs) and trims, for teacher prompts. */
export function cleanPrompt(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

/** Who may see a ranking. Children never see individual ranks by default (UX KB T20/T24). */
export type LeaderboardMode = "OFF" | "TEAMS" | "INDIVIDUAL";
export function leaderboardAllowed(mode: LeaderboardMode, band: Band): LeaderboardMode {
  if (mode === "INDIVIDUAL" && band === "EXPLORER") return "TEAMS";
  return mode;
}
export const UPLOAD_TYPES = ["pdf", "docx", "pptx", "txt", "md"] as const;
export type UploadType = (typeof UPLOAD_TYPES)[number];

/** Age bands: the student UI adapts to the class grade (grades 2 to 12). */
export type Band = "EXPLORER" | "NAVIGATOR" | "STUDIO";

export const BAND_LABELS: Record<Band, string> = {
  EXPLORER: "Explorer",
  NAVIGATOR: "Navigator",
  STUDIO: "Studio",
};

export const MIN_GRADE = 2;
export const MAX_GRADE = 12;

export function bandForGrade(grade: number): Band {
  if (!Number.isInteger(grade) || grade < MIN_GRADE || grade > MAX_GRADE) {
    throw new RangeError(`Grade must be an integer from ${MIN_GRADE} to ${MAX_GRADE}`);
  }
  if (grade <= 5) return "EXPLORER";
  if (grade <= 8) return "NAVIGATOR";
  return "STUDIO";
}

/* ----------------------------- Gamification ----------------------------- */

/** XP needed to go from one level to the next. Flat on purpose: easy to explain to a child. */
export const XP_PER_LEVEL = 500;

export interface LevelInfo {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number; // 0..1
}

export function levelForXp(totalXp: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpIntoLevel = xp % XP_PER_LEVEL;
  return { level, xpIntoLevel, xpForNextLevel: XP_PER_LEVEL, progress: xpIntoLevel / XP_PER_LEVEL };
}

const LEVEL_TITLES = [
  "Seedling", "Sprout", "Explorer", "Observer", "Investigator",
  "Plant Spotter", "Plant Scout", "Field Scientist", "Lab Leader", "Master Scientist",
];

export function levelTitle(level: number): string {
  return LEVEL_TITLES[Math.min(Math.max(level, 1), LEVEL_TITLES.length) - 1];
}

/**
 * XP rewards effort, not only correctness (UX KB T20): trying, retrying after "Not yet",
 * finishing and beating your own best all earn XP.
 */
export const XP_RULES = {
  answerCorrectFirstTry: 10,
  answerCorrectAfterRetry: 5,
  answerAttempt: 2,
  finishGame: 20,
  beatPersonalBest: 15,
  perStar: 5,
  maxPerGame: 80,
  maxPerQuizQuestion: 10,
} as const;

export interface GameScoreInput {
  pairsOrItems: number; // total items in the round
  firstTryCorrect: number;
  retriedCorrect: number;
  previousBestStars: number; // 0 when never played
}

export interface GameScore {
  stars: 0 | 1 | 2 | 3;
  xp: number;
  personalBest: boolean;
}

/** Server-authoritative game scoring: the client reports counts, the server caps and computes XP. */
export function scoreGame(input: GameScoreInput): GameScore {
  const total = Math.max(1, Math.floor(input.pairsOrItems));
  const first = clampInt(input.firstTryCorrect, 0, total);
  const retried = clampInt(input.retriedCorrect, 0, total - first);
  const completed = first + retried;
  const accuracy = first / total;
  let stars: 0 | 1 | 2 | 3 = 0;
  if (completed === total) stars = accuracy >= 0.9 ? 3 : accuracy >= 0.6 ? 2 : 1;
  const personalBest = stars > input.previousBestStars;
  let xp =
    first * XP_RULES.answerCorrectFirstTry +
    retried * XP_RULES.answerCorrectAfterRetry +
    (completed === total ? XP_RULES.finishGame : 0) +
    stars * XP_RULES.perStar +
    (personalBest && stars > 0 ? XP_RULES.beatPersonalBest : 0);
  xp = Math.min(xp, XP_RULES.maxPerGame);
  return { stars, xp, personalBest };
}

/** Forgiving streak (UX KB T20 §4): one missed day is harmless; a saver covers a second. */
export interface StreakState {
  days: number;
  saversLeft: number;
  lastActiveDay: string | null; // YYYY-MM-DD in the school's timezone
}

export function nextStreak(state: StreakState, today: string): StreakState & { message: string } {
  if (state.lastActiveDay === today) return { ...state, message: `${state.days}-day learning streak` };
  if (!state.lastActiveDay) return { days: 1, saversLeft: state.saversLeft, lastActiveDay: today, message: "1-day learning streak" };
  const gap = daysBetween(state.lastActiveDay, today);
  if (gap === 1) {
    const days = state.days + 1;
    return { days, saversLeft: state.saversLeft, lastActiveDay: today, message: `${days}-day learning streak` };
  }
  if (gap === 2 && state.saversLeft > 0) {
    const days = state.days + 1;
    return { days, saversLeft: state.saversLeft - 1, lastActiveDay: today, message: `${days}-day learning streak (a saver kept it going)` };
  }
  return { days: 1, saversLeft: state.saversLeft, lastActiveDay: today, message: "Welcome back! Pick up where you left off." };
}

export function daysBetween(fromDay: string, toDay: string): number {
  const a = Date.parse(`${fromDay}T00:00:00Z`);
  const b = Date.parse(`${toDay}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) throw new RangeError("Days must be YYYY-MM-DD");
  return Math.round((b - a) / 86_400_000);
}

export const BADGES = {
  PLANT_SCOUT: { name: "Plant Scout", howToEarn: "Match every plant part in a game." },
  WORD_WIZARD: { name: "Word Equation Wizard", howToEarn: "Get the word equation objective to 80%." },
  KIND_HELPER: { name: "Kind Helper", howToEarn: "Given by your teacher for helping others." },
  NEVER_GIVES_UP: { name: "Never Gives Up", howToEarn: "Fix five Not yet answers." },
  WATER_WISE: { name: "Water Wise", howToEarn: "Finish the water cycle lesson." },
} as const;
export type BadgeKey = keyof typeof BADGES;
export const TEACHER_AWARDABLE_BADGES: BadgeKey[] = ["KIND_HELPER", "NEVER_GIVES_UP"];

/* -------------------------------- Results -------------------------------- */

export const MASTERY_TARGET = 0.7;
export const NEEDS_HELP_BELOW = 0.6;

export interface AnswerRecord {
  participantId: string;
  questionIndex: number;
  correct: boolean;
  partial?: boolean;
}

/** Fraction correct per question (partial counts as half). Questions with no answers are null. */
export function percentCorrectByQuestion(answers: AnswerRecord[], questionCount: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let q = 0; q < questionCount; q++) {
    const qa = answers.filter((a) => a.questionIndex === q);
    if (qa.length === 0) {
      out.push(null);
      continue;
    }
    const score = qa.reduce((s, a) => s + (a.correct ? 1 : a.partial ? 0.5 : 0), 0);
    out.push(score / qa.length);
  }
  return out;
}

/** Fraction correct per objective code, given which objective each question covers. */
export function masteryByObjective(
  answers: AnswerRecord[],
  questionObjective: string[],
): Record<string, number> {
  const totals: Record<string, { score: number; n: number }> = {};
  for (const a of answers) {
    const code = questionObjective[a.questionIndex];
    if (!code) continue;
    totals[code] ??= { score: 0, n: 0 };
    totals[code].score += a.correct ? 1 : a.partial ? 0.5 : 0;
    totals[code].n += 1;
  }
  return Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v.n ? v.score / v.n : 0]));
}

export function studentScore(answers: AnswerRecord[], participantId: string, questionCount: number): number {
  const mine = answers.filter((a) => a.participantId === participantId);
  if (questionCount <= 0) return 0;
  const score = mine.reduce((s, a) => s + (a.correct ? 1 : a.partial ? 0.5 : 0), 0);
  return score / questionCount;
}

/* ------------------------------- Join codes ------------------------------ */

/** 6-digit join code shown as "482 913". Randomness is injected so it stays testable. */
export function formatJoinCode(code: string): string {
  const digits = code.replace(/\D/g, "");
  return digits.length === 6 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
}

export function normalizeJoinCode(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  return digits.length === 6 ? digits : null;
}

/** First name + initial only, for student devices and anything children see. */
export function childSafeName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Student";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

function clampInt(n: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(Number.isFinite(n) ? n : 0), min), max);
}
