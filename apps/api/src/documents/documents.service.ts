import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { LIMITS, UPLOAD_MAX_BYTES, type Locale, type UploadType } from "@helpo/shared";
import type { AiProvider } from "../ai/ai.provider";
import { ProblemException, badRequest } from "../common/problem";

/** MAX_UPLOAD_MB (default 20) in bytes. */
export function maxUploadBytes(env: NodeJS.ProcessEnv = process.env): number {
  const mb = Number(env.MAX_UPLOAD_MB);
  return mb > 0 ? Math.floor(mb * 1024 * 1024) : UPLOAD_MAX_BYTES;
}

export const MAX_UPLOAD_BYTES = maxUploadBytes();
export const MAX_SOURCE_CHARS = 400_000;

export interface ExtractedSource {
  type: UploadType;
  /** Clean markdown-ish text with [[page N]] markers. */
  text: string;
  pages: number | null;
  detectedLocale: Locale;
  sha256: string;
  tokenCount: number;
}

export function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i < 0 ? "" : fileName.slice(i + 1).toLowerCase();
}

export const sha256Hex = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");

/** Arabic script ratio over all letters: more than 30% Arabic means "ar". */
export function detectLocale(text: string): Locale {
  const arabic = (text.match(/[؀-ۿݐ-ݿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return arabic + latin > 0 && arabic / (arabic + latin) > 0.3 ? "ar" : "en";
}

const decodeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

export const PAGE_MARKER = /\[\[page (\d+)\]\]/g;
const pageMarker = (n: number) => `[[page ${n}]]`;
/** Text without the page markers (for length checks). */
export const withoutMarkers = (text: string) => text.replace(PAGE_MARKER, "").trim();

/** Cleans extracted text: line endings, trailing spaces, blank-line runs and hyphenation breaks ("photo-\nsynthesis"). */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/(\p{L})-\n(\p{L})/gu, "$1$2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const PAGE_NUMBER_LINE = /^\s*(?:page|p\.|صفحة)?\s*\d{1,4}(?:\s*(?:of|\/|من)\s*\d{1,4})?\s*$/i;

/**
 * Removes page numbers and repeated headers/footers (a short line that appears on at least 60% of the pages).
 * `pages` holds the raw lines of each page.
 */
export function stripPageFurniture(pages: string[][]): string[][] {
  const counts = new Map<string, number>();
  for (const lines of pages) for (const l of new Set(lines.map((x) => x.trim().toLowerCase()).filter(Boolean))) counts.set(l, (counts.get(l) ?? 0) + 1);
  const repeated = new Set<string>();
  if (pages.length >= 3) for (const [l, n] of counts) if (n / pages.length >= 0.6 && l.length < 100) repeated.add(l);
  return pages.map((lines) => lines.filter((l) => !PAGE_NUMBER_LINE.test(l) && !repeated.has(l.trim().toLowerCase())));
}

/** "12-40" to [12, 40]; 400 when reversed. */
export function parsePageRange(range: string | undefined): [number, number] | null {
  if (!range) return null;
  const m = /^(\d{1,4})-(\d{1,4})$/.exec(range);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > Number(m[2])) throw badRequest('The page range must look like "12-40".');
  return [Number(m[1]), Number(m[2])];
}

/**
 * Splits long text into chunks of about `maxChars`, preferring paragraph/page boundaries, with `overlap` chars of
 * context repeated at the start of the next chunk (map-reduce analysis).
 */
export function chunkText(text: string, maxChars: number, overlap = 0): string[] {
  if (text.length <= maxChars) return [text];
  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const cut = Math.max(text.lastIndexOf("\n\n", end), text.lastIndexOf("\n", end));
      if (cut > start + maxChars * 0.5) end = cut;
    }
    out.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return out.filter(Boolean);
}

export interface ExtractOptions {
  pageRange?: string;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  /**
   * Decides the real file type from its bytes (not its name): %PDF, a ZIP holding word/ or ppt/, else plain text.
   * The extension must agree, so a renamed file is refused.
   */
  async detectType(buffer: Buffer, fileName: string): Promise<UploadType> {
    if (buffer.length === 0) throw badRequest("That file is empty.");
    const max = maxUploadBytes();
    if (buffer.length > max) throw new ProblemException(413, "Payload too large", `Files can be up to ${Math.round(max / 1024 / 1024)} MB.`);
    const ext = extensionOf(fileName);
    let kind: UploadType;
    if (buffer.subarray(0, 1024).includes("%PDF-")) kind = "pdf";
    else if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
      const zip = await JSZip.loadAsync(buffer).catch(() => null);
      if (zip?.file("word/document.xml")) kind = "docx";
      else if (zip?.file("ppt/presentation.xml")) kind = "pptx";
      else throw badRequest("That archive is not a Word or PowerPoint file.");
    } else {
      if (buffer.subarray(0, 8000).includes(0)) throw badRequest("That looks like a binary file. Upload a PDF, DOCX, PPTX, TXT or MD file.");
      kind = ext === "md" ? "md" : "txt";
      if (!["txt", "md", ""].includes(ext)) throw badRequest(`That file is named .${ext} but its content is plain text.`);
    }
    if ((kind === "pdf" || kind === "docx" || kind === "pptx") && ext !== kind) {
      throw badRequest(`That file's content is ${kind.toUpperCase()}, but its name ends in .${ext || "(none)"}.`);
    }
    return kind;
  }

  /**
   * No AI except for scanned PDFs (under 50 characters per page), where the AI provider reads the PDF directly
   * (empty in demo mode), and the token count (messages.countTokens, falling back to characters / 4).
   */
  async extract(buffer: Buffer, type: UploadType, ai?: Pick<AiProvider, "transcribePdf" | "countTokens">, opts: ExtractOptions = {}): Promise<ExtractedSource> {
    const range = parsePageRange(opts.pageRange);
    let text: string;
    let pages: number | null = null;
    if (type === "pdf") {
      const out = await this.pdfText(buffer, range);
      pages = out.pages;
      text = out.text;
      const perPage = withoutMarkers(text).length / Math.max(1, out.read);
      if (perPage < LIMITS.scannedCharsPerPage && ai) {
        const read = await ai.transcribePdf(buffer);
        if (withoutMarkers(read).length > withoutMarkers(text).length) text = read;
      }
    } else if (type === "docx") text = await this.docxText(buffer);
    else if (type === "pptx") {
      const out = await this.pptxText(buffer, range);
      text = out.text;
      pages = out.pages;
    } else text = buffer.toString("utf8");
    const clean = cleanText(text).slice(0, MAX_SOURCE_CHARS);
    if (!withoutMarkers(clean)) {
      throw badRequest("No readable text was found in that file. If it is a scan, the AI key is needed to read it.");
    }
    const tokenCount = ai ? await ai.countTokens(clean) : Math.ceil(clean.length / 4);
    return { type, text: clean, pages, detectedLocale: detectLocale(clean), sha256: sha256Hex(buffer), tokenCount };
  }

  /** Keeps the original in Vercel Blob, only when BLOB_READ_WRITE_TOKEN is set. Never blocks the upload. */
  async storeOriginal(buffer: Buffer, key: string): Promise<string | null> {
    if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
    try {
      const { put } = await import("@vercel/blob");
      const blob = await put(key, buffer, { access: "public", addRandomSuffix: true });
      return blob.url;
    } catch (e) {
      this.logger.warn(`Original was not stored: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  /** Pages are marked "[[page N]]"; repeated headers/footers, page numbers and hyphenation breaks are removed. */
  private async pdfText(buffer: Buffer, range: [number, number] | null): Promise<{ text: string; pages: number; read: number }> {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
    const doc = await task.promise;
    try {
      const total = doc.numPages;
      if (total > LIMITS.pageSoftLimit && !range) {
        throw new ProblemException(422, "Page range needed", `This file has ${total} pages. Choose a page range of up to ${LIMITS.pageSoftLimit} pages (for example 1-100).`, undefined, {
          pages: total,
          softLimit: LIMITS.pageSoftLimit,
        });
      }
      const from = range ? Math.min(range[0], total) : 1;
      const to = range ? Math.min(range[1], total) : total;
      const raw: { n: number; lines: string[] }[] = [];
      for (let n = from; n <= to; n++) {
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        let line = "";
        const lines: string[] = [];
        for (const item of content.items) {
          if (!("str" in item)) continue;
          line += item.str;
          if (item.hasEOL) {
            lines.push(line);
            line = "";
          }
        }
        if (line) lines.push(line);
        raw.push({ n, lines });
      }
      const cleaned = stripPageFurniture(raw.map((p) => p.lines));
      const parts = raw.map((p, i) => ({ n: p.n, text: cleaned[i].join("\n").replace(/[ \t]+/g, " ").trim() })).filter((p) => p.text);
      return { text: parts.map((p) => `${pageMarker(p.n)}\n${p.text}`).join("\n\n"), pages: total, read: to - from + 1 };
    } finally {
      await task.destroy();
    }
  }

  private async docxText(buffer: Buffer): Promise<string> {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  /** PPTX is a ZIP of ppt/slides/slideN.xml; each slide becomes a "[[page N]]" block of its text runs. */
  async pptxText(buffer: Buffer, range: [number, number] | null = null): Promise<{ text: string; pages: number }> {
    const zip = await JSZip.loadAsync(buffer);
    const slides = Object.keys(zip.files)
      .map((name) => ({ name, n: Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(name)?.[1]) }))
      .filter((s) => Number.isFinite(s.n))
      .sort((a, b) => a.n - b.n);
    const out: string[] = [];
    for (const [i, s] of slides.entries()) {
      const page = i + 1;
      if (range && (page < range[0] || page > range[1])) continue;
      const xml = await zip.file(s.name)!.async("string");
      const runs = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1]));
      const text = runs.join(" ").replace(/\s+/g, " ").trim();
      if (text) out.push(`${pageMarker(page)}\n${text}`);
    }
    return { text: out.join("\n\n"), pages: slides.length };
  }
}
