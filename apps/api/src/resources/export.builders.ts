import { AlignmentType, Document, Footer, Header, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import PptxGenJS from "pptxgenjs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { BRAND, type CardsContent, type GameContent, type Locale, type QuizContent, type ResourceKind, type SlidesContent, type WorksheetContent } from "@helpo/shared";

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
  en: { brand: BRAND.name, answerKey: "Answer key", support: "Support", core: "Core", stretch: "Stretch", objective: "Objective", explanation: "Explanation", note: "Speaker note", front: "Front", back: "Back", pairs: "Matching pairs", sort: "Sorting", equation: "Order the tiles", statements: "True or false", prepared: "Prepared with", page: "Page", points: "points", name: "Name", date: "Date" },
  ar: { brand: BRAND.nameAr, answerKey: "مفتاح الإجابات", support: "دعم", core: "أساسي", stretch: "تحدٍّ", objective: "الهدف", explanation: "التفسير", note: "ملاحظة المعلم", front: "الأمام", back: "الخلف", pairs: "أزواج المطابقة", sort: "التصنيف", equation: "رتّب القطع", statements: "صح أم خطأ", prepared: "أُعدّ بواسطة", page: "صفحة", points: "درجات", name: "الاسم", date: "التاريخ" },
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
    (content as SlidesContent).slides.forEach((s, i) => {
      body.push(h2(`${i + 1}. ${s.title}`));
      s.bullets.forEach((b) => body.push(para(`- ${b}`, { indent: 360 })));
      body.push(para(`${t.note}: ${s.speakerNotes}`, { italics: true, indent: 360 }));
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

/* ---------------------------------- PPTX ---------------------------------- */

export async function buildPptx({ title, locale, content }: ExportInput): Promise<Buffer> {
  const rtl = locale === "ar";
  const t = T[locale];
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = BRAND.name;
  pptx.company = BRAND.name;
  pptx.title = title;
  const face = rtl ? "Arial" : "Calibri";
  const text = { fontFace: face, rtlMode: rtl, align: (rtl ? "right" : "left") as "left" | "right" };
  const { slides } = content as SlidesContent;
  slides.forEach((s, i) => {
    const slide = pptx.addSlide();
    slide.background = { color: s.layout === "title" || i === 0 ? "EEF2FF" : "FFFFFF" };
    const heading = s.emoji ? `${s.emoji} ${s.title}` : s.title;
    if (s.layout === "title" || i === 0) {
      slide.addText(heading, { x: 0.7, y: 1.6, w: 8.6, h: 1.4, fontSize: 38, bold: true, color: "1F2A56", ...text });
      slide.addText(s.bullets.join("  -  "), { x: 0.7, y: 3.1, w: 8.6, h: 0.8, fontSize: 18, color: "4B5563", ...text });
    } else {
      slide.addText(heading, { x: 0.6, y: 0.35, w: 8.8, h: 0.9, fontSize: 30, bold: true, color: "1F2A56", ...text });
      slide.addText(
        s.bullets.map((b) => ({ text: b, options: { bullet: s.layout !== "process" ? true : { type: "number" as const }, breakLine: true } })),
        { x: 0.8, y: 1.4, w: 8.4, h: 3.4, fontSize: 20, color: "111827", valign: "top", ...text },
      );
    }
    slide.addText(`${t.brand}  |  ${i + 1}/${slides.length}`, { x: 0.6, y: 5.1, w: 8.8, h: 0.3, fontSize: 10, color: "9CA3AF", fontFace: face, rtlMode: rtl, align: rtl ? "left" : "right" });
    if (s.speakerNotes) slide.addNotes(s.speakerNotes);
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

class PdfWriter {
  private page!: PDFPage;
  private y = 0;
  private readonly margin = 54;
  private constructor(
    private readonly doc: PDFDocument,
    private readonly font: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.newPage();
  }

  static async create(title: string): Promise<PdfWriter> {
    const doc = await PDFDocument.create();
    doc.setTitle(pdfSafe(title));
    doc.setAuthor(BRAND.name);
    doc.setCreator(BRAND.name);
    doc.setProducer(BRAND.name);
    doc.setSubject(`${BRAND.name} export`);
    return new PdfWriter(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  }

  private newPage() {
    this.page = this.doc.addPage([595, 842]);
    this.y = 842 - this.margin;
  }

  gap(h = 8) {
    this.y -= h;
  }

  private wrap(raw: string, font: PDFFont, size: number, width: number): string[] {
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

  async save(): Promise<Buffer> {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      p.drawText(`${BRAND.name}   |   ${T.en.page} ${i + 1}/${pages.length}`, { x: this.margin, y: 28, size: 9, font: this.font, color: rgb(0.45, 0.47, 0.52) });
    });
    return Buffer.from(await this.doc.save());
  }
}

/** English PDFs only: pdf-lib cannot shape or reorder Arabic, so ar + pdf is refused upstream with a 422. */
export async function buildPdf({ kind, title, content, includeKey = true }: ExportInput): Promise<Buffer> {
  const t = T.en;
  const w = await PdfWriter.create(title);
  if (kind === "CARDS") {
    w.cardGrid((content as CardsContent).cards.map((c) => ({ front: c.front, back: c.back })));
    return w.save();
  }
  w.text(title, { size: 20, bold: true });
  w.gap(10);
  if (kind === "SLIDES") {
    (content as SlidesContent).slides.forEach((s, i) => {
      w.text(`${i + 1}. ${s.title}`, { size: 14, bold: true });
      s.bullets.forEach((b) => w.text(`* ${b}`, { indent: 14 }));
      w.text(`${t.note}: ${s.speakerNotes}`, { indent: 14, size: 9, color: [0.4, 0.42, 0.48] });
      w.gap(10);
    });
  } else if (kind === "WORKSHEET") {
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
