import {
  AnswerBody,
  BlueprintSchema,
  ChangeRequestBody,
  CreateClassBody,
  CreateLessonBody,
  ExportQuery,
  GameResultBody,
  GenerateBody,
  JoinBody,
  PlaySubmitBody,
  QuizContentSchema,
  RefinePromptBody,
  ShareBody,
  TranslateLessonBody,
  UpdateLocaleBody,
} from "./schemas";

describe("API bodies", () => {
  it("classes: grade 2-12, subject default", () => {
    expect(CreateClassBody.parse({ name: "6B", grade: 6 }).subject).toBe("Science");
    expect(CreateClassBody.safeParse({ name: "6B", grade: 13 }).success).toBe(false);
    expect(CreateClassBody.safeParse({ name: " ", grade: 6 }).success).toBe(false);
  });

  it("lesson creation: multipart strings are coerced, resources may be a comma string, prompt is 10-4000 chars", () => {
    const b = CreateLessonBody.parse({ classId: "c1", durationMin: "30", resources: "QUIZ,CARDS", quizCount: "8", lessonNumber: "2" });
    expect(b).toMatchObject({ durationMin: 30, resources: ["QUIZ", "CARDS"], quizCount: 8, lessonNumber: 2, autoGenerate: true, reuse: true });
    expect(CreateLessonBody.safeParse({ classId: "c1", prompt: "short" }).success).toBe(false);
    expect(CreateLessonBody.safeParse({ classId: "c1", prompt: "x".repeat(4001) }).success).toBe(false);
    expect(CreateLessonBody.safeParse({ classId: "c1", pageRange: "12-40" }).success).toBe(true);
    expect(CreateLessonBody.safeParse({ classId: "c1", pageRange: "abc" }).success).toBe(false);
    expect(CreateLessonBody.safeParse({ classId: "c1", quizCount: 4 }).success).toBe(false);
  });

  it("generate, share, submit, refine, export, translate, locale", () => {
    expect(GenerateBody.parse({})).toMatchObject({ quizCount: 10 });
    expect(GenerateBody.parse({}).resources).toHaveLength(5);
    expect(ShareBody.parse({ mode: "LIVE_QUIZ" })).toMatchObject({ expiresInHours: 24, leaderboard: "TEAMS", approveAnyway: false });
    expect(ShareBody.safeParse({ mode: "CHAT" }).success).toBe(false);
    expect(PlaySubmitBody.safeParse({ answers: [{ questionId: "Q1", optionIndex: 2 }], durationSec: 30 }).success).toBe(true);
    expect(PlaySubmitBody.safeParse({ answers: [], durationSec: -1 }).success).toBe(false);
    expect(RefinePromptBody.safeParse({ prompt: "photosynthesis lesson" }).success).toBe(true);
    expect(RefinePromptBody.safeParse({ prompt: "short" }).success).toBe(false);
    expect(ExportQuery.safeParse({ format: "pdf" }).success).toBe(true);
    expect(ExportQuery.safeParse({ format: "xls" }).success).toBe(false);
    expect(TranslateLessonBody.parse({ to: "ar" }).to).toBe("ar");
    expect(UpdateLocaleBody.safeParse({ locale: "fr" }).success).toBe(false);
    expect(ChangeRequestBody.safeParse({ request: "ok" }).success).toBe(false);
  });

  it("student bodies are bounded", () => {
    expect(JoinBody.safeParse({}).success).toBe(false);
    expect(JoinBody.safeParse({ code: "123456" }).success).toBe(true);
    expect(AnswerBody.safeParse({ questionIndex: 0, optionIndex: 3 }).success).toBe(true);
    expect(AnswerBody.safeParse({ questionIndex: 500 }).success).toBe(false);
    expect(GameResultBody.safeParse({ lessonId: "l", game: "MEMORY", total: 6, firstTryCorrect: 6, retriedCorrect: 0 }).success).toBe(true);
    expect(GameResultBody.safeParse({ lessonId: "l", game: "CHESS", total: 6, firstTryCorrect: 6, retriedCorrect: 0 }).success).toBe(false);
  });
});

describe("AI content schemas", () => {
  it("quiz questions carry options with flags, accepted answers and difficulty", () => {
    const q = { id: "Q1", type: "mcq", prompt: "p", options: [{ text: "a", correct: true }, { text: "b", correct: false }], acceptedAnswers: null, pairs: null, explanation: "e", concept: "c", objectiveCode: "O1", difficulty: "easy", timeLimitSec: 30 };
    expect(QuizContentSchema.safeParse({ questions: [q] }).success).toBe(true);
    expect(QuizContentSchema.safeParse({ questions: [{ ...q, difficulty: "impossible" }] }).success).toBe(false);
    expect(QuizContentSchema.safeParse({ questions: [{ ...q, options: ["a", "b"] }] }).success).toBe(false);
  });

  it("the blueprint has spec fields (string grade level, ISO language, concept objects)", () => {
    const bp = {
      title: "t", subject: "Science", gradeLevel: "Grade 6", language: "en", summary: "s", standard: null,
      objectives: [{ code: "O1", text: "t", bloom: "remember", sourcePage: 1 }],
      keyConcepts: [{ name: "n", definition: "d", sourcePage: null }], vocabulary: [{ term: "t", meaning: "m" }],
      processes: [{ name: "p", steps: ["a"] }], relations: [{ left: "l", right: "r" }], commonMisconceptions: ["x"],
      difficulty: "easy", suggestedGameType: "matching",
    };
    expect(BlueprintSchema.safeParse(bp).success).toBe(true);
    expect(BlueprintSchema.safeParse({ ...bp, suggestedGameType: "chess" }).success).toBe(false);
    expect(BlueprintSchema.safeParse({ ...bp, gradeLevel: 6 }).success).toBe(false);
  });
});
