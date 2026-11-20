import JSZip from "jszip";
import { DocumentsService, chunkText, cleanText, detectLocale, extensionOf, parsePageRange, sha256Hex, stripPageFurniture } from "./documents.service";

const svc = new DocumentsService();
const pdfBytes = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");

async function zipWith(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, body] of Object.entries(files)) zip.file(name, body);
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("upload magic bytes", () => {
  it("recognises a PDF by %PDF, not by its name", async () => {
    expect(await svc.detectType(pdfBytes, "lesson.pdf")).toBe("pdf");
    await expect(svc.detectType(pdfBytes, "lesson.txt")).rejects.toMatchObject({ status: 400 });
  });

  it("tells DOCX from PPTX inside the ZIP", async () => {
    const docx = await zipWith({ "word/document.xml": "<w/>", "[Content_Types].xml": "<x/>" });
    const pptx = await zipWith({ "ppt/presentation.xml": "<p/>", "ppt/slides/slide1.xml": "<s/>" });
    expect(await svc.detectType(docx, "a.docx")).toBe("docx");
    expect(await svc.detectType(pptx, "a.pptx")).toBe("pptx");
    await expect(svc.detectType(docx, "a.pptx")).rejects.toMatchObject({ status: 400 });
  });

  it("refuses an unrelated ZIP, a corrupt ZIP, executables and renamed text", async () => {
    await expect(svc.detectType(await zipWith({ "readme.txt": "hi" }), "a.docx")).rejects.toMatchObject({ status: 400 });
    await expect(svc.detectType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), "a.docx")).rejects.toMatchObject({ status: 400 });
    await expect(svc.detectType(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]), "setup.txt")).rejects.toMatchObject({ status: 400 });
    await expect(svc.detectType(Buffer.from("plain text"), "notes.pdf")).rejects.toMatchObject({ status: 400 });
    await expect(svc.detectType(Buffer.from("plain text"), "notes.exe")).rejects.toMatchObject({ status: 400 });
  });

  it("accepts text as txt or md and rejects empty and oversized files", async () => {
    expect(await svc.detectType(Buffer.from("Plants make food."), "notes.txt")).toBe("txt");
    expect(await svc.detectType(Buffer.from("# Plants"), "notes.md")).toBe("md");
    expect(await svc.detectType(Buffer.from("no extension"), "notes")).toBe("txt");
    await expect(svc.detectType(Buffer.alloc(0), "a.txt")).rejects.toMatchObject({ status: 400 });
    await expect(svc.detectType(Buffer.alloc(20 * 1024 * 1024 + 1, 97), "big.txt")).rejects.toMatchObject({ status: 413 });
  });
});

describe("extraction", () => {
  it("extracts plain text with the hash, language and no page count", async () => {
    const buf = Buffer.from("Plants make their own food using light.\r\n\r\n\r\n\r\nSecond paragraph.");
    const out = await svc.extract(buf, "txt");
    expect(out).toMatchObject({ type: "txt", pages: null, detectedLocale: "en", sha256: sha256Hex(buf) });
    expect(out.text).not.toContain("\r");
    expect(out.text).not.toMatch(/\n{3}/);
  });

  it("extracts PPTX slides in numeric order with page markers", async () => {
    const slide = (t: string) => `<p:sld><a:t>${t}</a:t><a:t>second &amp; run</a:t></p:sld>`;
    const buf = await zipWith({
      "ppt/presentation.xml": "<p/>",
      "ppt/slides/slide10.xml": slide("Ten"),
      "ppt/slides/slide2.xml": slide("Two"),
      "ppt/slides/slide1.xml": slide("One"),
    });
    const out = await svc.extract(buf, "pptx");
    expect(out.pages).toBe(3);
    expect(out.text.indexOf("[[page 1]]")).toBeLessThan(out.text.indexOf("[[page 2]]"));
    expect(out.text).toMatch(/\[\[page 1\]\]\nOne second & run/);
    expect(out.text).toMatch(/\[\[page 3\]\]\nTen/);
  });

  it("detects Arabic by script ratio", async () => {
    expect(detectLocale("التمثيل الضوئي هو العملية التي تصنع بها النباتات غذاءها")).toBe("ar");
    expect(detectLocale("Photosynthesis with one word التمثيل")).toBe("en");
    expect(detectLocale("12345")).toBe("en");
    expect((await svc.extract(Buffer.from("النباتات تصنع غذاءها بنفسها من الضوء والماء"), "txt")).detectedLocale).toBe("ar");
  });

  it("scanned PDFs go to the AI transcription; demo mode returns nothing and the upload is refused", async () => {
    const pdf = jest.spyOn(svc as unknown as { pdfText: () => Promise<{ text: string; pages: number; read: number }> }, "pdfText").mockResolvedValue({ text: "", pages: 3, read: 3 });
    const long = "[[page 1]]\n" + "Transcribed text from the scan. ".repeat(20);
    const ai = { transcribePdf: jest.fn().mockResolvedValue(long), countTokens: jest.fn().mockResolvedValue(42) };
    const out = await svc.extract(pdfBytes, "pdf", ai);
    expect(ai.transcribePdf).toHaveBeenCalled();
    expect(out.text).toContain("Transcribed text");
    expect(out.pages).toBe(3);
    await expect(svc.extract(pdfBytes, "pdf", { transcribePdf: jest.fn().mockResolvedValue(""), countTokens: jest.fn() })).rejects.toMatchObject({ status: 400 });
    pdf.mockResolvedValue({ text: `[[page 1]]\n${"Enough real text. ".repeat(20)}`, pages: 1, read: 1 });
    const direct = { transcribePdf: jest.fn(), countTokens: jest.fn().mockResolvedValue(1) };
    await svc.extract(pdfBytes, "pdf", direct);
    expect(direct.transcribePdf).not.toHaveBeenCalled();
    pdf.mockRestore();
  });

  it("counts tokens through the provider, falling back to characters / 4", async () => {
    const withAi = await svc.extract(Buffer.from("x".repeat(400)), "txt", { transcribePdf: jest.fn(), countTokens: jest.fn().mockResolvedValue(77) });
    expect(withAi.tokenCount).toBe(77);
    expect((await svc.extract(Buffer.from("x".repeat(400)), "txt")).tokenCount).toBe(100);
  });

  it("strips page numbers and repeated headers/footers, fixes hyphenation, chunks with overlap", () => {
    const pages = [1, 2, 3, 4].map((n) => ["ACME Science Reader", `Body text of page ${n} is unique`, String(n)]);
    const out = stripPageFurniture(pages);
    expect(out.every((p) => p.length === 1 && p[0].startsWith("Body text"))).toBe(true);
    expect(cleanText("photo-\nsynthesis is key")).toBe("photosynthesis is key");
    const chunks = chunkText(("word ".repeat(40) + "\n\n").repeat(10), 500, 50);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 520)).toBe(true);
    expect(chunkText("short", 500)).toEqual(["short"]);
  });

  it("page range parsing", () => {
    expect(parsePageRange("12-40")).toEqual([12, 40]);
    expect(parsePageRange(undefined)).toBeNull();
    expect(() => parsePageRange("40-12")).toThrow();
    expect(() => parsePageRange("abc")).toThrow();
  });

  it("does not store the original without a blob token", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect(await svc.storeOriginal(Buffer.from("x"), "k")).toBeNull();
  });

  it("helpers", () => {
    expect(extensionOf("a.b.PDF")).toBe("pdf");
    expect(extensionOf("noext")).toBe("");
    expect(cleanText("a  \n\n\n\nb\r\n")).toBe("a\n\nb");
  });
});
