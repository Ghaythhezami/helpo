import {
  BADGES,
  GAME_TEMPLATES,
  LIMITS,
  MAX_GRADE,
  MIN_GRADE,
  NEEDS_HELP_BELOW,
  TEACHER_AWARDABLE_BADGES,
  XP_PER_LEVEL,
  XP_RULES,
  bandForGrade,
  childSafeName,
  cleanPrompt,
  daysBetween,
  formatJoinCode,
  isLocale,
  isRtl,
  leaderboardAllowed,
  levelForXp,
  levelTitle,
  masteryByObjective,
  nextStreak,
  normalizeJoinCode,
  otherLocale,
  percentCorrectByQuestion,
  pickLocalized,
  playableTemplates,
  resolveLocale,
  scoreGame,
  studentScore,
  type AnswerRecord,
} from "./domain";

describe("bands", () => {
  it("maps grades 2-12 to Explorer, Navigator and Studio", () => {
    expect([2, 5].map(bandForGrade)).toEqual(["EXPLORER", "EXPLORER"]);
    expect([6, 8].map(bandForGrade)).toEqual(["NAVIGATOR", "NAVIGATOR"]);
    expect([9, 12].map(bandForGrade)).toEqual(["STUDIO", "STUDIO"]);
  });
  it("rejects grades outside 2-12 and non-integers", () => {
    expect(() => bandForGrade(1)).toThrow(RangeError);
    expect(() => bandForGrade(13)).toThrow(RangeError);
    expect(() => bandForGrade(6.5)).toThrow(RangeError);
    expect([MIN_GRADE, MAX_GRADE]).toEqual([2, 12]);
  });
});

describe("levels", () => {
  it("is flat: 500 XP per level, Sara at 3340 XP is level 7 with 340 into it", () => {
    expect(levelForXp(0)).toMatchObject({ level: 1, xpIntoLevel: 0, progress: 0 });
    expect(levelForXp(499).level).toBe(1);
    expect(levelForXp(500).level).toBe(2);
    expect(levelForXp(3340)).toMatchObject({ level: 7, xpIntoLevel: 340, xpForNextLevel: XP_PER_LEVEL });
    expect(levelForXp(3340).progress).toBeCloseTo(0.68);
  });
  it("clamps negatives and fractions; titles stay in range", () => {
    expect(levelForXp(-50).level).toBe(1);
    expect(levelForXp(499.9).level).toBe(1);
    expect(levelTitle(0)).toBe("Seedling");
    expect(levelTitle(7)).toBe("Plant Scout");
    expect(levelTitle(999)).toBe("Master Scientist");
  });
});

describe("scoreGame caps", () => {
  const input = { pairsOrItems: 7, firstTryCorrect: 7, retriedCorrect: 0, previousBestStars: 0 };
  it("a perfect first round earns 3 stars, a personal best and the per-game cap", () => {
    const r = scoreGame(input);
    expect(r).toMatchObject({ stars: 3, personalBest: true });
    expect(r.xp).toBe(XP_RULES.maxPerGame);
  });
  it("retries still finish the round but earn fewer stars and less XP", () => {
    const r = scoreGame({ ...input, firstTryCorrect: 5, retriedCorrect: 2 });
    expect(r.stars).toBe(2);
    expect(r.xp).toBeLessThanOrEqual(XP_RULES.maxPerGame);
    expect(scoreGame({ ...input, firstTryCorrect: 2, retriedCorrect: 5 }).stars).toBe(1);
  });
  it("an unfinished round has no stars, no finish bonus and no personal best", () => {
    const r = scoreGame({ ...input, firstTryCorrect: 3, retriedCorrect: 0 });
    expect(r).toMatchObject({ stars: 0, personalBest: false });
    expect(r.xp).toBe(3 * XP_RULES.answerCorrectFirstTry);
  });
  it("inflated client counts are clamped to the round size", () => {
    const r = scoreGame({ pairsOrItems: 7, firstTryCorrect: 99, retriedCorrect: 99, previousBestStars: 3 });
    expect(r.xp).toBeLessThanOrEqual(XP_RULES.maxPerGame);
    expect(r.personalBest).toBe(false);
    expect(scoreGame({ pairsOrItems: 0, firstTryCorrect: -4, retriedCorrect: NaN, previousBestStars: 0 }).xp).toBe(0);
  });
});

describe("forgiving streaks with savers", () => {
  const base = { days: 4, saversLeft: 1, lastActiveDay: "2026-11-19" };
  it("same day keeps the streak, the next day extends it", () => {
    expect(nextStreak(base, "2026-11-19")).toMatchObject({ days: 4, saversLeft: 1 });
    expect(nextStreak(base, "2026-11-20")).toMatchObject({ days: 5, saversLeft: 1, lastActiveDay: "2026-11-20" });
  });
  it("one missed day is covered by a saver; without a saver the streak restarts kindly", () => {
    const saved = nextStreak(base, "2026-11-21");
    expect(saved).toMatchObject({ days: 5, saversLeft: 0 });
    expect(saved.message).toMatch(/saver/);
    const lost = nextStreak({ ...base, saversLeft: 0 }, "2026-11-21");
    expect(lost).toMatchObject({ days: 1, saversLeft: 0 });
    expect(lost.message).toMatch(/Welcome back/);
    expect(nextStreak(base, "2026-11-25").days).toBe(1);
  });
  it("a first activity starts at 1 and bad dates are refused", () => {
    expect(nextStreak({ days: 0, saversLeft: 1, lastActiveDay: null }, "2026-11-20")).toMatchObject({ days: 1, saversLeft: 1 });
    expect(daysBetween("2026-11-01", "2026-11-04")).toBe(3);
    expect(() => daysBetween("nope", "2026-11-04")).toThrow(RangeError);
  });
});

