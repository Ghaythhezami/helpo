import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@helpo/shared";
import { translate, type MessageKey } from "./messages";

export async function requestLocale(): Promise<Locale> {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(stored) ? stored : DEFAULT_LOCALE;
}

/** Page title in the visitor's language (the "· Nibras" template comes from the layout). */
export async function pageMetadata(key: MessageKey): Promise<Metadata> {
  return { title: translate(await requestLocale(), key) };
}

/** Layout-level defaults: the title template, a default title and the localized description. */
export async function layoutMetadata(key: MessageKey, withDescription = false): Promise<Metadata> {
  const locale = await requestLocale();
  return {
    title: { default: translate(locale, key), template: "%s · Nibras" },
    ...(withDescription ? { description: translate(locale, "meta.description") } : {}),
  };
}
