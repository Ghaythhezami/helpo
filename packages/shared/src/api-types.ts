import type {
  Locale, Band, Curriculum, CheckKind, CheckStatus, GameKind, LessonStatus, ResourceKind, ResourceStatus, SessionStatus, SessionType, BadgeKey,
} from "./domain.js";
import type { Blueprint, LessonBlueprint, CardsContent, GameContent, Objective, QuizContent, SlidesContent, WorksheetContent, ReteachPlan } from "./schemas.js";

/** RFC 9457 problem details returned on every error. */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  errors?: { path: string; message: string }[];
}

/**
 * i18n contract: the API reads the locale from the `x-helpo-locale` header (or `helpo_locale` cookie) and
 * returns every translatable text in that language, falling back to the other one. `contentLocale` tells
 * which language the returned text is actually in, and `translations` which languages exist in the database.
 */
export type TranslationState = "missing" | "working" | "ready";
export type Translations = Record<Locale, TranslationState>;

export interface Me {
  id: string;
  name: string;
  email: string;
  locale: Locale;
  role: UserRole;
  school: { id: string; name: string; slug: string } | null;
}

/** TEACHER is the default. ADMIN also sees /admin (platform overview) and the queue board. */
export type UserRole = "TEACHER" | "ADMIN";

/* ------------------------------ Demo access ------------------------------
 * Pre-configured accounts so a reviewer can test without typing credentials. Enabled by DEMO_LOGIN=true on the API.
 * Teacher and admin are real accounts (password from DEMO_PASSWORD); the student signs in with the student cookie
 * (students never have passwords) and lands in a seeded open activity.
 */
export type DemoAccountKey = "teacher" | "student" | "admin";

export interface DemoAccount {
  key: DemoAccountKey;
  label: string;
  labelAr: string;
  description: string;
  descriptionAr: string;
  email: string | null; // null for the student (no password login)
  next: string; // where the web app goes after signing in
}

export interface DemoLoginResult {
  account: DemoAccountKey;
  next: string;
}

/** GET /api/admin/overview (ADMIN only): platform-wide numbers, never student personal data beyond display names. */
export interface AdminOverview {
  totals: { schools: number; teachers: number; classes: number; students: number; lessons: number; sessions: number; answers: number };
  lessonsByStatus: Record<string, number>;
  ai: { resources: number; tokensIn: number; tokensOut: number; byModel: { model: string; resources: number; tokensIn: number; tokensOut: number }[] };
  recentLessons: { id: string; title: string; teacherName: string; status: string; createdAt: string }[];
  recentSessions: { id: string; type: string; joinCode: string; status: string; joined: number; createdAt: string }[];
  runtime: { queueDriver: string; realtime: string; aiMode: "claude" | "demo"; demoLogin: boolean };
}

export interface ClassSummary {
  id: string;
  name: string;
  grade: number;
  subject: string;
  band: Band;
  studentCount: number;
}

export interface ClassSettings {
  pointsEnabled: boolean;
  teamsEnabled: boolean;
  soundsEnabled: boolean;
  celebrationsEnabled: boolean;
  weeklyGoalXp: number;
}

export interface StudentSummary {
  id: string;
  displayName: string; // first name + initial
  fullName: string; // teacher-only
  xp: number;
  level: number;
  streakDays: number;
  badges: BadgeKey[];
}

export interface ClassDetail extends ClassSummary {
  settings: ClassSettings;
  students: StudentSummary[];
  weekXp: number; // shared class goal progress this week
  lessons: LessonSummary[];
}

export interface LessonSummary {
  id: string;
  classId: string;
  className: string;
  title: string;
  unitTitle: string | null;
  lessonNumber: number | null;
  status: LessonStatus;
  openChecks: number;
  createdAt: string;
  averageScore: number | null; // 0..1 from the latest finished session
}

export interface ResourceView {
  id: string;
  kind: ResourceKind;
  status: ResourceStatus;
  error: string | null;
  content: SlidesContent | WorksheetContent | QuizContent | GameContent | CardsContent | null;
  contentLocale: Locale | null; // language of `content` (may be the fallback language)
  translations: Translations;
  updatedAt: string;
  version: number; // teacher edits create versions; 1 = AI original
  progress: number; // 0–100 while WORKING
  promptVersion: string | null; // e.g. "quiz.v1"
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
}

