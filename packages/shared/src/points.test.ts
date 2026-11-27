import { CURRICULA, GAME_KINDS, GAME_TEMPLATES, gamePoints, playableTemplates, splitGamePoints } from "./domain";

describe("game points", () => {
  it("shares 100 points among the published games", () => {
    expect(splitGamePoints(["SORT", "MATCH", "EQUATION", "MEMORY", "TRUE_FALSE"]).map((g) => g.points)).toEqual([20, 20, 20, 20, 20]);
    expect(splitGamePoints(["SORT", "MATCH", "EQUATION", "MEMORY"]).map((g) => g.points)).toEqual([25, 25, 25, 25]);
    expect(splitGamePoints(["SORT", "MATCH", "EQUATION"]).map((g) => g.points)).toEqual([34, 33, 33]);
    expect(splitGamePoints(["SORT", "SORT"])).toEqual([{ game: "SORT", points: 100 }]);
    expect(splitGamePoints([])).toEqual([]);
  });

  it("scores accuracy against the game's weight, minus wrong tries and hints, never below zero or above the weight", () => {
    expect(gamePoints({ weight: 25, total: 10, firstTryCorrect: 10, retriedCorrect: 0 })).toBe(25);
    expect(gamePoints({ weight: 25, total: 10, firstTryCorrect: 6, retriedCorrect: 4 })).toBe(20);
    expect(gamePoints({ weight: 25, total: 10, firstTryCorrect: 10, retriedCorrect: 0, wrongTries: 3 })).toBe(22);
    expect(gamePoints({ weight: 25, total: 10, firstTryCorrect: 10, retriedCorrect: 0, hintsUsed: 1 })).toBe(20);
    expect(gamePoints({ weight: 25, total: 10, firstTryCorrect: 1, retriedCorrect: 0, wrongTries: 50, hintsUsed: 9 })).toBe(0);
    expect(gamePoints({ weight: 0, total: 10, firstTryCorrect: 10, retriedCorrect: 0 })).toBe(0);
  });
});

describe("odd one out and curriculum", () => {
  it("adds the odd-one-out template and orders thinking games first", () => {
    expect(GAME_TEMPLATES.ODD_ONE_OUT.uses).toEqual(["oddOneOut"]);
    expect(GAME_KINDS.slice(0, 3)).toEqual(["SORT", "EQUATION", "ODD_ONE_OUT"]);
    expect(GAME_KINDS.at(-1)).toBe("MEMORY");
  });
  it("offers odd one out only when the content has enough rounds", () => {
    const base = { pairs: [], sortItems: [], equationTiles: [], statements: [] };
    expect(playableTemplates({ ...base, oddOneOut: [1, 2, 3, 4] }, "NAVIGATOR")).toContain("ODD_ONE_OUT");
    expect(playableTemplates({ ...base, oddOneOut: [1, 2] }, "NAVIGATOR")).not.toContain("ODD_ONE_OUT");
  });
  it("lists the curricula from the meeting plus General", () => {
    expect(CURRICULA).toEqual(["GENERAL", "AMERICAN", "BRITISH", "EGYPTIAN", "TUNISIAN"]);
  });
});
