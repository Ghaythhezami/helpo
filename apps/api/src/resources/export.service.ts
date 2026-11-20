import { Injectable } from "@nestjs/common";
import type { Locale, ResourceKind } from "@helpo/shared";
import { ProblemException, badRequest, notFound } from "../common/problem";
import { contentOf, lessonTitle } from "../common/views";
import { PrismaService } from "../prisma/prisma.service";
import { buildDocx, buildPdf, buildPptx, type AnyContent } from "./export.builders";

export type ExportFormat = "pptx" | "docx" | "pdf";

/** Which formats make sense for which resource. */
export const EXPORT_FORMATS: Record<ResourceKind, ExportFormat[]> = {
  SLIDES: ["pptx", "pdf"],
  WORKSHEET: ["docx", "pdf"],
  QUIZ: ["docx", "pdf"],
  CARDS: ["docx", "pdf"],
  GAME: ["docx", "pdf"],
};

const MIME: Record<ExportFormat, string> = {
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

export interface ExportFile {
  buffer: Buffer;
  filename: string;
  mime: string;
}

/** Download-safe name: "Nibras - <lesson> - <kind>.<ext>" (the Content-Disposition header carries an ASCII and a UTF-8 form). */
export function exportFilename(title: string, kind: ResourceKind, format: ExportFormat): string {
  const cleaned = title.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `Nibras - ${cleaned || "lesson"} - ${kind.toLowerCase()}.${format}`;
}

@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(teacherId: string, resourceId: string, format: ExportFormat, locale: Locale, includeKey = true): Promise<ExportFile> {
    const r = await this.prisma.resource.findFirst({
      where: { id: resourceId, lesson: { teacherId } },
      include: { lesson: { select: { titleEn: true, titleAr: true } } },
    });
    if (!r) throw notFound("Resource");
    if (!EXPORT_FORMATS[r.kind].includes(format)) {
      throw badRequest(`A ${r.kind.toLowerCase()} can be exported as ${EXPORT_FORMATS[r.kind].join(" or ")}.`);
    }
    const picked = contentOf<AnyContent>(r, locale);
    if (r.status !== "READY" || !picked.content) throw badRequest("This resource is not ready to export yet.");
    const exportLocale: Locale = picked.locale ?? locale;
    if (format === "pdf" && exportLocale === "ar") {
      throw new ProblemException(422, "Arabic PDF is not available yet", "Nibras cannot lay out Arabic in PDF files yet. Export this resource as Word (DOCX) for Arabic, or switch to English for a PDF.");
    }
    const title = lessonTitle(r.lesson, exportLocale);
    const input = { kind: r.kind, title, locale: exportLocale, content: picked.content, includeKey };
    const buffer = format === "pptx" ? await buildPptx(input) : format === "docx" ? await buildDocx(input) : await buildPdf(input);
    return { buffer, filename: exportFilename(title, r.kind, format), mime: MIME[format] };
  }
}

export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
