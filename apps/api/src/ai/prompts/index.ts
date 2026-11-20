import type { ResourceKind } from "@helpo/shared";
import * as cards from "./cards.v1";
import * as game from "./game.v1";
import * as quiz from "./quiz.v1";
import * as slides from "./slides.v1";
import * as worksheet from "./worksheet.v1";

export { cards, game, quiz, slides, worksheet };
export * as analysis from "./analysis.v1";

export const PROMPT_VERSIONS: Record<ResourceKind, string> = {
  CARDS: cards.version,
  WORKSHEET: worksheet.version,
  SLIDES: slides.version,
  QUIZ: quiz.version,
  GAME: game.version,
};

/** Per-kind task text (prompt files are versioned: change the text, bump the version). */
export function taskFor(kind: ResourceKind, o: { quizCount?: number; difficulty?: string; suggestedGame?: string }): string {
  switch (kind) {
    case "CARDS":
      return cards.instructions();
    case "WORKSHEET":
      return worksheet.instructions();
    case "SLIDES":
      return slides.instructions();
    case "QUIZ":
      return quiz.instructions(o.quizCount, o.difficulty);
    case "GAME":
      return game.instructions(o.suggestedGame ?? "matching");
  }
}
