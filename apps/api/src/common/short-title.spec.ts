import { shortTitle } from "./short-title";

describe("shortTitle: the provisional title names the topic, never the class metadata", () => {
  it("production bug: a Grade/Science header clause is skipped, the clause after 'lesson on' wins", () => {
    expect(shortTitle("Grade 11 Science, 45-minute lesson on cyber security measures. Key concepts: phishing, passwords, malware")).toBe("Cyber security measures");
    expect(shortTitle("Grade 11 Science, 45-minute lesson on cyber security measures")).toBe("Cyber security measures");
    expect(shortTitle("Grade 3, 40 minute lesson about staying safe online. Key concepts: strangers, passwords")).toBe("Staying safe online");
  });

  it("skips grade, year, subject and duration clauses in any order", () => {
    expect(shortTitle("Year 7, Geography, 50 minutes, volcanoes and earthquakes")).toBe("Volcanoes and earthquakes");
    expect(shortTitle("45 minutes, Grade 5 Science, the water cycle")).toBe("The water cycle");
    expect(shortTitle("Science, grade 8: electric circuits")).toBe("Electric circuits");
    expect(shortTitle("Grade 6 students: fractions on a number line")).toBe("Fractions on a number line");
    expect(shortTitle("A 1 hour class on Roman roads")).toBe("Roman roads");
  });

  it("prefers the value after Topic: / on / about", () => {
    expect(shortTitle("Subject: Science, Topic: cyber security, Grade 11")).toBe("Cyber security");
    expect(shortTitle("Grade 9 Biology, a lesson about the human heart")).toBe("The human heart");
    expect(shortTitle("Grade 4 English. Lesson on: similes and metaphors, 30 minutes")).toBe("Similes and metaphors");
  });

  it("keeps a topic that merely starts with a grade", () => {
    expect(shortTitle("Grade 3 cyber safety lesson, 30 minutes")).toBe("Cyber safety lesson");
    expect(shortTitle("Year 9 algebra: solving equations")).toBe("Algebra");
  });

  it("keeps the older behaviours", () => {
    expect(shortTitle("Lesson on: Photosynthesis for grade 6, 45 minutes, focus on vocabulary")).toBe("Photosynthesis for grade 6");
    expect(shortTitle("Lesson brief: Volcanoes for Grade 7 (science)")).toBe("Volcanoes for Grade 7 (science)");
    expect(shortTitle("Topic: Volcanoes. Grade: 7. Subject: Science")).toBe("Volcanoes");
    expect(shortTitle("Subject: Fractions, grade 5")).toBe("Fractions");
    expect(shortTitle("please teach fractions to kids")).toBe("Fractions to kids");
    expect(shortTitle("Lesson on: ")).toBe("New lesson");
  });

  it("falls back to the first clause when everything looks like metadata, and caps at 60 characters at a word boundary", () => {
    expect(shortTitle("Grade 11 Science, 45 minutes")).toBe("Grade 11 Science");
    const long = shortTitle(`Lesson on ${"photosynthesis ".repeat(10)}`);
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith(" ")).toBe(false);
    expect(shortTitle("x".repeat(80)).length).toBe(60);
  });
});
