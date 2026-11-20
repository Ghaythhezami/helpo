"use client";
import { BRAND, type Band } from "@helpo/shared";
import type { ReactNode } from "react";
import { bandAttr } from "@/lib/band";
import { LocaleScopeProvider, useI18n } from "@/lib/i18n";
import { Logo } from "@/components/ui/logo";
import { LanguageSwitch } from "@/components/ui/language-switch";
import { ToastProvider } from "@/components/ui/toast";

/** The one student interface: a slim top bar and a viewport-sized stage. Long boards scroll inside the stage. */
export function StudentFrame({ children, band = "NAVIGATOR" }: { children: ReactNode; band?: Band; withHome?: boolean }) {
  return (
    <LocaleScopeProvider scope="student">
      <FrameInner band={band}>{children}</FrameInner>
    </LocaleScopeProvider>
  );
}

function FrameInner({ children, band }: { children: ReactNode; band: Band }) {
  const { t } = useI18n();
  return (
    <div className="sapp app-shell" data-band={bandAttr(band)}>
      <a className="skip-link" href="#main">{t("common.skip")}</a>
      <div className="blobs" aria-hidden="true"><i /><i /><i /></div>
      <header className="app-head">
        <Logo href="/join" label={t("student.logo", { name: BRAND.name })} />
        <span className="sp" />
        <LanguageSwitch />
      </header>
      <ToastProvider>
        <main id="main" tabIndex={-1} className="app-stage">
          {children}
        </main>
      </ToastProvider>
    </div>
  );
}
