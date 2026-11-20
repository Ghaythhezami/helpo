export const version = "worksheet.v1";

/** 7.2 Worksheet with an answer key per item. */
export const instructions = (): string =>
  "Create a worksheet: a title, short instructions and 3 to 5 sections. Each section has a type (mcq, tf, fill, short or matching), a heading, a level (support, core or stretch) and an objectiveCode. " +
  "Each item has a prompt, options (mcq options or the matching right-hand column, otherwise null), the answer (the answer key entry), and points. " +
  "Go from recall to application across the sections; give at least one section per level. At least 8 items in total. totalPoints is the sum of all points. " +
  "Introduce a term only after the lesson would have taught it.";
