import type { ClassDetail, GameContent, LessonDetail, LessonSummary, ResourceView, ResultsView, SessionTeacherView } from "@helpo/shared";

const now = "2026-11-20T10:00:00.000Z";

export const slidesContent = {
  deckTitle: "Photosynthesis",
  slides: [
    { layout: "title", title: "Photosynthesis", bullets: ["How plants make food"], speakerNotes: "Welcome.", imagePrompt: null, emoji: "x", objectiveCodes: ["O1"] },
    { layout: "bullets", title: "What plants need", bullets: ["Sunlight", "Water"], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: ["O1"] },
    { layout: "twoColumn", title: "Two", bullets: ["a", "b", "c", "d"], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: [] },
    { layout: "definition", title: "Chlorophyll", bullets: ["Green part.", "More."], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: [] },
    { layout: "process", title: "Steps", bullets: ["One", "Two"], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: [] },
    { layout: "quizBreak", title: "Quick quiz", bullets: [], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: [] },
    { layout: "summary", title: "Remember", bullets: ["Light", "Water"], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: [] },
  ],
};

export const worksheetContent = {
  title: "Worksheet",
  instructions: "Answer each question.",
  totalPoints: 6,
  sections: [
    { type: "mcq", heading: "Choose", level: "core", objectiveCode: "O1", items: [{ prompt: "What do plants need?", options: ["Light", "Candy"], answer: "Light", points: 2 }] },
    { type: "fill", heading: "Fill", level: "support", objectiveCode: "O2", items: [{ prompt: "Roots take in ____.", options: null, answer: "water", points: 2 }] },
  ],
};

export const quizContent = {
  questions: [
    { id: "Q1", type: "mcq", prompt: "Which part catches light?", options: [{ text: "Leaf", correct: true }, { text: "Root", correct: false }], acceptedAnswers: null, pairs: null, explanation: "Leaves.", concept: "c", objectiveCode: "O1", difficulty: "easy", timeLimitSec: 30 },
    { id: "Q2", type: "short", prompt: "What is chlorophyll?", options: null, acceptedAnswers: ["green pigment"], pairs: null, explanation: "", concept: "c", objectiveCode: "O1", difficulty: "medium", timeLimitSec: 30 },
    { id: "Q3", type: "matching", prompt: "Match", options: null, acceptedAnswers: null, pairs: [{ left: "Root", right: "Water" }], explanation: "", concept: "c", objectiveCode: "O1", difficulty: "hard", timeLimitSec: 30 },
  ],
};

const pairs = [["Roots", "Take in water"], ["Leaf", "Makes food"], ["Stem", "Carries water"], ["Flower", "Makes seeds"], ["Seed", "New plant"], ["Sun", "Energy"]].map(([left, right]) => ({ left, right }));

export const gameContent: GameContent = {
  type: "matching",
  title: "Plant parts",
  instructions: "Match each part.",
  timeLimitSec: 60,
  pairs,
  gridSize: 12,
  sortBaskets: { yes: "Plants need", no: "Plants do not need" },
  sortItems: [["Sunlight", true], ["Water", true], ["Candy", false], ["Plastic", false]].map(([label, belongsInYes]) => ({ label: label as string, belongsInYes: belongsInYes as boolean })),
  equationTiles: ["carbon dioxide", "+", "water", "->", "glucose", "+", "oxygen"],
  statements: [{ text: "Plants make food.", isTrue: true, explanation: "With light." }, { text: "Roots make seeds.", isTrue: false, explanation: "Flowers do." }, { text: "Leaves catch light.", isTrue: true, explanation: "Yes." }, { text: "Plants eat soil.", isTrue: false, explanation: "No." }, { text: "Stems carry water.", isTrue: true, explanation: "Yes." }],
};

export const cardsContent = { cards: [1, 2, 3].map((i) => ({ front: `Term ${i}`, back: `Meaning ${i}`, emoji: "x", tag: "concept", concept: "c", objectiveCode: "O1" })) };

export const resource = (kind: ResourceView["kind"], content: unknown, extra: Partial<ResourceView> = {}): ResourceView =>
  ({ id: `r-${kind}`, kind, status: "READY", error: null, content, contentLocale: "en", translations: { en: "ready", ar: "ready" }, updatedAt: now, version: 1, progress: 100, promptVersion: "v1", model: "m", tokensIn: 1, tokensOut: 1, ...extra }) as ResourceView;