export interface CheckView {
  id: string;
  resource: ResourceKind;
  itemRef: string;
  kind: CheckKind;
  message: string;
  suggestion: string | null;
  sourcePage: number | null;
  status: CheckStatus;
}

export interface LessonDetail extends LessonSummary {
  durationMin: number;
  language: string;
  standard: string | null;
  objectives: Objective[];
  sourceFileName: string | null;
  sourceChars: number;
  band: Band;
  grade: number;
  resources: ResourceView[];
  checks: CheckView[];
  trace: { traced: number; total: number } | null;
  generation: { startedAt: string | null; finishedAt: string | null; seconds: number | null };
  blueprint: Blueprint | null; // result of the single analysis call
  prompt: string | null; // teacher instructions / topic
  aiWritten: boolean; // prompt-only lesson: content is AI-written, please review
  detectedLanguage: string | null; // ISO code detected from the document
  tokenCount: number | null;
  approvedAt: string | null; // teacher approval before sharing
  quota: { used: number; limit: number }; // monthly lesson quota
  source: { fileName: string | null; type: string | null; pages: number | null; chars: number; detectedLocale: Locale | null; sha256: string | null } | null;
  contentLocale: Locale; // language the kit was generated in first
  curriculum: Curriculum;
  translations: Translations; // whole-lesson translation state per language
}

export interface DashboardView {
  teacherName: string;
  schoolName: string | null;
  today: string; // ISO date
  nextLesson: LessonSummary | null;
  classes: ClassSummary[];
  recentLessons: LessonSummary[];
  classQuest: { classId: string; className: string; goalXp: number; earnedXp: number } | null;
  kitCheckStreak: number;
  weekRecap: { kitsMade: number; liveQuizzes: number; xpEarned: number };
}

export interface SessionTeacherView {
  id: string;
  games: { game: GameKind; points: number }[]; // games published with this share and their share of 100 points
  link: string; // student join URL with the code
  qrSvg: string; // QR code of `link`
  isOpen: boolean;
  expiresAt: string | null;
  leaderboard: "OFF" | "TEAMS" | "INDIVIDUAL";
  lessonId: string;
  type: SessionType;
  game: GameKind | null;
  status: SessionStatus;
  joinCode: string;
  namesHidden: boolean;
  currentQuestion: number;
  questionCount: number;
  revealed: boolean;
  joined: number;
  classSize: number;
  answeredCurrent: number;
  notAnswered: string[]; // display names, teacher only
  question: { prompt: string; options: string[]; type: string } | null;
  distribution: number[] | null; // per option, only after reveal
}

export interface ResultsView {
  lessonId: string;
  sessionId: string | null;
  answered: number;
  classSize: number;
  average: number | null;
  mastery: { code: string; text: string; bloom: string; value: number }[];
  questions: { index: number; id: string; prompt: string; objectiveCode: string; percent: number | null }[];
  misconception: { questionIndex: number; prompt: string; percent: number; note: string } | null;
  grid: { participantId: string; name: string; score: number; cells: ("correct" | "wrong" | "partial" | "none")[] }[];
  needsHelp: { participantId: string; studentId: string | null; name: string; score: number; missed: string[] }[];
  notSubmitted: { studentId: string; name: string }[];
  gameInsights: { game: GameKind; plays: number; averageStars: number }[];
  classGoal: { goalXp: number; earnedXp: number };
  averageTimeSec: number | null;
  ranking: { name: string; score: number }[]; // teacher dashboard only, never sent to students
  /** Every session of the lesson, newest first, so the UI can switch between them. */
  sessions: { id: string; type: SessionType; createdAt: string; answered: number }[];
}

/* ------------------------------ Real-time events (spec section 10) ------------------------------
 * Socket.IO namespace "/" on the API port when REALTIME=socket (long-running host). On serverless hosts the
 * same payloads are read by polling GET /lessons/:id and GET /sessions/:id.
 */
