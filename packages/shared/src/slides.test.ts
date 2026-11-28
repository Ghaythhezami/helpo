import { migrateSlide, migrateSlides } from "./slides";
import type { SlidesContent } from "./schemas";

const v1 = (layout: string, title: string, bullets: string[]) => ({ layout, title, bullets, speakerNotes: "n", imagePrompt: null, emoji: "x", objectiveCodes: ["O1"] });

describe("migrateSlides", () => {
  it("lifts v1 text into the v2 fields per layout", () => {
    expect(migrateSlide(v1("title", "T", ["Grade 6", "45 min"])).subtitle).toBe("Grade 6");
    const d = migrateSlide(v1("definition", "Stomata", ["tiny holes", "page 4"]));
    expect([d.term, d.definition, d.example]).toEqual(["Stomata", "tiny holes", "page 4"]);
    expect(migrateSlide(v1("quizBreak", "Think", ["Why?"])).question).toBe("Why?");
    expect(migrateSlide(v1("summary", "S", ["a", "b", "c", "d"])).takeaways).toEqual(["a", "b", "c"]);
    expect(migrateSlide(v1("process", "P", ["x", "y"])).steps).toEqual([
      { title: "1", detail: "x" },
      { title: "2", detail: "y" },
    ]);
    const c = migrateSlide(v1("twoColumn", "C", ["a", "b", "c"]));
    expect(c.columns?.map((x) => x.points)).toEqual([["a", "b"], ["c"]]);
    expect(migrateSlide(v1("twoColumn", "C", ["a"])).columns).toBeNull();
    const b = migrateSlide(v1("bullets", "B", ["a"]));
    expect(b.bullets).toEqual(["a"]);
    expect(b.keyIdea).toBeNull();
  });
  it("is idempotent for v2 slides and fills gaps", () => {
    const once = migrateSlide(v1("definition", "T", ["d"]));
    expect(migrateSlide(once)).toEqual(once);
    const junk = migrateSlide({ layout: "summary", takeaways: ["a", 3], answerIndex: "x", subtitle: "  " });
    expect(junk.takeaways).toEqual(["a"]);
    expect(junk.answerIndex).toBeNull();
    expect(junk.subtitle).toBeNull();
    expect(junk.title).toBe("");
    expect(migrateSlide(null).layout).toBe("bullets");
  });
  it("migrates a deck and leaves non-decks alone", () => {
    const deck = migrateSlides({ deckTitle: "D", slides: [v1("title", "T", ["g"])] }) as SlidesContent;
    expect(deck.slides[0].subtitle).toBe("g");
    expect(migrateSlides(null)).toBeNull();
    expect(migrateSlides({ nope: 1 })).toEqual({ nope: 1 });
    expect((migrateSlides({ slides: [] }) as SlidesContent).deckTitle).toBe("");
  });
});
