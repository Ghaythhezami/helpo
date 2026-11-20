import { DEFAULT_LOCALE, type Locale } from "@helpo/shared";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";

export type MessageKey = keyof typeof en;
type Dictionary = Record<string, string>;

const DICTIONARIES: Record<Locale, Dictionary> = { en: en as Dictionary, ar: ar as Dictionary };

export type Vars = Record<string, string | number>;

/** Looks a key up in the locale dictionary (falls back to English, then to the key) and fills {placeholders}. */
export function translate(locale: Locale, key: string, vars?: Vars): string {
  const template = DICTIONARIES[locale ?? DEFAULT_LOCALE][key] ?? DICTIONARIES.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`));
}

export type TFunction = (key: MessageKey, vars?: Vars) => string;

/** Count-aware lookup: uses "<key>.one" when n is 1, else "<key>". Arabic dictionaries provide their own wording. */
export function tn(t: TFunction, key: string, n: number, vars?: Vars): string {
  const k = (n === 1 && `${key}.one` in en ? `${key}.one` : key) as MessageKey;
  return t(k, { n, ...vars });
}
