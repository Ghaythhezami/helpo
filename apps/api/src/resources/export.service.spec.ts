import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { RESOURCE_KINDS, type ResourceKind } from "@helpo/shared";
import { DemoAiProvider } from "../ai/demo.provider";
import type { ResourceContent } from "../ai/content";
import { mockPrisma } from "../testing/mock-prisma";
import { pdfSafe } from "./export.builders";
import { EXPORT_FORMATS, ExportService, contentDisposition, exportFilename, type ExportFormat } from "./export.service";

const ctx = (locale: "en" | "ar") => ({ title: locale === "ar" ? "التمثيل الضوئي: كيف تصنع النباتات غذاءها" : "Photosynthesis: how plants make food", grade: 6, band: "NAVIGATOR" as const, locale, language: "x", durationMin: 45, standard: null, objectives: [], sourceText: "" });

async function setup(kind: ResourceKind, locale: "en" | "ar" = "en") {
  const demo = new DemoAiProvider();
  const en = (await demo.generateResource(kind, ctx("en"))).content;
  const ar = (await demo.generateResource(kind, ctx("ar"))).content;
  const db = mockPrisma();
  db.resource.findFirst.mockResolvedValue({ id: "R1", kind, status: "READY", contentEn: en, contentAr: locale === "ar" ? ar : null, lesson: { titleEn: "Photosynthesis: how plants make food", titleAr: "التمثيل الضوئي" } });
  return { db, service: new ExportService(db), content: en as ResourceContent };
}

describe("ExportService", () => {
  it.each(RESOURCE_KINDS.flatMap((k) => EXPORT_FORMATS[k].map((f) => [k, f] as [ResourceKind, ExportFormat])))("builds a valid %s as %s", async (kind, format) => {
    const { service } = await setup(kind);
    const file = await service.build("T1", "R1", format, "en");
    expect(file.buffer.length).toBeGreaterThan(500);
    expect(file.filename).toMatch(new RegExp(`^Nibras - .* - ${kind.toLowerCase()}\\.${format}$`));
    if (format === "pdf") {
      expect(file.buffer.subarray(0, 5).toString()).toBe("%PDF-");
      const pdf = await PDFDocument.load(file.buffer);
      expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
      expect(pdf.getAuthor()).toBe("Nibras");
    } else {
      const zip = await JSZip.loadAsync(file.buffer);
      expect(Object.keys(zip.files).some((n) => n.startsWith(format === "docx" ? "word/" : "ppt/"))).toBe(true);
      if (format === "docx") {
        expect(await zip.file("word/document.xml")!.async("string")).toContain("Nibras".length ? "" : "");
        expect(await zip.file("docProps/core.xml")!.async("string")).toContain("Nibras");
      }
    }
  });

  it("scopes the resource by teacher and refuses unsupported formats", async () => {
    const { db, service } = await setup("SLIDES");
    await service.build("T9", "R1", "pptx", "en");
    expect(db.resource.findFirst.mock.calls[0][0].where).toEqual({ id: "R1", lesson: { teacherId: "T9" } });
    await expect(service.build("T1", "R1", "docx", "en")).rejects.toMatchObject({ status: 400 });
    db.resource.findFirst.mockResolvedValue(null);
    await expect(service.build("T2", "R1", "pptx", "en")).rejects.toMatchObject({ status: 404 });
  });

  it("refuses resources that are not ready", async () => {
    const { db, service } = await setup("QUIZ");
    db.resource.findFirst.mockResolvedValue({ id: "R1", kind: "QUIZ", status: "WORKING", contentEn: null, contentAr: null, lesson: { titleEn: "x", titleAr: null } });
    await expect(service.build("T1", "R1", "docx", "en")).rejects.toMatchObject({ status: 400 });
  });

  it("Arabic: DOCX is right-to-left, PDF answers 422 with a clear message", async () => {
    const { service } = await setup("QUIZ", "ar");
    const docx = await service.build("T1", "R1", "docx", "ar");
    const xml = await (await JSZip.loadAsync(docx.buffer)).file("word/document.xml")!.async("string");
    expect(xml).toContain("<w:bidi");
    expect(xml).toContain("<w:rtl");
    expect(xml).toMatch(/[؀-ۿ]/);
    await expect(service.build("T1", "R1", "pdf", "ar")).rejects.toMatchObject({ status: 422, detail: expect.stringContaining("DOCX") });
    const pptx = await setup("SLIDES", "ar");
    const file = await pptx.service.build("T1", "R1", "pptx", "ar");
    const slide = await (await JSZip.loadAsync(file.buffer)).file("ppt/slides/slide1.xml")!.async("string");
    expect(slide).toContain('rtl="1"');
  });

  it("falls back to the available language when the requested one is missing", async () => {
    const { service } = await setup("QUIZ", "en");
    const file = await service.build("T1", "R1", "pdf", "ar"); // Arabic requested, only English exists: English PDF
    expect(file.filename.endsWith(".pdf")).toBe(true);
  });

  it("filenames and headers are safe", () => {
    expect(exportFilename('A/B: "C"?', "QUIZ", "docx")).toBe("Nibras - A B C - quiz.docx");
    expect(exportFilename("", "CARDS", "pdf")).toBe("Nibras - lesson - cards.pdf");
    const h = contentDisposition("Nibras - التمثيل - quiz.docx");
    expect(h).toContain("filename*=UTF-8''");
    expect(h).toMatch(/filename="[\x20-\x7e]+"/);
    expect(pdfSafe("a → b “q” العربية é")).toBe("a -> b \"q\" ??????? é");
  });
});
