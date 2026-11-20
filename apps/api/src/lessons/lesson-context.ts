import type { Locale } from "@helpo/shared";
import type { LessonContext } from "../ai/ai.provider";
import { asLocale, pickText } from "../common/i18n";
import { objectivesOf } from "../common/views";
import { parseBlueprint, type LessonWithClass } from "./lesson-view.service";

/** The lesson as the AI sees it: always in `locale` (default: the language the kit was created in). */
export function lessonContext(lesson: LessonWithClass, locale: Locale = asLocale(lesson.contentLocale)): LessonContext {
  return {
    title: pickText(lesson.titleEn, lesson.titleAr, locale) ?? "",
    grade: lesson.classRoom.grade,
    band: lesson.classRoom.band,
    locale,
    language: locale === "ar" ? "Arabic (Modern Standard Arabic)" : lesson.language,
    durationMin: lesson.durationMin,
    standard: lesson.standard,
    objectives: objectivesOf(lesson, locale),
    sourceText: lesson.sourceText ?? "",
    description: pickText(lesson.descriptionEn, lesson.descriptionAr, locale),
    blueprint: parseBlueprint(lesson.blueprint),
  };
}
