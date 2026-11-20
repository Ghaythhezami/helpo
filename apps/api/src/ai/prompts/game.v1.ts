export const version = "game.v1";

/** 7.5 Mini-game JSON spec, filled completely so every template can play it. */
export const instructions = (suggested: string): string =>
  `Create the game content. type is "${suggested}" (the template to play first). Fill EVERY field so all templates can use it: ` +
  "pairs (6 to 8 term/meaning pairs, for matching and memory), gridSize (number of memory cards, e.g. 12), sortBaskets (two categories) with sortItems (6 to 10 items, a mix of belongsInYes true and false), " +
  "equationTiles (4 to 8 steps of the main process in the correct order), statements (6 to 10 true/false statements with isTrue and a short explanation), a title, short child-friendly instructions and timeLimitSec (null for younger classes).";
