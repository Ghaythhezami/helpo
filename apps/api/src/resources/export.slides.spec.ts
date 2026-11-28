import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import type { Slide, SlidesContent } from "@helpo/shared";
import { buildDocx, buildPdf, buildPptx } from "./export.builders";

const base: Slide = {
  layout: "bullets",
  title: "",
  subtitle: null,
  keyIdea: null,
  bullets: [],
  columns: null,
  term: null,
  definition: null,
  example: null,
  steps: null,
  question: null,
  options: null,
  answerIndex: null,
  takeaways: null,
  speakerNotes: "",
  imagePrompt: null,
  emoji: null,
  objectiveCodes: [],
};
const slide = (o: Partial<Slide>): Slide => ({ ...base, ...o });

/** 12 slides, all 7 layouts, 2 quizBreaks (so 14 exported slides). */
function deck(ar: boolean): SlidesContent {
  const w = (en: string, a: string) => (ar ? a : en);
  const long = w("A very long sentence about photosynthesis that keeps going to test that the text shrinks and never overflows its box. ", "جملة طويلة جدا عن التمثيل الضوئي تستمر لاختبار أن النص يصغر ولا يتجاوز مربعه. ").repeat(4);
  return {
    deckTitle: w("Photosynthesis", "التمثيل الضوئي"),
    slides: [
      slide({ layout: "title", title: w("Photosynthesis", "التمثيل الضوئي"), subtitle: w("Grade 6 science", "علوم الصف السادس"), question: w("How do plants make food?", "كيف تصنع النباتات غذاءها؟"), emoji: "🌱", speakerNotes: w("NOTE-title open with a plant", "NOTE-title ابدأ بنبتة") }),
      slide({ layout: "bullets", title: w("Key parts", "الأجزاء"), keyIdea: w("Plants need light, water and air", "تحتاج النباتات الضوء والماء والهواء"), bullets: ["a1", "a2", "a3", "a4", "a5"], emoji: "☀️", speakerNotes: "NOTE-bullets" }),
      slide({ layout: "bullets", title: w("Long text", "نص طويل"), keyIdea: long, bullets: [long, long, long], speakerNotes: "NOTE-long" }),
      slide({ layout: "twoColumn", title: w("Light vs dark", "ضوء وظلام"), keyIdea: w("Two stages", "مرحلتان"), columns: [{ heading: w("Light", "ضوء"), points: ["p1", "p2"] }, { heading: w("Dark", "ظلام"), points: ["p3", "p4"] }], speakerNotes: "NOTE-two" }),
      slide({ layout: "definition", title: w("Chlorophyll", "الكلوروفيل"), term: w("Chlorophyll", "الكلوروفيل"), definition: w("The green pigment that captures light", "الصبغة الخضراء التي تلتقط الضوء"), example: w("Why leaves look green", "لماذا تبدو الأوراق خضراء"), emoji: "🍃", speakerNotes: "NOTE-def" }),
      slide({ layout: "process", title: w("Steps", "الخطوات"), steps: ["one", "two", "three", "four", "five"].map((x) => ({ title: x, detail: `${x} detail` })), speakerNotes: "NOTE-proc5" }),
      slide({ layout: "process", title: w("Short process", "عملية قصيرة"), steps: ["x", "y", "z"].map((x) => ({ title: x, detail: `${x} detail` })), speakerNotes: "NOTE-proc3" }),
      slide({ layout: "quizBreak", title: w("Quick check", "فحص سريع"), question: w("Which gas do plants take in?", "أي غاز تأخذه النباتات؟"), options: ["Oxygen-opt", "CarbonDioxide-opt", "Nitrogen-opt"], answerIndex: 1, keyIdea: w("Plants use CO2 to build sugar", "تستخدم النباتات ثاني أكسيد الكربون"), speakerNotes: "NOTE-quiz1" }),
      slide({ layout: "bullets", title: w("Another", "آخر"), bullets: ["b1"], speakerNotes: "" }),
      slide({ layout: "quizBreak", title: w("Second check", "فحص ثان"), question: "Q2?", options: ["A-opt", "B-opt", "C-opt", "D-opt"], answerIndex: 3, keyIdea: "Because D", speakerNotes: "NOTE-quiz2" }),
      slide({ layout: "summary", title: w("Summary", "الخلاصة"), takeaways: ["t1", "t2", "t3"], question: w("Name one input of photosynthesis.", "اذكر مدخلا واحدا."), speakerNotes: "NOTE-sum" }),
      slide({ layout: "bullets", title: w("Last", "الأخير"), bullets: ["z1", "z2"], speakerNotes: "NOTE-last" }),
    ],
  };
}

