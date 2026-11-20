import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, isRtl, type Locale } from "@helpo/shared";
import { setApiLocale } from "./api";

export const LOCALE_MAX_AGE = 60 * 60 * 24 * 365;

export function localeDir(locale: Locale): "rtl" | "ltr" {
  return isRtl(locale) ? "rtl" : "ltr";
}

/** Reads the helpo_locale cookie from a cookie header string. */
export function localeFromCookie(cookieHeader: string | null | undefined): Locale {
  if (!cookieHeader) return DEFAULT_LOCALE;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LOCALE_COOKIE) {
      const value = decodeURIComponent(rest.join("="));
      return isLocale(value) ? value : DEFAULT_LOCALE;
    }
  }
  return DEFAULT_LOCALE;
}

/**
 * Applies a locale in the browser: cookie (read by the server layout), <html lang dir> and the
 * x-helpo-locale header used by every API call. Returns nothing; callers handle the server preference.
 */
export function applyLocale(locale: Locale, doc: Document = document): void {
  doc.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_MAX_AGE}; samesite=lax`;
  doc.documentElement.lang = locale;
  doc.documentElement.dir = localeDir(locale);
  setApiLocale(locale);
}
