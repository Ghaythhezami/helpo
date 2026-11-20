import { XP_RULES, type Question } from "@helpo/shared";
import { DAILY_GAME_XP_CAP, badgeForGame, firstAnswerXp, gradeAnswer, neverGivesUpEarned, normalizeAnswer, retryXpDelta, studentType, stripForStudent, unlockedAvatar } from "./grading";

const base = { id: "Q1", prompt: "p", explanation: "e", concept: "c", objectiveCode: "O1", difficulty: "easy" as const, timeLimitSec: 30 };
const mcq: Question = { ...base, type: "mcq", options: ["a", "b", "c", "d"].map((text, i) => ({ text, correct: i === 2 })), acceptedAnswers: null, pairs: null };
const short: Question = { ...base, id: "Q2", type: "short", options: null, acceptedAnswers: ["Plants make their own food using light and water", "photosynthesis"], pairs: null };
const matching: Question = { ...base, id: "Q3", type: "matching", options: null, acceptedAnswers: null, pairs: [{ left: "Roots", right: "take in water" }, { left: "Leaf", right: "makes food" }, { left: "Stem", right: "carries water" }] };

describe("grading", () => {
  it("grades mcq on the server and rejects out-of-range input", () => {
    expect(gradeAnswer(mcq, { optionIndex: 2 })).toEqual({ correct: true, partial: false });
    expect(gradeAnswer(mcq, { optionIndex: 0 })).toEqual({ correct: false, partial: false });
    expect(gradeAnswer(mcq, { optionIndex: 9 })).toBeNull();
    expect(gradeAnswer(mcq, {})).toBeNull();
  });

  it("short answers are matched against acceptedAnswers after normalization", () => {
    expect(gradeAnswer(short, { text: "  PHOTOSYNTHESIS!! " })?.correct).toBe(true);
    expect(gradeAnswer(short, { text: "the Photosynthesis" })?.correct).toBe(true);
    expect(gradeAnswer(short, { text: "plants make their own food using light and water" })?.correct).toBe(true);
    expect(gradeAnswer(short, { text: "plants need light and water" })).toEqual({ correct: false, partial: true });
    expect(gradeAnswer(short, { text: "no idea" })).toEqual({ correct: false, partial: false });
    expect(gradeAnswer(short, { text: "  " })).toBeNull();
    expect(gradeAnswer({ ...short, acceptedAnswers: [] }, { text: "anything" })).toEqual({ correct: false, partial: true });
  });

  it("normalization folds case, accents, punctuation, Arabic diacritics and letter variants", () => {
    expect(normalizeAnswer("Café!")).toBe("cafe");
    expect(normalizeAnswer("The  Sun")).toBe("sun");
    expect(normalizeAnswer("أَكسجين")).toBe(normalizeAnswer("اكسجين"));
    expect(normalizeAnswer("الجلوكوز")).toBe("جلوكوز");
    expect(gradeAnswer({ ...short, acceptedAnswers: ["الأكسجين"] }, { text: "اكسجين" })?.correct).toBe(true);
  });

  it("matching: all pairs right is correct, some is partial, none is wrong", () => {
    const all = matching.pairs!.map((p) => ({ ...p }));
    expect(gradeAnswer(matching, { pairs: all })).toEqual({ correct: true, partial: false });
    expect(gradeAnswer(matching, { pairs: [all[0], { left: "Leaf", right: "carries water" }, { left: "Stem", right: "makes food" }] })).toEqual({ correct: false, partial: true });
    expect(gradeAnswer(matching, { pairs: [{ left: "Roots", right: "makes food" }] })).toEqual({ correct: false, partial: false });
    expect(gradeAnswer(matching, {})).toBeNull();
  });

  it("never leaks correct flags or accepted answers to students", () => {
    const s = stripForStudent(mcq);
    expect(s.options).toEqual(["a", "b", "c", "d"]);
    expect(JSON.stringify(s)).not.toMatch(/correct|acceptedAnswers|explanation/);
    const sh = stripForStudent(short);
    expect(sh.options).toBeNull();
    expect(JSON.stringify(sh)).not.toContain("photosynthesis");
    const m = stripForStudent(matching, () => 0.1);
    expect(m.matching?.lefts).toEqual(["Roots", "Leaf", "Stem"]);
    expect(new Set(m.matching?.rights)).toEqual(new Set(["take in water", "makes food", "carries water"]));
    expect(studentType({ ...mcq, type: "tf" })).toBe("true_false");
    expect(studentType(matching)).toBe("short");
  });

  it("XP: first try 10, attempt 2, retry tops up to 5 and never beyond the cap", () => {
    expect(firstAnswerXp({ correct: true, partial: false })).toBe(XP_RULES.answerCorrectFirstTry);
    expect(firstAnswerXp({ correct: false, partial: false })).toBe(XP_RULES.answerAttempt);
    expect(retryXpDelta(2, true)).toBe(3);
    expect(retryXpDelta(2, false)).toBe(0);
    expect(retryXpDelta(10, true)).toBe(0);
    expect(retryXpDelta(0, true)).toBeLessThanOrEqual(XP_RULES.maxPerQuizQuestion);
  });

  it("badges and avatar unlocks", () => {
    expect(badgeForGame("MATCH", 3)).toBe("PLANT_SCOUT");
    expect(badgeForGame("MATCH", 2)).toBeNull();
    expect(badgeForGame("SORT", 3)).toBeNull();
    expect(neverGivesUpEarned(3, 1)).toBe(false);
    expect(neverGivesUpEarned(3, 2)).toBe(true);
    expect(unlockedAvatar(1)).toEqual(expect.arrayContaining(["scarf", "lavender"]));
    expect(unlockedAvatar(1)).not.toContain("hat");
    expect(unlockedAvatar(7)).toContain("backpack");
    expect(DAILY_GAME_XP_CAP).toBeGreaterThan(XP_RULES.maxPerGame);
  });
});
