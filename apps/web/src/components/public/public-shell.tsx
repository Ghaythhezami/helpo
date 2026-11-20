"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { LocaleScopeProvider, useI18n } from "@/lib/i18n";
import { LanguageSwitch } from "@/components/ui/language-switch";
import { Logo } from "@/components/ui/logo";
import { Illus } from "@/components/ui/illus";

/** Themed wrapper for public pages (landing, sign-in, sign-up). */
export function PublicShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <LocaleScopeProvider scope="public">
    <div className="tapp">
      <a className="skip-link" href="#main">
        {t("common.skip")}
      </a>
      <div className="blobs" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="page">
        <header className="top public-top">
          <Logo href="/" label={t("shell.logo.home")} />
          <span />
          <nav className="who" aria-label={t("nav.main")}>
            <LanguageSwitch />
            <Link className="btn sm sec" href="/join">
              {t("landing.cta.join")}
            </Link>
            <Link className="btn sm" href="/login">
              {t("landing.cta.signin")}
            </Link>
          </nav>
        </header>
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <footer className="foot">
          <Illus name="level-star" size={30} />
          <span>{t("landing.tagline")}</span>
          <Illus name="level-star" size={30} />
        </footer>
      </div>
    </div>
    </LocaleScopeProvider>
  );
}