const xmlOf = async (zip: JSZip, path: string) => zip.file(path)!.async("string");
const slideXml = (zip: JSZip, n: number) => xmlOf(zip, `ppt/slides/slide${n}.xml`);
const slideFiles = (zip: JSZip) => Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));

describe("slides export", () => {
  it("builds one PPTX slide per slide plus an answer slide per quizBreak", async () => {
    const zip = await JSZip.loadAsync(await buildPptx({ kind: "SLIDES", title: "Photosynthesis", locale: "en", content: deck(false) }));
    expect(slideFiles(zip)).toHaveLength(14);
    const notes = Object.keys(zip.files).filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n));
    expect(notes.length).toBeGreaterThanOrEqual(12);
    const all = (await Promise.all(notes.map((n) => xmlOf(zip, n)))).join("");
    for (const marker of ["NOTE-title", "NOTE-bullets", "NOTE-two", "NOTE-def", "NOTE-proc5", "NOTE-quiz1", "NOTE-sum", "NOTE-last"]) expect(all).toContain(marker);
    expect(all).toContain("Speaker notes");
    expect(all).toContain("Answer: B. CarbonDioxide-opt");
  });

  it("brands the master, sets metadata and keeps the quiz answer off the quiz slide", async () => {
    const zip = await JSZip.loadAsync(await buildPptx({ kind: "SLIDES", title: "Photosynthesis", locale: "en", content: deck(false) }));
    const master = await xmlOf(zip, "ppt/slideMasters/slideMaster1.xml");
    const layouts = (await Promise.all(Object.keys(zip.files).filter((n) => /slideLayouts\/slideLayout\d+\.xml$/.test(n)).map((n) => xmlOf(zip, n)))).join("");
    expect(master + layouts).toContain("Nibras");
    expect(master + layouts).toContain("6035CF");
    expect(master + layouts).toContain("slidenum");
    const core = await xmlOf(zip, "docProps/core.xml");
    expect(core).toContain("<dc:title>Photosynthesis</dc:title>");
    expect(core).toContain("Nibras");
    expect(core).not.toContain("PptxGenJS");
    // slide 8 is the quizBreak, slide 9 its answer slide
    const quiz = await slideXml(zip, 8);
    const answer = await slideXml(zip, 9);
    expect(quiz).toContain("Which gas do plants take in?");
    expect(quiz).toContain("CarbonDioxide-opt");
    expect(quiz).not.toContain("DCF5E3");
    expect(quiz).not.toContain("17703F");
    expect(quiz).not.toContain("Answer");
    expect(answer).toContain("Answer");
    expect(answer).toContain("CarbonDioxide-opt");
    expect(answer).toContain("DCF5E3");
    expect(answer).toContain("17703F");
    expect(answer).toContain("Plants use CO2 to build sugar");
    expect(await slideXml(zip, 1)).toContain("How do plants make food?");
    expect(await slideXml(zip, 6)).toContain("one detail");
    expect(await slideXml(zip, 14)).toContain("z2");
  });

  it("mirrors the Arabic deck: rtl paragraphs, Arial, localised labels", async () => {
    const zip = await JSZip.loadAsync(await buildPptx({ kind: "SLIDES", title: "التمثيل الضوئي", locale: "ar", content: deck(true) }));
    expect(slideFiles(zip)).toHaveLength(14);
    const first = await slideXml(zip, 1);
    expect(first).toContain('rtl="1"');
    expect(first).toContain("Arial");
    expect(first).toContain("كيف تصنع النباتات غذاءها؟");
    expect(await slideXml(zip, 9)).toContain("الإجابة");
    expect(await slideXml(zip, 13)).toContain("تذكرة الخروج");
    const notes = (await Promise.all(Object.keys(zip.files).filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n)).map((n) => xmlOf(zip, n)))).join("");
    expect(notes).toContain("ملاحظات المعلم");
    expect(notes).toContain("NOTE-title");
    const layouts = (await Promise.all(Object.keys(zip.files).filter((n) => /slideLayouts\/slideLayout\d+\.xml$/.test(n)).map((n) => xmlOf(zip, n)))).join("");
    expect(layouts).toContain("Nibras");
    expect(layouts).toContain('x="8979408"');
  });

  it("still exports an old-format deck (v1 fields only) and skips answer slides without an answerIndex", async () => {
    const old = {
      deckTitle: "Old",
      slides: [
        { layout: "title", title: "Old title", bullets: ["Subtitle line"], speakerNotes: "OLD-note", imagePrompt: null, emoji: null, objectiveCodes: [] },
        { layout: "definition", title: "Term", bullets: ["Meaning", "Example"], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: [] },
        { layout: "quizBreak", title: "Check", bullets: ["Q?"], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: [] },
        { layout: "summary", title: "Sum", bullets: ["a", "b", "c"], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: [] },
        { layout: "process", title: "Proc", bullets: ["s1", "s2"], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: [] },
        { layout: "twoColumn", title: "Cols", bullets: ["l1", "l2", "r1"], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: [] },
        { layout: "twoColumn", title: "Cols1", bullets: ["only"], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: [] },
        { layout: "bullets", title: "Plain", bullets: ["x"], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: [] },
      ],
    } as unknown as SlidesContent;
    const zip = await JSZip.loadAsync(await buildPptx({ kind: "SLIDES", title: "Old", locale: "en", content: old }));
    expect(slideFiles(zip)).toHaveLength(8);
    expect(await slideXml(zip, 1)).toContain("Subtitle line");
    const pdf = await PDFDocument.load(await buildPdf({ kind: "SLIDES", title: "Old", locale: "en", content: old }));
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(8);
    const docx = await JSZip.loadAsync(await buildDocx({ kind: "SLIDES", title: "Old", locale: "en", content: old }));
    expect(await xmlOf(docx, "word/document.xml")).toContain("Subtitle line");
  });

  it("builds a PDF of landscape 16:9 pages with notes pages after the slides", async () => {
    const buf = await buildPdf({ kind: "SLIDES", title: "Photosynthesis", locale: "en", content: deck(false) });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    const pdf = await PDFDocument.load(buf);
    // 14 slides + a notes page for every non-answer slide with notes (11 of 12)
    expect(pdf.getPageCount()).toBe(25);
    const first = pdf.getPage(0);
    expect(first.getWidth()).toBeCloseTo(842, 0);
    expect(first.getHeight()).toBeCloseTo(474, 0);
    expect(pdf.getAuthor()).toBe("Nibras");
    expect(pdf.getTitle()).toBe("Photosynthesis");
  });

  it("writes every new field into the DOCX, with the answer and notes", async () => {
    const zip = await JSZip.loadAsync(await buildDocx({ kind: "SLIDES", title: "Photosynthesis", locale: "en", content: deck(false) }));
    const xml = await xmlOf(zip, "word/document.xml");
    for (const part of ["Grade 6 science", "How do plants make food?", "Plants need light, water and air", "Light: p1; p2", "Chlorophyll: The green pigment", "Example: Why leaves look green", "1. one: one detail", "B. CarbonDioxide-opt", "Answer: B. CarbonDioxide-opt", "Takeaways 1: t1", "Exit ticket: Name one input", "Speaker notes: NOTE-quiz1"]) expect(xml).toContain(part);
    const ar = await JSZip.loadAsync(await buildDocx({ kind: "SLIDES", title: "x", locale: "ar", content: deck(true) }));
    expect(await xmlOf(ar, "word/document.xml")).toContain("الإجابة");
  });
});
