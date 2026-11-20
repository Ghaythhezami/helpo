import type { LessonDetail, Locale } from "@helpo/shared";

export type TranslationPhase = "ready" | "missing" | "working" | "failed";

type Translatable = Pick<LessonDetail, "translations" | "contentLocale" | "resources">;

/**
 * State machine for the "Translating this lesson" banner.
 *   ready   -> nothing to show (content exists in the viewer's language)
 *   missing -> the page starts POST /lessons/:id/translate once, then waits
 *   working -> calm banner with progress, fallback content stays visible
 *   failed  -> the start request failed, offer "Try again"
 */
export function translationPhase(lesson: Pick<LessonDetail, "translations">, locale: Locale, requestFailed = false): TranslationPhase {
  const state = lesson.translations[locale];
  if (state === "ready") return "ready";
  if (state === "working") return "working";
  return requestFailed ? "failed" : "missing";
}

/** True the first time a lesson is viewed in a language that has not been translated yet. */
export function shouldAutoTranslate(lesson: Pick<LessonDetail, "translations">, locale: Locale, alreadyRequested: boolean): boolean {
  return lesson.translations[locale] === "missing" && !alreadyRequested;
}

/** Fraction (0..1) of the kit already available in the viewer's language, used as banner progress. */
export function translationProgress(lesson: Translatable, locale: Locale): number {
  if (lesson.translations[locale] === "ready") return 1;
  const readyResources = lesson.resources.filter((r) => r.status === "READY");
  if (readyResources.length === 0) return 0.05;
  const done = readyResources.filter((r) => r.contentLocale === locale).length;
  return Math.max(0.05, Math.min(0.95, done / readyResources.length));
}

/** True when the visible text is in the other language (fallback), so a "Shown in English" chip makes sense. */
export function isFallback(contentLocale: Locale | null | undefined, locale: Locale): boolean {
  return Boolean(contentLocale) && contentLocale !== locale;
}

export function anyTranslationWorking(lesson: Pick<LessonDetail, "translations">): boolean {
  return Object.values(lesson.translations).includes("working");
}