export const lesson = (extra: Partial<LessonDetail> = {}): LessonDetail =>
  ({
    id: "l1",
    classId: "c1",
    className: "6B",
    title: "Photosynthesis",
    unitTitle: null,
    lessonNumber: 4,
    status: "READY",
    openChecks: 1,
    createdAt: now,
    averageScore: 0.7,
    durationMin: 45,
    language: "English",
    standard: null,
    objectives: [],
    sourceFileName: "plants.pdf",
    sourceChars: 5000,
    band: "NAVIGATOR",
    grade: 6,
    resources: [resource("SLIDES", slidesContent), resource("WORKSHEET", worksheetContent), resource("QUIZ", quizContent), resource("GAME", gameContent), resource("CARDS", cardsContent)],
    checks: [{ id: "k1", resource: "QUIZ", itemRef: "Q1", kind: "FACT_CHECK", message: "Check the key.", suggestion: "Better text", sourcePage: 3, status: "OPEN" }],
    trace: { traced: 9, total: 10 },
    generation: { startedAt: now, finishedAt: now, seconds: 30 },
    blueprint: { title: "P", subject: "Science", gradeLevel: "Grade 6", language: "en", summary: "A summary.", standard: null, objectives: [{ code: "O1", text: "Understand.", bloom: "understand", sourcePage: 1 }], keyConcepts: [{ name: "Chlorophyll", definition: "Green.", sourcePage: 1 }], vocabulary: [{ term: "Glucose", meaning: "Sugar" }], processes: [], relations: [], commonMisconceptions: ["Plants eat soil"], difficulty: "medium", suggestedGameType: "matching" },
    prompt: null,
    aiWritten: false,
    detectedLanguage: "en",
    tokenCount: 100,
    approvedAt: null,
    quota: { used: 3, limit: 100 },
    source: null,
    contentLocale: "en",
    translations: { en: "ready", ar: "ready" },
    ...extra,
  }) as LessonDetail;

export const summaries: LessonSummary[] = ["Photosynthesis", "Water cycle", "Food chains", "Fractions", "Solar system", "Matter"].map((title, i) => ({
  id: `l${i + 1}`,
  classId: "c1",
  className: "6B",
  title,
  unitTitle: null,
  lessonNumber: i + 1,
  status: i === 2 ? "GENERATING" : "READY",
  openChecks: 0,
  createdAt: new Date(Date.UTC(2026, 10, 20 - i * 3)).toISOString(),
  averageScore: i % 2 ? 0.8 : null,
}));

export const classDetail: ClassDetail = {
  id: "c1",
  name: "6B",
  grade: 6,
  subject: "Science",
  band: "NAVIGATOR",
  studentCount: 2,
  settings: { pointsEnabled: true, teamsEnabled: false, soundsEnabled: false, celebrationsEnabled: true, weeklyGoalXp: 500 },
  students: [
    { id: "s1", displayName: "Sara A.", fullName: "Sara Ahmed", xp: 10, level: 1, streakDays: 1, badges: [] },
    { id: "s2", displayName: "Omar K.", fullName: "Omar Kacem", xp: 10, level: 1, streakDays: 1, badges: [] },
  ],
  weekXp: 100,
  lessons: summaries,
};

export const results: ResultsView = {
  lessonId: "l1",
  sessionId: "se1",
  answered: 22,
  classSize: 24,
  average: 0.74,
  mastery: [{ code: "O1", text: "Understand", bloom: "understand", value: 0.58 }, { code: "O2", text: "Remember", bloom: "remember", value: 0.85 }, { code: "O3", text: "Apply", bloom: "apply", value: 0.65 }],
  questions: [0, 1, 2].map((i) => ({ index: i, id: `Q${i + 1}`, prompt: `Question ${i + 1}`, objectiveCode: "O1", percent: 0.5 + i * 0.2 })),
  misconception: { questionIndex: 0, prompt: "x", percent: 0.4, note: "9 students chose True." },
  grid: [{ participantId: "p1", name: "Sara A.", score: 0.8, cells: ["correct", "wrong", "partial"] }, { participantId: "p2", name: "Omar K.", score: 0.3, cells: ["none", "wrong", "correct"] }],
  needsHelp: [{ participantId: "p2", studentId: "s2", name: "Omar K.", score: 0.3, missed: ["Q2"] }],
  notSubmitted: [{ studentId: "s3", name: "Mia L." }],
  gameInsights: [{ game: "MATCH", plays: 20, averageStars: 2.4 }],
  classGoal: { goalXp: 500, earnedXp: 380 },
  averageTimeSec: 600,
  ranking: [{ name: "Sara A.", score: 0.8 }],
  sessions: [{ id: "S1", type: "LIVE_QUIZ", createdAt: "2026-11-20T10:00:00.000Z", answered: 22 }],
};

export const session = (extra: Partial<SessionTeacherView> = {}): SessionTeacherView =>
  ({
    id: "se1",
    link: "http://localhost/join?code=482913",
    qrSvg: '<svg viewBox="0 0 10 10"></svg>',
    isOpen: true,
    expiresAt: "2026-11-21T10:00:00.000Z",
    leaderboard: "TEAMS",
    lessonId: "l1",
    type: "LIVE_QUIZ",
    game: null,
    status: "LOBBY",
    joinCode: "482913",
    namesHidden: true,
    currentQuestion: 0,
    questionCount: 3,
    revealed: false,
    joined: 4,
    classSize: 24,
    answeredCurrent: 2,
    notAnswered: ["Sara A."],
    question: { prompt: "Which part catches light?", options: ["Leaf", "Root"], type: "mcq" },
    distribution: null,
    ...extra,
  }) as SessionTeacherView;
