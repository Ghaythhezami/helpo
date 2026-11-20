import { Injectable } from "@nestjs/common";
import type { AiCheck, Prisma } from "@prisma/client";
import type { CheckStatus, CheckView, Locale } from "@helpo/shared";
import { getItemText, setItemText, type ResourceContent } from "../ai/content";
import { pickText, suffix } from "../common/i18n";
import { badRequest, notFound } from "../common/problem";
import { contentOf, toCheckView } from "../common/views";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ChecksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ACCEPTED applies the suggestion, EDITED applies the teacher's text, DISMISSED leaves the content alone,
   * OPEN is undo: the original text is restored. The previous text is kept on the check so undo is exact.
   * Texts are applied to the language the teacher is looking at (the request locale, or the fallback language).
   */
  async resolve(teacherId: string, id: string, status: CheckStatus, locale: Locale, editedText?: string): Promise<CheckView> {
    const check = await this.prisma.aiCheck.findFirst({ where: { id, lesson: { teacherId } } });
    if (!check) throw notFound("Check");
    const resource = await this.prisma.resource.findUnique({ where: { lessonId_kind: { lessonId: check.lessonId, kind: check.resource } } });
    const picked = resource ? contentOf<ResourceContent>(resource, locale) : { content: null, locale: null };
    const cl: Locale = picked.locale ?? locale;
    const s = suffix(cl);
    let content = picked.content;
    let changed = false;

    let replacement: string | null = null;
    if (status === "ACCEPTED") {
      const suggestion = pickText(check.suggestionEn, check.suggestionAr, cl);
      if (!suggestion) throw badRequest("This check has no suggestion to accept. Edit the text instead.");
      replacement = suggestion;
    } else if (status === "EDITED") {
      if (!editedText?.trim()) throw badRequest("Send the edited text.");
      replacement = editedText;
    }

    let originalText = (cl === "en" ? check.originalTextEn : check.originalTextAr) ?? null;
    if (content) {
      if (replacement !== null) {
        const current = originalText ?? getItemText(check.resource, content, check.itemRef);
        const next = setItemText(check.resource, content, check.itemRef, replacement);
        if (next) {
          originalText = current;
          content = next;
          changed = true;
        }
      } else if (originalText !== null) {
        // DISMISSED or OPEN: put the original text back if a previous accept/edit changed it.
        const restored = setItemText(check.resource, content, check.itemRef, originalText);
        if (restored) {
          content = restored;
          changed = true;
        }
        originalText = null;
      }
    }

    const data = {
      status,
      [`editedText${s}`]: status === "EDITED" ? editedText : null,
      [`originalText${s}`]: originalText,
      resolvedAt: status === "OPEN" ? null : new Date(),
    } as Prisma.AiCheckUpdateInput;
    const ops: Prisma.PrismaPromise<unknown>[] = [this.prisma.aiCheck.update({ where: { id: check.id }, data })];
    if (resource && content && changed) {
      ops.push(this.prisma.resource.update({ where: { id: resource.id }, data: { [`content${s}`]: content as unknown as Prisma.InputJsonValue } as Prisma.ResourceUpdateInput }));
    }
    const [updated] = await this.prisma.$transaction(ops);
    return toCheckView(updated as AiCheck, locale);
  }
}
