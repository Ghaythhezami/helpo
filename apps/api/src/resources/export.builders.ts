import { AlignmentType, Document, Footer, Header, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import PptxGenJS from "pptxgenjs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { BRAND, migrateSlides, type CardsContent, type GameContent, type Locale, type QuizContent, type ResourceKind, type Slide, type SlidesContent, type WorksheetContent } from "@helpo/shared";

export type AnyContent = SlidesContent | WorksheetContent | QuizContent | GameContent | CardsContent;

export interface ExportInput {
  kind: ResourceKind;
  title: string;
  locale: Locale;
  content: AnyContent;
  /** Quiz and worksheet: include the answer key (default true). */
  includeKey?: boolean;
}

const T = {
  en: { brand: BRAND.name, answerKey: "Answer key", support: "Support", core: "Core", stretch: "Stretch", objective: "Objective", explanation: "Explanation", note: "Speaker note", front: "Front", back: "Back", pairs: "Matching pairs", sort: "Sorting", equation: "Order the tiles", statements: "True or false", prepared: "Prepared with", page: "Page", points: "points", name: "Name", date: "Date", example: "Example", answer: "Answer", exit: "Exit ticket", takeaways: "Takeaways", why: "Why", notes: "Speaker notes" },
  ar: { brand: BRAND.nameAr, answerKey: "مفتاح الإجابات", support: "دعم", core: "أساسي", stretch: "تحدٍّ", objective: "الهدف", explanation: "التفسير", note: "ملاحظة المعلم", front: "الأمام", back: "الخلف", pairs: "أزواج المطابقة", sort: "التصنيف", equation: "رتّب القطع", statements: "صح أم خطأ", prepared: "أُعدّ بواسطة", page: "صفحة", points: "درجات", name: "الاسم", date: "التاريخ", example: "مثال", answer: "الإجابة", exit: "تذكرة الخروج", takeaways: "الخلاصة", why: "لماذا", notes: "ملاحظات المعلم" },
} as const;
type Strings = (typeof T)["en"] | (typeof T)["ar"];

const LEVEL = (t: Strings, l: "support" | "core" | "stretch") => (l === "support" ? t.support : l === "core" ? t.core : t.stretch);
const letter = (i: number) => String.fromCharCode(65 + i);

/** The answer-key line of a quiz question. */
export function quizAnswer(q: QuizContent["questions"][number]): string {
  if (q.type === "short") return (q.acceptedAnswers ?? []).join(" / ");
  if (q.type === "matching") return (q.pairs ?? []).map((p) => `${p.left} = ${p.right}`).join("; ");
  const i = q.options?.findIndex((o) => o.correct) ?? -1;
  return i < 0 ? "" : `${letter(i)}. ${q.options?.[i].text ?? ""}`;
}

/* ---------------------------------- DOCX ---------------------------------- */

export async function buildDocx({ kind, title, locale, content, includeKey = true }: ExportInput): Promise<Buffer> {
  const rtl = locale === "ar";
  const t = T[locale];
  const font = rtl ? "Arial" : "Calibri";
  const para = (text: string, o: { bold?: boolean; size?: number; heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]; indent?: number; after?: number; italics?: boolean } = {}) =>
    new Paragraph({
      heading: o.heading,
      bidirectional: rtl,
      alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
      spacing: { after: o.after ?? 100 },
      indent: o.indent ? (rtl ? { right: o.indent } : { left: o.indent }) : undefined,
      children: [new TextRun({ text, bold: o.bold, italics: o.italics, size: o.size ?? 22, font, rightToLeft: rtl })],
    });
  const h1 = (s: string) => para(s, { heading: HeadingLevel.HEADING_1, bold: true, size: 32, after: 200 });
  const h2 = (s: string) => para(s, { heading: HeadingLevel.HEADING_2, bold: true, size: 26, after: 120 });

  const body: Paragraph[] = [h1(title)];
  if (kind === "WORKSHEET") {
    const w = content as WorksheetContent;
    body.push(para(w.instructions, { italics: true }), para(`${t.name}: ____________________    ${t.date}: ____________`));
    let n = 0;
    for (const s of w.sections) {
      body.push(h2(`${s.heading} (${LEVEL(t, s.level)})`));
      for (const it of s.items) {
        n += 1;
        body.push(para(`${n}. ${it.prompt}  [${it.points} ${t.points}]`, { bold: true, after: 40 }));
        it.options?.forEach((o, k) => body.push(para(`${letter(k)}. ${o}`, { indent: 360, after: 30 })));
        if (!it.options) body.push(para("______________________________", { indent: 360 }));
      }
    }
    if (includeKey) {
      body.push(h2(t.answerKey));
      let k = 0;
      for (const s of w.sections) for (const it of s.items) body.push(para(`${++k}. ${it.answer}`, { after: 30 }));
    }
  } else if (kind === "QUIZ") {
    const qs = (content as QuizContent).questions;
    qs.forEach((q, i) => {
      body.push(para(`${i + 1}. ${q.prompt}`, { bold: true, after: 60 }));
      q.options?.forEach((o, k) => body.push(para(`${letter(k)}. ${o.text}`, { indent: 360, after: 40 })));
      if (q.type === "matching") q.pairs?.forEach((p) => body.push(para(`${p.left}   ____`, { indent: 360, after: 40 })));
      if (q.type === "short") body.push(para("______________________________", { indent: 360 }));
    });
    if (includeKey) {
      body.push(h2(t.answerKey));
      qs.forEach((q, i) => body.push(para(`${i + 1}. ${quizAnswer(q)}`, { bold: true, after: 20 }), para(`${t.explanation}: ${q.explanation}`, { indent: 360 })));
    }
  } else if (kind === "CARDS") {
    (content as CardsContent).cards.forEach((c, i) => {
      body.push(para(`${i + 1}. ${t.front}: ${c.emoji ? `${c.emoji} ` : ""}${c.front}`, { bold: true, after: 40 }), para(`${t.back}: ${c.back}`, { indent: 360, after: 160 }));
    });
  } else if (kind === "SLIDES") {
    slideFrames(content).forEach((f, i) => {
      body.push(h2(`${i + 1}. ${f.answer ? `${t.answer}: ${f.s.title}` : f.s.title}`));
      slideTextLines(f, t).forEach((line) => body.push(para(line, { indent: 360, after: 60 })));
      if (f.s.speakerNotes && !f.answer) body.push(para(`${t.notes}: ${f.s.speakerNotes}`, { italics: true, indent: 360 }));
    });
  } else {
    const g = content as GameContent;
    body.push(para(g.instructions, { italics: true }), para(t.pairs, { bold: true }));
    g.pairs.forEach((p, i) => body.push(para(`${i + 1}. ${p.left}  =  ${p.right}`, { indent: 360 })));
    body.push(para(`${t.sort}: ${g.sortBaskets.yes} / ${g.sortBaskets.no}`, { bold: true }));
    g.sortItems.forEach((s) => body.push(para(`${s.label}  ->  ${s.belongsInYes ? g.sortBaskets.yes : g.sortBaskets.no}`, { indent: 360 })));
    body.push(para(t.equation, { bold: true }), para(g.equationTiles.join("  "), { indent: 360 }), para(t.statements, { bold: true }));
    g.statements.forEach((s) => body.push(para(`${s.text}  (${s.isTrue ? "true" : "false"})`, { indent: 360 })));
  }

  const doc = new Document({
    creator: BRAND.name,
    lastModifiedBy: BRAND.name,
    title,
    description: `${BRAND.name} export`,
    sections: [
      {
        headers: { default: new Header({ children: [para(`${t.brand}  |  ${title}`, { size: 18, italics: true })] }) },
        footers: { default: new Footer({ children: [para(`${t.prepared} ${t.brand}`, { size: 16, italics: true })] }) },
        children: body,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

/* ------------------------------ Slides (shared) ------------------------------ */

const VIOLET = "6035CF";
const INK = "24185F";
const INK2 = "4A3F86";
const SOFT = "EBE2FD";
const PAGE = "F4F0FE";
const EDGE = "D9CCF7";
const OK = "17703F";
const OK_BG = "DCF5E3";
const WARN = "7A4E00";
const WARN_BG = "FDE4A3";
const WHITE = "FFFFFF";
const PDF_W = 842;
const PDF_H = 474;

/** One exported page: a deck slide, or the "Answer" slide that follows a quizBreak. */
interface Frame {
  s: Slide;
  answer: boolean;
}

function hasAnswer(s: Slide): boolean {
  return s.layout === "quizBreak" && s.answerIndex !== null && s.options?.[s.answerIndex] !== undefined;
}

/** Old stored decks are migrated first; every answerable quizBreak is followed by an answer frame. */
function slideFrames(content: AnyContent): Frame[] {
  const frames: Frame[] = [];
  for (const s of migrateSlides(content as SlidesContent).slides) {
    frames.push({ s, answer: false });
    if (hasAnswer(s)) frames.push({ s, answer: true });
  }
  return frames;
}

function answerLine(s: Slide, t: Strings): string {
  return hasAnswer(s) ? `${t.answer}: ${letter(s.answerIndex ?? 0)}. ${s.options?.[s.answerIndex ?? 0] ?? ""}` : "";
}

/** The speaker notes, plus the answer for a quiz slide (it is never printed on the slide itself). */
function frameNotes(f: Frame, t: Strings): string {
  const parts = [f.s.speakerNotes ? `${t.notes}: ${f.s.speakerNotes}` : "", answerLine(f.s, t), hasAnswer(f.s) && f.s.keyIdea ? `${t.why}: ${f.s.keyIdea}` : ""];
  return parts.filter(Boolean).join("\n\n");
}

/** Every text field of a slide as readable lines (DOCX). */
function slideTextLines({ s, answer }: Frame, t: Strings): string[] {
  if (answer) return [answerLine(s, t), s.keyIdea ? `${t.why}: ${s.keyIdea}` : ""].filter(Boolean);
  const out: (string | null)[] = [s.subtitle, s.keyIdea, s.term ? `${s.term}: ${s.definition ?? ""}` : s.definition, s.example ? `${t.example}: ${s.example}` : null];
  s.bullets.forEach((b) => out.push(`- ${b}`));
  s.columns?.forEach((c) => out.push(`${c.heading}: ${c.points.join("; ")}`));
  s.steps?.forEach((st, i) => out.push(`${i + 1}. ${st.title}: ${st.detail}`));
  if (s.layout === "summary") s.takeaways?.forEach((k, i) => out.push(`${t.takeaways} ${i + 1}: ${k}`));
  out.push(s.layout === "summary" && s.question ? `${t.exit}: ${s.question}` : s.question);
  s.options?.forEach((o, i) => out.push(`${letter(i)}. ${o}`));
  out.push(answerLine(s, t));
  return out.filter((x): x is string => Boolean(x));
}

interface TextOpts {
  max: number;
  min: number;
  bold?: boolean;
  color?: string;
  align?: "l" | "r" | "c";
  bullet?: boolean;
  valign?: "t" | "m";
}
interface ShapeOpts {
  fill?: string;
  line?: string;
  round?: boolean;
}
/** A 10 x 5.625 inch drawing surface; the PPTX and PDF writers each implement it so one layout serves both. */
interface Canvas {
  rect(x: number, y: number, w: number, h: number, o: ShapeOpts): void;
  oval(x: number, y: number, d: number, o: { fill: string }): void;
  text(content: string | string[], x: number, y: number, w: number, h: number, o: TextOpts): void;
  emoji(e: string, x: number, y: number, d: number): void;
}

/** Draws one slide in its designed layout; `rtl` mirrors every position. Numbers are inches. */
function drawSlide(c: Canvas, { s, answer }: Frame, t: Strings, rtl: boolean): void {
  const mx = (x: number, w: number) => (rtl ? 10 - x - w : x);
  const al = rtl ? "r" : "l";
  const R = (x: number, y: number, w: number, h: number, o: ShapeOpts) => c.rect(mx(x, w), y, w, h, o);
  const O = (x: number, y: number, d: number, fill: string) => c.oval(mx(x, d), y, d, { fill });
  const Tx = (content: string | string[], x: number, y: number, w: number, h: number, o: TextOpts) => c.text(content, mx(x, w), y, w, h, { align: al, ...o });
  const Tc = (content: string, x: number, y: number, w: number, h: number, o: TextOpts) => c.text(content, mx(x, w), y, w, h, { ...o, align: "c" });
  const header = (text: string, emoji: string | null) => {
    Tx(text, 0.55, 0.3, emoji ? 7.9 : 8.9, 0.85, { max: 30, min: 16, bold: true, color: INK, valign: "m" });
    if (emoji) {
      O(8.75, 0.35, 0.7, SOFT);
      c.emoji(emoji, mx(8.75, 0.7), 0.35, 0.7);
    }
  };
  const callout = (text: string, y: number, h: number) => {
    R(0.55, y, 8.9, h, { fill: SOFT, round: true });
    Tx(text, 0.8, y, 8.4, h, { max: 20, min: 12, bold: true, color: INK, valign: "m" });
  };
  const card = (x: number, y: number, w: number, h: number) => R(x, y, w, h, { fill: WHITE, line: EDGE, round: true });
  const circle = (n: string, x: number, y: number, d: number, fill: string) => {
    O(x, y, d, fill);
    Tc(n, x, y, d, d, { max: 18, min: 18, bold: true, color: WHITE, valign: "m" });
  };

  const usable = (layout: Slide["layout"]): Slide["layout"] => {
    if (layout === "twoColumn" && !s.columns?.length) return "bullets";
    if (layout === "process" && !s.steps?.length) return "bullets";
    if (layout === "summary" && !s.takeaways?.length) return "bullets";
    return layout;
  };
  const layout = usable(s.layout);

  if (answer) {
    const i = s.answerIndex ?? 0;
    header(t.answer, s.emoji);
    if (s.question) Tx(s.question, 0.55, 1.2, 8.9, 0.85, { max: 18, min: 12, color: INK2, valign: "m" });
    R(0.55, 2.2, 8.9, 1.3, { fill: OK_BG, line: OK, round: true });
    circle(letter(i), 0.8, 2.575, 0.55, OK);
    Tx(s.options?.[i] ?? "", 1.6, 2.2, 7.6, 1.3, { max: 26, min: 14, bold: true, color: OK, valign: "m" });
    if (s.keyIdea) {
      card(0.55, 3.7, 8.9, 1.25);
      Tx(t.why, 0.8, 3.78, 8.4, 0.3, { max: 12, min: 12, bold: true, color: VIOLET, valign: "m" });
      Tx(s.keyIdea, 0.8, 4.08, 8.4, 0.8, { max: 18, min: 11, color: INK, valign: "t" });
    }
    return;
  }

  switch (layout) {
    case "title": {
      c.rect(0, 0, 10, 3.55, { fill: VIOLET });
      if (s.emoji) {
        O(8.3, 0.55, 1.0, WHITE);
        c.emoji(s.emoji, mx(8.3, 1.0), 0.55, 1.0);
      }
      Tx(s.title, 0.7, 0.5, s.emoji ? 7.4 : 8.6, 1.7, { max: 44, min: 20, bold: true, color: WHITE, valign: "m" });
      if (s.subtitle) Tx(s.subtitle, 0.7, 2.3, 8.6, 0.75, { max: 20, min: 12, color: SOFT, valign: "m" });
      if (s.question) {
        card(0.7, 3.2, 8.6, 1.3);
        Tx(s.question, 0.95, 3.2, 8.1, 1.3, { max: 22, min: 12, bold: true, color: INK, valign: "m" });
      }
      return;
    }
    case "twoColumn": {
      header(s.title, s.emoji);
      let y = 1.3;
      if (s.keyIdea) {
        callout(s.keyIdea, y, 0.65);
        y = 2.1;
      }
      const h = 4.95 - y;
      (s.columns ?? []).slice(0, 2).forEach((col, i) => {
        const x = 0.55 + i * 4.55;
        card(x, y, 4.35, h);
        const head = col.heading.trim() !== "";
        if (head) {
          R(x, y, 4.35, 0.6, { fill: VIOLET, round: true });
          Tx(col.heading, x + 0.15, y, 4.05, 0.6, { max: 18, min: 11, bold: true, color: WHITE, valign: "m" });
        }
        Tx(col.points, x + 0.15, y + (head ? 0.7 : 0.15), 4.05, h - (head ? 0.8 : 0.3), { max: 18, min: 10, bullet: true, color: INK, valign: "t" });
      });
      return;
    }
    case "definition": {
      Tx(s.term ?? s.title, 0.55, 0.3, s.emoji ? 7.9 : 8.9, 1.2, { max: 44, min: 20, bold: true, color: VIOLET, valign: "m" });
      if (s.emoji) {
        O(8.75, 0.5, 0.7, SOFT);
        c.emoji(s.emoji, mx(8.75, 0.7), 0.5, 0.7);
      }
      const dh = s.example ? 1.5 : 3.3;
      card(0.55, 1.6, 8.9, dh);
      R(0.55, 1.6, 0.12, dh, { fill: VIOLET });
      Tx(s.definition ?? "", 0.9, 1.6, 8.35, dh, { max: 26, min: 13, color: INK, valign: "m" });
      if (s.example) {
        R(0.55, 3.3, 8.9, 1.65, { fill: SOFT, round: true });
        Tx(t.example, 0.8, 3.4, 8.4, 0.35, { max: 13, min: 13, bold: true, color: VIOLET, valign: "m" });
        Tx(s.example, 0.8, 3.75, 8.4, 1.1, { max: 20, min: 11, color: INK, valign: "t" });
      }
      return;
    }
    case "process": {
      header(s.title, s.emoji);
      const steps = (s.steps ?? []).slice(0, 6);
      const wide = steps.length <= 4;
      const per = wide ? steps.length : 3;
      const cw = 8.9 / per;
      const d = wide ? 0.6 : 0.5;
      const rows = wide ? 1 : 2;
      for (let r = 0; r < rows; r += 1) {
        const inRow = Math.min(per, steps.length - r * per);
        const cy = wide ? 1.75 : 1.3 + r * 1.8;
        if (inRow > 1) R(0.55 + cw / 2, cy + d / 2 - 0.02, cw * (inRow - 1), 0.04, { fill: EDGE });
      }
      steps.forEach((st, i) => {
        const r = wide ? 0 : Math.floor(i / 3);
        const col = wide ? i : i % 3;
        const cx = 0.55 + cw * col + cw / 2;
        const cy = wide ? 1.75 : 1.3 + r * 1.8;
        circle(String(i + 1), cx - d / 2, cy, d, VIOLET);
        Tc(st.title, cx - cw / 2 + 0.08, cy + d + 0.1, cw - 0.16, wide ? 0.6 : 0.4, { max: wide ? 20 : 16, min: 10, bold: true, color: INK, valign: "m" });
        Tc(st.detail, cx - cw / 2 + 0.08, cy + d + (wide ? 0.75 : 0.5), cw - 0.16, wide ? 1.7 : 0.75, { max: wide ? 16 : 13, min: 9, color: INK2, valign: "t" });
      });
      return;
    }
    case "quizBreak": {
      header(s.title, s.emoji);
      Tx(s.question ?? s.title, 0.55, 1.25, 8.9, 1.15, { max: 24, min: 13, bold: true, color: INK, valign: "m" });
      (s.options ?? []).slice(0, 4).forEach((opt, i) => {
        const x = 0.55 + (i % 2) * 4.55;
        const y = 2.55 + Math.floor(i / 2) * 1.25;
        card(x, y, 4.35, 1.1);
        circle(letter(i), x + 0.2, y + 0.275, 0.55, VIOLET);
        Tx(opt, x + 0.9, y, 3.35, 1.1, { max: 18, min: 10, color: INK, valign: "m" });
      });
      return;
    }
    case "summary": {
      header(s.title, s.emoji);
      const items = (s.takeaways ?? []).slice(0, 3);
      const cw = (8.9 - 0.4) / 3;
      const ch = s.question ? 2.45 : 3.6;
      items.forEach((tk, i) => {
        const x = 0.55 + i * (cw + 0.2);
        card(x, 1.3, cw, ch);
        circle(String(i + 1), x + 0.2, 1.5, 0.55, VIOLET);
        Tx(tk, x + 0.2, 2.2, cw - 0.4, ch - 1.05, { max: 18, min: 10, color: INK, valign: "t" });
      });
      if (s.question) {
        R(0.55, 3.95, 8.9, 1.0, { fill: WARN_BG, round: true });
        Tx(t.exit, 0.8, 4.0, 8.4, 0.3, { max: 12, min: 12, bold: true, color: WARN, valign: "m" });
        Tx(s.question, 0.8, 4.3, 8.4, 0.6, { max: 18, min: 11, bold: true, color: INK, valign: "m" });
      }
      return;
    }
    default: {
      header(s.title, s.emoji);
      let y = 1.3;
      if (s.keyIdea) {
        callout(s.keyIdea, y, 0.9);
        y = 2.4;
      }
      const lines = s.bullets.length ? s.bullets : (s.steps ?? []).map((st) => st.detail);
      Tx(lines.slice(0, 5), 0.6, y, 8.8, 4.95 - y, { max: 22, min: 12, bullet: true, color: INK, valign: "t" });
    }
  }
}

/* ---------------------------------- PPTX ---------------------------------- */

/** Largest font size (pt) at which the text is expected to fit; a conservative estimate, PowerPoint also shrinks on top of it. */
function fitSize(items: string[], w: number, h: number, o: TextOpts): number {
  const gap = items.length > 1 ? 4 : 0;
  for (let s = o.max; s > o.min; s -= 1) {
    const perLine = Math.max(1, Math.floor(w / ((s * (o.bold ? 0.6 : 0.56)) / 72)));
    const lines = items.reduce((n, it) => n + Math.max(1, Math.ceil(it.length / perLine)), 0);
    if ((lines * s * 1.25 + (items.length - 1) * gap) / 72 <= h) return s;
  }
  return o.min;
}

export async function buildPptx({ title, locale, content }: ExportInput): Promise<Buffer> {
  const rtl = locale === "ar";
  const t = T[locale];
  const face = rtl ? "Arial" : "Calibri";
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = BRAND.name;
  pptx.company = BRAND.name;
  pptx.title = title;
  pptx.subject = `${BRAND.name} export`;
  pptx.theme = { headFontFace: face, bodyFontFace: face };
  const frames = slideFrames(content);
  const master = "NIBRAS";
  const foot = { y: 5.2, w: 0.5, h: 0.3, fontSize: 10, color: INK2, fontFace: face };
  pptx.defineSlideMaster({
    title: master,
    background: { color: PAGE },
    objects: [
      { rect: { x: rtl ? 9.82 : 0, y: 0, w: 0.18, h: 5.625, fill: { color: VIOLET } } },
      { text: { text: BRAND.name, options: { x: rtl ? 8.0 : 0.55, y: 5.2, w: 1.45, h: 0.3, fontSize: 11, bold: true, color: VIOLET, fontFace: "Calibri", align: rtl ? "right" : "left" } } },
      { text: { text: `/ ${frames.length}`, options: { ...foot, x: rtl ? 1.05 : 8.95, w: 0.5, align: "left" } } },
    ],
    slideNumber: { ...foot, x: rtl ? 0.55 : 8.45, align: "right" },
  });
  const shape = pptx.ShapeType;
  frames.forEach((f) => {
    const slide = pptx.addSlide({ masterName: master });
    const canvas: Canvas = {
      rect: (x, y, w, h, o) =>
        slide.addShape(o.round ? shape.roundRect : shape.rect, {
          x,
          y,
          w,
          h,
          fill: { color: o.fill ?? WHITE },
          line: o.line ? { color: o.line, width: 1 } : { type: "none" },
          ...(o.round ? { rectRadius: 0.12 } : {}),
        }),
      oval: (x, y, d, o) => slide.addShape(shape.ellipse, { x, y, w: d, h: d, fill: { color: o.fill }, line: { type: "none" } }),
      emoji: (e, x, y, d) => slide.addText(e, { x, y, w: d, h: d, fontSize: Math.round(d * 36), fontFace: "Segoe UI Emoji", align: "center", valign: "middle", margin: 0 }),
      text: (cnt, x, y, w, h, o) => {
        const items = Array.isArray(cnt) ? cnt : [cnt];
        const fontSize = fitSize(items, w - 0.1 - (o.bullet ? 0.3 : 0), h, o);
        const base = {
          x,
          y,
          w,
          h,
          fontSize,
          fontFace: face,
          bold: !!o.bold,
          color: o.color ?? INK,
          rtlMode: rtl,
          align: o.align === "r" ? ("right" as const) : o.align === "c" ? ("center" as const) : ("left" as const),
          valign: o.valign === "m" ? ("middle" as const) : ("top" as const),
          fit: "shrink" as const,
          margin: 0.05,
        };
        if (Array.isArray(cnt)) slide.addText(cnt.map((text) => ({ text, options: { bullet: !!o.bullet, breakLine: true, paraSpaceAfter: 4 } })), base);
        else slide.addText(cnt, base);
      },
    };
    drawSlide(canvas, f, t, rtl);
    const notes = frameNotes(f, t);
    if (notes) slide.addNotes(notes);
  });
  const out = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(out as ArrayBuffer);
}

/* ----------------------------------- PDF ----------------------------------- */

const WIN_ANSI: Record<string, string> = { "→": "->", "←": "<-", "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", "•": "*", "≥": ">=", "≤": "<=", "×": "x", "\t": " " };

/** The standard PDF fonts only cover WinAnsi; anything else is replaced so encoding never throws. */
export function pdfSafe(s: string): string {
  return Array.from(s.replace(/[→←–—‘’“”…•≥≤×\t]/g, (c) => WIN_ANSI[c]))
    .map((ch) => {
      const c = ch.codePointAt(0) ?? 63;
      return ch === "\n" || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) ? ch : "?";
    })
    .join("");
}

const hexRgb = (h: string) => rgb(Number.parseInt(h.slice(0, 2), 16) / 255, Number.parseInt(h.slice(2, 4), 16) / 255, Number.parseInt(h.slice(4, 6), 16) / 255);

function wrapLines(raw: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of pdfSafe(raw).split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

class PdfWriter {
  private page!: PDFPage;
  private y = 0;
  private readonly margin = 54;
  private constructor(
    private readonly doc: PDFDocument,
    private readonly font: PDFFont,
    private readonly bold: PDFFont,
    first: boolean,
  ) {
    if (first) this.newPage();
  }

  static async create(title: string, first = true): Promise<PdfWriter> {
    const doc = await PDFDocument.create();
    doc.setTitle(pdfSafe(title));
    doc.setAuthor(BRAND.name);
    doc.setCreator(BRAND.name);
    doc.setProducer(BRAND.name);
    doc.setSubject(`${BRAND.name} export`);
    return new PdfWriter(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold), first);
  }

  private newPage() {
    this.page = this.doc.addPage([595, 842]);
    this.y = 842 - this.margin;
  }

  gap(h = 8) {
    this.y -= h;
  }

  private wrap(raw: string, font: PDFFont, size: number, width: number): string[] {
    return wrapLines(raw, font, size, width);
  }

  text(raw: string, o: { size?: number; bold?: boolean; indent?: number; color?: [number, number, number] } = {}) {
    const size = o.size ?? 11;
    const font = o.bold ? this.bold : this.font;
    for (const line of this.wrap(raw, font, size, 595 - this.margin * 2 - (o.indent ?? 0))) {
      if (this.y - size < this.margin) this.newPage();
      this.page.drawText(line, { x: this.margin + (o.indent ?? 0), y: this.y - size, size, font, color: rgb(...(o.color ?? [0.07, 0.09, 0.15])) });
      this.y -= size * 1.35;
    }
  }

  /** Printable flash cards: a 2 x 4 grid of bordered boxes per page (front on top, back below). */
  cardGrid(cards: { front: string; back: string }[]) {
    const cols = 2;
    const rows = 4;
    const w = (595 - this.margin * 2) / cols;
    const h = (842 - this.margin * 2 - 20) / rows;
    cards.forEach((c, i) => {
      if (i % (cols * rows) === 0) this.newPage();
      const slot = i % (cols * rows);
      const x = this.margin + (slot % cols) * w;
      const top = 842 - this.margin - Math.floor(slot / cols) * h;
      this.page.drawRectangle({ x: x + 4, y: top - h + 4, width: w - 8, height: h - 8, borderColor: rgb(0.6, 0.62, 0.7), borderWidth: 1 });
      const front = this.wrap(c.front, this.bold, 14, w - 28);
      front.forEach((line, k) => this.page.drawText(line, { x: x + 14, y: top - 28 - k * 18, size: 14, font: this.bold, color: rgb(0.12, 0.16, 0.34) }));
      const back = this.wrap(c.back, this.font, 10.5, w - 28).slice(0, 8);
      back.forEach((line, k) => this.page.drawText(line, { x: x + 14, y: top - 36 - front.length * 18 - k * 14, size: 10.5, font: this.font, color: rgb(0.2, 0.22, 0.28) }));
    });
  }

  /** Slides as landscape 16:9 pages, each followed by a speaker-notes page. */
  async slides(frames: Frame[], t: Strings): Promise<Buffer> {
    for (const f of frames) {
      drawSlide(this.slidePage(), f, t, false);
      const notes = frameNotes(f, t);
      if (notes && !f.answer) {
        const c = this.slidePage();
        c.text(`${t.notes}: ${f.s.title}`, 0.55, 0.3, 8.9, 0.8, { max: 22, min: 13, bold: true, color: INK });
        c.text(notes.split("\n\n"), 0.55, 1.3, 8.9, 3.65, { max: 15, min: 8, color: INK2, valign: "t" });
      }
    }
    return this.save();
  }

  private slidePage(): Canvas {
    const page = this.doc.addPage([PDF_W, PDF_H]);
    this.page = page;
    const font = this.font;
    const bold = this.bold;
    const U = PDF_W / 10;
    const ty = (top: number, h: number) => PDF_H - (top + h) * U;
    page.drawRectangle({ x: 0, y: 0, width: PDF_W, height: PDF_H, color: hexRgb(PAGE) });
    page.drawRectangle({ x: 0, y: 0, width: 0.18 * U, height: PDF_H, color: hexRgb(VIOLET) });
    return {
      rect: (x, y, w, h, o) => page.drawRectangle({ x: x * U, y: ty(y, h), width: w * U, height: h * U, color: o.fill ? hexRgb(o.fill) : undefined, borderColor: o.line ? hexRgb(o.line) : undefined, borderWidth: o.line ? 1 : 0 }),
      oval: (x, y, d, o) => page.drawEllipse({ x: (x + d / 2) * U, y: ty(y, d) + (d * U) / 2, xScale: (d * U) / 2, yScale: (d * U) / 2, color: hexRgb(o.fill) }),
      emoji: () => undefined,
      text: (content, x, y, w, h, o) => {
        const f = o.bold ? bold : font;
        const items = (Array.isArray(content) ? content : [content]).map((it) => (o.bullet ? `- ${it}` : it));
        const boxW = w * U - 6;
        const boxH = h * U;
        const gap = items.length > 1 ? 4 : 0;
        const lay = (size: number) => items.map((it) => wrapLines(it, f, size, boxW));
        let size = o.max * 1.17;
        let blocks = lay(size);
        const height = (sz: number, b: string[][]) => b.reduce((n, l) => n + l.length, 0) * sz * 1.25 + (b.length - 1) * gap;
        while (size > o.min * 1.17 && height(size, blocks) > boxH) {
          size -= 0.5;
          blocks = lay(size);
        }
        let maxLines = Math.max(1, Math.floor(boxH / (size * 1.25)));
        const total = Math.min(height(size, blocks), boxH);
        let cy = PDF_H - y * U - (o.valign === "m" ? (boxH - total) / 2 : 0);
        for (const block of blocks) {
          for (const line of block) {
            if (maxLines <= 0) return;
            maxLines -= 1;
            const lw = f.widthOfTextAtSize(line, size);
            const lx = o.align === "r" ? (x + w) * U - 3 - lw : o.align === "c" ? x * U + (w * U - lw) / 2 : x * U + 3;
            page.drawText(line, { x: lx, y: cy - size, size, font: f, color: hexRgb(o.color ?? INK) });
            cy -= size * 1.25;
          }
          cy -= gap;
        }
      },
    };
  }

  async save(): Promise<Buffer> {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      if (p.getWidth() > p.getHeight()) {
        p.drawText(`${BRAND.name}  |  ${i + 1}/${pages.length}`, { x: 30, y: 14, size: 9, font: this.font, color: hexRgb(INK2) });
        return;
      }
      p.drawText(`${BRAND.name}   |   ${T.en.page} ${i + 1}/${pages.length}`, { x: this.margin, y: 28, size: 9, font: this.font, color: rgb(0.45, 0.47, 0.52) });
    });
    return Buffer.from(await this.doc.save());
  }
}

/** English PDFs only: pdf-lib cannot shape or reorder Arabic, so ar + pdf is refused upstream with a 422. */
export async function buildPdf({ kind, title, content, includeKey = true }: ExportInput): Promise<Buffer> {
  const t = T.en;
  const w = await PdfWriter.create(title, kind !== "SLIDES");
  if (kind === "CARDS") {
    w.cardGrid((content as CardsContent).cards.map((c) => ({ front: c.front, back: c.back })));
    return w.save();
  }
  if (kind === "SLIDES") return w.slides(slideFrames(content), t);
  w.text(title, { size: 20, bold: true });
  w.gap(10);
  if (kind === "WORKSHEET") {
    const ws = content as WorksheetContent;
    w.text(ws.instructions, { size: 10, color: [0.4, 0.42, 0.48] });
    w.text(`${t.name}: ____________________     ${t.date}: ____________`);
    w.gap(8);
    let n = 0;
    for (const s of ws.sections) {
      w.text(`${s.heading} (${LEVEL(t, s.level)})`, { size: 13, bold: true });
      for (const it of s.items) {
        w.text(`${++n}. ${it.prompt}  [${it.points} ${t.points}]`, { bold: true, indent: 8 });
        it.options?.forEach((o, k) => w.text(`${letter(k)}. ${o}`, { indent: 24 }));
        w.gap(4);
      }
      w.gap(6);
    }
    if (includeKey) {
      w.text(t.answerKey, { size: 14, bold: true });
      let k = 0;
      for (const s of ws.sections) for (const it of s.items) w.text(`${++k}. ${it.answer}`, { indent: 8, size: 10 });
    }
  } else if (kind === "QUIZ") {
    const qs = (content as QuizContent).questions;
    qs.forEach((q, i) => {
      w.text(`${i + 1}. ${q.prompt}`, { bold: true });
      q.options?.forEach((o, k) => w.text(`${letter(k)}. ${o.text}`, { indent: 18 }));
      if (q.type === "matching") q.pairs?.forEach((p) => w.text(`${p.left}   ____`, { indent: 18 }));
      w.gap(6);
    });
    if (includeKey) {
      w.gap(8);
      w.text(t.answerKey, { size: 14, bold: true });
      qs.forEach((q, i) => w.text(`${i + 1}. ${quizAnswer(q)} - ${q.explanation}`, { indent: 8, size: 10 }));
    }
  } else {
    const g = content as GameContent;
    w.text(g.instructions, { size: 10 });
    w.text(t.pairs, { bold: true, size: 13 });
    g.pairs.forEach((p, i) => w.text(`${i + 1}. ${p.left} = ${p.right}`, { indent: 14 }));
    w.gap(8);
    w.text(`${t.sort}: ${g.sortBaskets.yes} / ${g.sortBaskets.no}`, { bold: true, size: 13 });
    g.sortItems.forEach((s) => w.text(`${s.label} -> ${s.belongsInYes ? g.sortBaskets.yes : g.sortBaskets.no}`, { indent: 14 }));
    w.gap(8);
    w.text(t.equation, { bold: true, size: 13 });
    w.text(g.equationTiles.join("  "), { indent: 14 });
    w.gap(8);
    w.text(t.statements, { bold: true, size: 13 });
    g.statements.forEach((s) => w.text(`${s.text} (${s.isTrue ? "true" : "false"})`, { indent: 14 }));
  }
  return w.save();
}
