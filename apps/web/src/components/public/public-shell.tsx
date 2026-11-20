"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { LocaleScopeProvider, useI18n } from "@/lib/i18n";
import { LanguageSwitch } from "@/components/ui/language-switch";
import { Logo } from "@/components/ui/logo";

/** Themed wrapper for public pages (landing, sign-in, sign-up). */
export function PublicShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <LocaleScopeProvider scope="public">
    <div className="tapp app-shell public-shell">
      <a className="skip-link" href="#main">
        {t("common.skip")}
      </a>
      <div className="blobs" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <header className="app-head">
        <Logo href="/" label={t("shell.logo.home")} />
        <span className="sp" />
        <LanguageSwitch />
        <nav className="public-links" aria-label={t("nav.main")}>
          <Link className="btn sm sec" href="/join">{t("landing.cta.join")}</Link>
          <Link className="btn sm" href="/login">{t("landing.cta.signin")}</Link>
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="app-stage">
        {children}
      </main>
    </div>
    </LocaleScopeProvider>
  );
}
