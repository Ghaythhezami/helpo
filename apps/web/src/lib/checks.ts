import { RESOURCE_KINDS, type CheckView, type ResourceKind, type ResourceView } from "@helpo/shared";
import { tn, type MessageKey, type TFunction } from "./messages";
import type { CardsContent, GameContent, QuizContent, SlidesContent, WorksheetContent } from "@helpo/shared";

export type ChipTone = "ready" | "chk" | "neu" | "soft";

export function openChecks(checks: CheckView[]): CheckView[] {
  return checks.filter((c) => c.status === "OPEN");
}

export function openChecksByResource(checks: CheckView[]): Record<ResourceKind, number> {
  const out = Object.fromEntries(RESOURCE_KINDS.map((k) => [k, 0])) as Record<ResourceKind, number>;
  for (const c of openChecks(checks)) out[c.resource] += 1;
  return out;
}

/** The next open check after `afterId` (wrapping), or null when everything is resolved. */
export function nextOpenCheck(checks: CheckView[], afterId?: string | null): CheckView | null {
  const open = openChecks(checks);
  if (open.length === 0) return null;
  if (!afterId) return open[0];
  const order = checks.map((c) => c.id);
  const from = order.indexOf(afterId);
  return open.find((c) => order.indexOf(c.id) > from) ?? open[0];
}

export function checkSummary(checks: CheckView[]): { total: number; resolved: number; open: number } {
  const open = openChecks(checks).length;
  return { total: checks.length, open, resolved: checks.length - open };
}

export function resourceMeta(resource: ResourceView, t: TFunction): string {
  const content = resource.content;
  if (!content) return resource.status === "FAILED" ? t("resource.failed") : t("resource.notMade");
  switch (resource.kind) {
    case "SLIDES":
      return tn(t, "meta.slides", (content as SlidesContent).slides.length);
    case "WORKSHEET":
      return tn(t, "meta.activities", (content as WorksheetContent).sections.length);
    case "QUIZ":
      return tn(t, "meta.questions", (content as QuizContent).questions.length);
    case "GAME":
      return tn(t, "meta.pairs", (content as GameContent).pairs.length);
    case "CARDS":
      return tn(t, "meta.cards", (content as CardsContent).cards.length);
  }
}

export function resourceChip(resource: ResourceView, openCount: number, t: TFunction): { label: string; tone: ChipTone } {
  switch (resource.status) {
    case "WAITING":
      return { label: t("status.waiting"), tone: "neu" };
    case "WORKING":
      return { label: t("status.working"), tone: "soft" };
    case "FAILED":
      return { label: t("common.tryAgain"), tone: "chk" };
    case "READY":
      return openCount > 0 ? { label: t("status.toCheck", { n: openCount }), tone: "chk" } : { label: t("status.ready"), tone: "ready" };
  }
}

export const RESOURCE_CARD_CLASS: Record<ResourceKind, string> = {
  SLIDES: "c-blue",
  WORKSHEET: "c-lilac",
  QUIZ: "c-mint",
  GAME: "c-butter",
  CARDS: "c-peri",
};

export const RESOURCE_ART: Record<ResourceKind, string> = {
  SLIDES: "res-slides",
  WORKSHEET: "res-worksheet",
  QUIZ: "res-quiz",
  GAME: "res-game",
  CARDS: "res-cards",
};

export function resourceOf(resources: ResourceView[], kind: ResourceKind): ResourceView | undefined {
  return resources.find((r) => r.kind === kind);
}

/** Sentence for the check kit list: "Quiz: 2 to check" or "Slides are ready". */
export function checkListLine(kind: ResourceKind, resource: ResourceView | undefined, openCount: number, t: TFunction): string {
  const label = t(`resource.${kind}` as MessageKey);
  if (!resource || resource.status === "FAILED") return t("checklist.failed", { name: label });
  if (resource.status !== "READY") return t("checklist.working", { name: label });
  if (openCount > 0) return t("checklist.toCheck", { name: label, n: openCount });
  return t("checklist.ready", { name: label });
}

/** Download formats per resource (the API refuses other combinations). */
export function exportOptions(kind: ResourceKind): { format: "pptx" | "docx" | "pdf"; key?: boolean }[] {
  switch (kind) {
    case "SLIDES":
      return [{ format: "pptx" }, { format: "pdf" }];
    case "WORKSHEET":
      return [{ format: "docx" }, { format: "pdf" }];
    case "QUIZ":
      return [{ format: "pdf", key: false }, { format: "pdf", key: true }, { format: "docx" }];
    case "CARDS":
      return [{ format: "pdf" }];
    case "GAME":
      return [];
  }
}
