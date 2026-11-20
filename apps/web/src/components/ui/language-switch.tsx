"use client";
import { LOCALES, LOCALE_LABELS, type Locale } from "@helpo/shared";
import { useI18n } from "@/lib/i18n";

/** "English / العربية" switch. Each option is announced in its own language. */
export function LanguageSwitch({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className={`langsw ${className}`.trim()} role="group" aria-label={t("lang.label")}>
      {LOCALES.map((code: Locale) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={locale === code}
          onClick={() => void setLocale(code)}
        >
          {LOCALE_LABELS[code]}
        </button>
      ))}
    </div>
  );
}
