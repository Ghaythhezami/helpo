import { gamePoints } from "@helpo/shared";

/** What every game reports when it ends (posted as the body of POST /play/games/result). */
export interface GameResult {
  total: number;
  firstTryCorrect: number;
  retriedCorrect: number;
  wrongTries: number;
  hintsUsed: number;
}

/** Live estimate of the game's points (out of 100). Explorers never see or lose points for tries and hints. */
export function livePoints(r: GameResult, explorer: boolean): number {
  return gamePoints({
    weight: 100,
    total: r.total,
    firstTryCorrect: r.firstTryCorrect,
    retriedCorrect: r.retriedCorrect,
    wrongTries: explorer ? 0 : r.wrongTries,
    hintsUsed: explorer ? 0 : r.hintsUsed,
  });
}