export interface RealtimeEvents {
  "lesson.status": { lessonId: string; status: LessonStatus };
  "resource.progress": { lessonId: string; kind: ResourceKind; percent: number };
  "resource.ready": { lessonId: string; kind: ResourceKind; resourceId: string };
  "resource.failed": { lessonId: string; kind: ResourceKind; resourceId: string; error: string };
  "session.studentJoined": { sessionId: string; name: string; count: number };
  "session.question": { sessionId: string; index: number; timeLimit: number | null };
  "session.answer": { sessionId: string; questionId: string; choice: number | string };
  "session.leaderboard": { sessionId: string; mode: "TEAMS" | "INDIVIDUAL"; rows: { name: string; score: number }[] };
}

/* ------------------------------ Student side ------------------------------ */

export interface JoinOption {
  classId: string;
  className: string;
  grade: number;
  teacherName: string;
  live: { sessionId: string; type: SessionType; game: GameKind | null; lessonTitle: string; joinCode: string } | null;
}

export interface JoinResult {
  participantId: string;
  displayName: string;
  sessionId: string | null;
  next: "quiz" | "game" | "home";
}

export interface StudentHome {
  displayName: string;
  locale: Locale;
  className: string;
  band: Band;
  xp: number;
  level: number;
  levelTitle: string;
  xpIntoLevel: number;
  xpForNextLevel: number;
  streak: { days: number; saversLeft: number; message: string };
  quests: { id: string; title: string; done: number; total: number }[];
  badges: { key: BadgeKey; name: string; howToEarn: string; earned: boolean }[];
  classGoal: { goalXp: number; earnedXp: number };
  live: { sessionId: string; type: SessionType; game: GameKind | null; lessonTitle: string } | null;
  journey: { lessonId: string; title: string; number: number | null; state: "done" | "current" | "locked" }[];
  avatar: { items: string[]; background: string; unlocked: string[] };
  settings: ClassSettings;
}

export interface StudentQuizState {
  sessionId: string;
  status: SessionStatus;
  lessonTitle: string;
  questionIndex: number;
  questionCount: number;
  question: { prompt: string; options: string[]; type: "mcq" | "true_false" | "short" } | null;
  myAnswer: { optionIndex: number | null; text: string | null } | null;
  revealed: { correctIndex: number | null; explanation: string; correct: boolean | null } | null;
}

/** GET /lessons/:id/status: light polling view while generating (no resource content). */
export interface LessonStatusView {
  status: LessonStatus;
  resources: { kind: ResourceKind; status: ResourceStatus; progress: number; error: string | null }[];
  translations: Translations;
  updatedAt: string;
}

export interface StudentGame {
  lessonId: string;
  lessonTitle: string;
  game: GameKind;
  content: GameContent;
  bestStars: number;
  pointsWeight?: number; // this game's share of 100 points in the session (100 in practice)
}

export interface GameResultView {
  stars: number;
  points: number; // this game's points (0..weight), separate from XP
  xp: number;
  personalBest: boolean;
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  badgeUnlocked: { key: BadgeKey; name: string } | null;
  classGoal: { goalXp: number; earnedXp: number };
}

export type { ReteachPlan };

/* ------------------------------ Practice mode ------------------------------
 * Students can practise any READY lesson of their class at any time, without a teacher-opened session:
 * a self-paced practice quiz (server-graded, not counted in class results) and every playable game template.
 * Open sessions (live quiz, assignment) are listed too, so the hub is the student's single entry point.
 */
export interface StudentPractice {
  className: string;
  open: { sessionId: string; type: SessionType; joinCode: string; lessonTitle: string; games?: { game: GameKind; points: number }[] }[];
  lessons: { lessonId: string; title: string; number: number | null; quizQuestions: number; games: GameKind[]; bestStars: number }[];
}

/** GET /api/play/practice/:lessonId/quiz: questions without answers (same shape the self-paced screen uses). */
export interface PracticeQuiz {
  lessonId: string;
  lessonTitle: string;
  questions: { id: string; type: "mcq" | "tf" | "short" | "matching"; prompt: string; options: string[] | null; pairs: { left: string; right: string }[] | null; timeLimitSec: number }[];
}

/** POST /api/play/practice/:lessonId/quiz → graded review; practice XP is small and never enters class results. */
export interface PracticeResult {
  score: number; // 0..1
  correct: number;
  total: number;
  xp: number;
  review: { questionId: string; correct: boolean; explanation: string; correctAnswer: string }[];
}
