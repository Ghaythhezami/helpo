"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { DEFAULT_LOCALE, type Locale } from "@helpo/shared";
import { translate, tn, type MessageKey, type TFunction, type Vars } from "./messages";
import { api, setApiLocale } from "./api";
import { applyLocale, localeDir } from "./locale";

interface I18nValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: TFunction;
  /** Switches language: cookie, <html lang dir>, API header, server preference, then refetches everything. */
  setLocale: (next: Locale) => Promise<void>;
}

interface ProviderValue extends Omit<I18nValue, "setLocale"> {
  switchLocale: (next: Locale, scope: LocaleScope) => Promise<void>;
}

const I18nContext = createContext<ProviderValue | null>(null);

export type LocaleScope = "teacher" | "student" | "public";

const ScopeContext = createContext<LocaleScope>("public");

/** Shells set the scope so the language switch saves the preference to the right endpoint. */
export function LocaleScopeProvider({ scope, children }: { scope: LocaleScope; children: ReactNode }) {
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>;
}

export function I18nProvider({ locale: initial, children }: { locale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initial);
  const router = useRouter();
  const queryClient = useQueryClient();
  setApiLocale(locale);

  const switchLocale = useCallback(
    async (next: Locale, scope: LocaleScope) => {
      if (next === locale) return;
      applyLocale(next);
      setLocaleState(next);
      if (scope !== "public") {
        try {
          await api(scope === "teacher" ? "/me/locale" : "/play/me/locale", { method: "PUT", body: { locale: next } });
        } catch {
          // The cookie and header already carry the choice; the saved preference catches up next time.
        }
      }
      await queryClient.invalidateQueries();
      router.refresh();
    },
    [locale, queryClient, router],
  );

  const value = useMemo<ProviderValue>(
    () => ({ locale, dir: localeDir(locale), t: (key, vars) => translate(locale, key, vars), switchLocale }),
    [locale, switchLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  const scope = useContext(ScopeContext);
  if (!ctx) {
    // Components used outside a provider (tests, isolated stories) render in English.
    return { locale: DEFAULT_LOCALE, dir: "ltr", t: (key, vars) => translate(DEFAULT_LOCALE, key, vars), setLocale: async () => undefined };
  }
  return { locale: ctx.locale, dir: ctx.dir, t: ctx.t, setLocale: (next) => ctx.switchLocale(next, scope) };
}

export const useT = () => useI18n().t;
export { translate, tn };
export type { MessageKey, TFunction, Vars };
