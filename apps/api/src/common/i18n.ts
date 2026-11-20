import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  isLocale,
  otherLocale,
  pickLocalized,
  resolveLocale,
  type Locale,
  type Translations,
  type TranslationState,
} from "@helpo/shared";
import { parseCookies } from "./student-cookie";

/** x-helpo-locale header, else the helpo_locale cookie, else "en". */
export function localeOf(req: Pick<Request, "headers">): Locale {
  const header = req.headers[LOCALE_HEADER];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  if (fromHeader) return resolveLocale(fromHeader);
  const cookie = parseCookies(req.headers.cookie)[LOCALE_COOKIE];
  return cookie ? resolveLocale(cookie) : DEFAULT_LOCALE;
}

/** `@ReqLocale() locale: Locale` */
export const ReqLocale = createParamDecorator((_data: unknown, ctx: ExecutionContext): Locale => localeOf(ctx.switchToHttp().getRequest<Request>()));

export const suffix = (locale: Locale): "En" | "Ar" => (locale === "en" ? "En" : "Ar");

/** `{ titleEn: v }` or `{ titleAr: v }`: builds the single-language write for a column pair. */
export function writeCol(base: string, locale: Locale, value: unknown): Record<string, unknown> {
  return { [`${base}${suffix(locale)}`]: value };
}

export function pickText(en: string | null | undefined, ar: string | null | undefined, locale: Locale): string | null {
  return pickLocalized<string>({ en, ar }, locale).value;
}

const isEmptyJson = (v: unknown) => v === null || v === undefined || (Array.isArray(v) && v.length === 0);

/** Like pickText for Json columns: an empty array counts as "missing" so objectives fall back too. */
export function pickJson<T>(en: unknown, ar: unknown, locale: Locale): { value: T | null; locale: Locale | null } {
  const r = pickLocalized<unknown>({ en: isEmptyJson(en) ? null : en, ar: isEmptyJson(ar) ? null : ar }, locale);
  return { value: r.value as T | null, locale: r.locale };
}

const STATES: TranslationState[] = ["missing", "working", "ready"];

export function parseTranslations(json: unknown, contentLocale: Locale = "en"): Translations {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const state = (l: Locale): TranslationState => {
    const v = o[l];
    return STATES.includes(v as TranslationState) ? (v as TranslationState) : l === contentLocale ? "ready" : "missing";
  };
  return { en: state("en"), ar: state("ar") };
}

export function initialTranslations(contentLocale: Locale): Translations {
  return { en: contentLocale === "en" ? "ready" : "missing", ar: contentLocale === "ar" ? "ready" : "missing" };
}

export const asLocale = (v: unknown): Locale => (isLocale(v) ? v : DEFAULT_LOCALE);
export { otherLocale };
