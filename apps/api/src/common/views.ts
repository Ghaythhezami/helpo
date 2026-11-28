import type { AiCheck, Resource, Student, StudentBadge } from "@prisma/client";
import {
  BADGES,
  ObjectiveSchema,
  levelForXp,
  migrateSlides,
  type BadgeKey,
  type CheckView,
  type ClassSettings,
  type ClassSummary,
  type Locale,
  type Objective,
  type ResourceView,
  type StudentSummary,
  type Translations,
} from "@helpo/shared";
import { z } from "zod";
import { pickJson, pickText } from "./i18n";

export function toClassSummary(
  c: { id: string; name: string; grade: number; subjectEn: string; subjectAr: string | null; band: ClassSummary["band"]; _count: { students: number } },
  locale: Locale,
): ClassSummary {
  return { id: c.id, name: c.name, grade: c.grade, subject: pickText(c.subjectEn, c.subjectAr, locale) ?? c.subjectEn, band: c.band, studentCount: c._count.students };
}

export function toClassSettings(c: {
  pointsEnabled: boolean;
  teamsEnabled: boolean;
  soundsEnabled: boolean;
  celebrationsEnabled: boolean;
  weeklyGoalXp: number;
}): ClassSettings {
  return {
    pointsEnabled: c.pointsEnabled,
    teamsEnabled: c.teamsEnabled,
    soundsEnabled: c.soundsEnabled,
    celebrationsEnabled: c.celebrationsEnabled,
    weeklyGoalXp: c.weeklyGoalXp,
  };
}

export function isBadgeKey(key: string): key is BadgeKey {
  return key in BADGES;
}

export function toStudentSummary(s: Student & { badges: Pick<StudentBadge, "badge">[] }): StudentSummary {
  return {
    id: s.id,
    displayName: s.displayName,
    fullName: s.fullName,
    xp: s.xp,
    level: levelForXp(s.xp).level,
    streakDays: s.streakDays,
    badges: s.badges.map((b) => b.badge).filter(isBadgeKey),
  };
}

export function parseObjectivesJson(json: unknown): Objective[] {
  const r = z.array(ObjectiveSchema).safeParse(json);
  return r.success ? r.data : [];
}

/** Objectives in the requested language (falls back to the other one when empty). */
export function objectivesOf(lesson: { objectivesEn: unknown; objectivesAr: unknown }, locale: Locale): Objective[] {
  return parseObjectivesJson(pickJson<unknown>(lesson.objectivesEn, lesson.objectivesAr, locale).value ?? []);
}

export function lessonTitle(l: { titleEn: string | null; titleAr: string | null }, locale: Locale): string {
  return pickText(l.titleEn, l.titleAr, locale) ?? "";
}

/** Resource content in the requested language, plus which language it actually is in. */
export function contentOf<T = unknown>(r: Pick<Resource, "contentEn" | "contentAr">, locale: Locale): { content: T | null; locale: Locale | null } {
  const p = pickJson<T>(r.contentEn, r.contentAr, locale);
  return { content: p.value, locale: p.locale };
}

export function toResourceView(r: Resource, locale: Locale, lessonTranslations: Translations): ResourceView {
  const picked = contentOf<ResourceView["content"]>(r, locale);
  // slides saved before slides.v2 get the new fields (null) and their text lifted into them
  if (r.kind === "SLIDES") picked.content = migrateSlides(picked.content);
  const state = (has: boolean, l: Locale) => (has ? "ready" : lessonTranslations[l] === "working" ? "working" : "missing");
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    error: r.error,
    content: picked.content,
    contentLocale: picked.locale,
    translations: { en: state(r.contentEn !== null, "en"), ar: state(r.contentAr !== null, "ar") },
    updatedAt: r.updatedAt.toISOString(),
    version: r.version,
    progress: r.progress,
    promptVersion: r.promptVersion,
    model: r.model,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
  };
}

export function toCheckView(c: AiCheck, locale: Locale): CheckView {
  return {
    id: c.id,
    resource: c.resource,
    itemRef: c.itemRef,
    kind: c.kind,
    message: pickText(c.messageEn, c.messageAr, locale) ?? "",
    suggestion: pickText(c.suggestionEn, c.suggestionAr, locale),
    sourcePage: c.sourcePage,
    status: c.status,
  };
}