describe("results and mastery", () => {
  const a = (participantId: string, questionIndex: number, correct: boolean, partial = false): AnswerRecord => ({ participantId, questionIndex, correct, partial });
  const answers = [a("p1", 0, true), a("p1", 1, false), a("p2", 0, true), a("p2", 1, false, true), a("p3", 0, false)];

  it("percent correct per question counts partial as half and leaves unanswered questions null", () => {
    expect(percentCorrectByQuestion(answers, 3)).toEqual([2 / 3, 0.25, null]);
  });
  it("mastery by objective", () => {
    expect(masteryByObjective(answers, ["O1", "O2"])).toEqual({ O1: 2 / 3, O2: 0.25 });
    expect(masteryByObjective([a("p1", 5, true)], ["O1"])).toEqual({});
  });
  it("student score is over the whole quiz", () => {
    expect(studentScore(answers, "p1", 2)).toBe(0.5);
    expect(studentScore(answers, "p2", 2)).toBe(0.75);
    expect(studentScore(answers, "p1", 0)).toBe(0);
    expect(NEEDS_HELP_BELOW).toBe(0.6);
  });
});

describe("join codes and names", () => {
  it("formats and normalizes 6-digit codes", () => {
    expect(formatJoinCode("482913")).toBe("482 913");
    expect(formatJoinCode("12")).toBe("12");
    expect(normalizeJoinCode("482 913")).toBe("482913");
    expect(normalizeJoinCode("48-29-13")).toBe("482913");
    expect(normalizeJoinCode("1234")).toBeNull();
    expect(normalizeJoinCode("1234567")).toBeNull();
  });
  it("childSafeName shows first name and initial only", () => {
    expect(childSafeName("Sara Ahmed")).toBe("Sara A.");
    expect(childSafeName("  ali   ben salah ")).toBe("ali s.".replace("s.", "S."));
    expect(childSafeName("Noah")).toBe("Noah");
    expect(childSafeName("   ")).toBe("Student");
    expect(childSafeName("Mia Lopez-Garcia")).toBe("Mia L.");
  });
});

describe("languages", () => {
  it("pickLocalized falls back to the other language, then null", () => {
    expect(pickLocalized({ en: "Hi", ar: "مرحبا" }, "ar")).toEqual({ value: "مرحبا", locale: "ar", fallback: false });
    expect(pickLocalized({ en: "Hi", ar: null }, "ar")).toEqual({ value: "Hi", locale: "en", fallback: true });
    expect(pickLocalized({ en: "", ar: "مرحبا" }, "en")).toMatchObject({ locale: "ar", fallback: true });
    expect(pickLocalized({ en: undefined, ar: null }, "en")).toEqual({ value: null, locale: null, fallback: false });
  });
  it("resolves, validates and flips locales", () => {
    expect(resolveLocale("ar-TN,en;q=0.8")).toBe("ar");
    expect(resolveLocale("fr")).toBe("en");
    expect(resolveLocale(null)).toBe("en");
    expect(isLocale("ar") && !isLocale("de")).toBe(true);
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("en")).toBe(false);
    expect(otherLocale("en")).toBe("ar");
  });
});

describe("safety and game rules", () => {
  it("children never see an individual ranking by default: Explorer is held to TEAMS", () => {
    expect(leaderboardAllowed("INDIVIDUAL", "EXPLORER")).toBe("TEAMS");
    expect(leaderboardAllowed("INDIVIDUAL", "NAVIGATOR")).toBe("INDIVIDUAL");
    expect(leaderboardAllowed("TEAMS", "EXPLORER")).toBe("TEAMS");
    expect(leaderboardAllowed("OFF", "STUDIO")).toBe("OFF");
  });
  it("cleanPrompt strips control characters but keeps newlines and tabs", () => {
    expect(cleanPrompt("  hi\u0000 there\u0007\n\tline  ")).toBe("hi there\n\tline");
    expect(LIMITS.uploadsPerHour).toBe(10);
  });
  it("playableTemplates needs enough items for the fields a template reads, and suits the band", () => {
    const rich = { pairs: Array(7).fill(0), sortItems: Array(7).fill(0), equationTiles: Array(5).fill(0), statements: Array(6).fill(0) };
    const all = playableTemplates(rich, "NAVIGATOR");
    expect(all).toEqual(expect.arrayContaining(["MATCH", "MEMORY", "SORT", "EQUATION"]));
    expect(playableTemplates(rich, "EXPLORER")).not.toContain("EQUATION");
    expect(playableTemplates({ ...rich, pairs: [], sortItems: [] }, "NAVIGATOR")).toEqual(expect.not.arrayContaining(["MATCH", "MEMORY", "SORT"]));
    expect(Object.keys(GAME_TEMPLATES).length).toBeGreaterThanOrEqual(4);
  });
  it("badges", () => {
    expect(BADGES.PLANT_SCOUT.name).toBe("Plant Scout");
    expect(TEACHER_AWARDABLE_BADGES).toEqual(["KIND_HELPER", "NEVER_GIVES_UP"]);
  });
});
