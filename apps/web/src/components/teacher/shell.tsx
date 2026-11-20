"use client";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Users } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { ApiError } from "@/lib/api";
import { initials } from "@/lib/format";
import { LocaleScopeProvider, useI18n } from "@/lib/i18n";
import { useClasses, useMe } from "@/lib/queries";
import { Dialog } from "@/components/ui/dialog";
import { LanguageSwitch } from "@/components/ui/language-switch";
import { Logo } from "@/components/ui/logo";
import { ToastProvider } from "@/components/ui/toast";
import { ClassManager } from "./class-manager";

interface ClassSelection {
  classId: string | null;
  setClassId: (id: string) => void;
}

const SelectionContext = createContext<ClassSelection>({ classId: null, setClassId: () => undefined });
export const useSelectedClassId = () => useContext(SelectionContext);

const STORAGE_KEY = "helpo:class";

/** Two screens only (Create, Lesson workspace): a slim header, then a viewport-sized stage that never scrolls the page. */
export function TeacherShell({ children }: { children: ReactNode }) {
  return (
    <LocaleScopeProvider scope="teacher">
      <ShellInner>{children}</ShellInner>
    </LocaleScopeProvider>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const classes = useClasses();
  const [stored, setStored] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from localStorage after mount
    setStored(window.localStorage.getItem(STORAGE_KEY));
  }, []);

  useEffect(() => {
    if (me.error instanceof ApiError && me.error.isUnauthorized) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [me.error, pathname, router]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const classList = classes.data ?? [];
  const classId = classList.some((c) => c.id === stored) ? stored : (classList[0]?.id ?? null);
  const setClassId = useCallback((id: string) => {
    setStored(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  }, []);
  const selection = useMemo(() => ({ classId, setClassId }), [classId, setClassId]);
  const name = me.data?.name ?? "";

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    router.replace("/login");
  }

  return (
    <div className="tapp app-shell">
      <a className="skip-link" href="#main">{t("common.skip")}</a>
      <div className="blobs" aria-hidden="true"><i /><i /><i /></div>
      <header className="app-head">
        <Logo href="/app" label={t("shell.logo.home")} />
        <span className="sp" />
        <LanguageSwitch />
        <div className="avmenu" ref={menuRef}>
          <button type="button" className="av" aria-expanded={menuOpen} aria-controls="account-menu" aria-label={t("nav.account", { initials: initials(name || "Teacher") })} onClick={() => setMenuOpen((v) => !v)}>
            {initials(name || "Teacher")}
          </button>
          {menuOpen && (
            <div id="account-menu" className="avpop">
              <p>
                <b>{name || t("nav.yourAccount")}</b>
                {me.data?.school ? <span className="muted small">{me.data.school.name}</span> : null}
              </p>
              <button type="button" className="btn sm sec" onClick={() => { setMenuOpen(false); setManage(true); }}>
                <Users className="ic" aria-hidden="true" />
                {t("classes.manage")}
              </button>
              <button type="button" className="btn sm sec" onClick={() => void signOut()}>
                <LogOut className="ic" aria-hidden="true" />
                {t("nav.signOut")}
              </button>
            </div>
          )}
        </div>
      </header>
      <ToastProvider>
        <SelectionContext.Provider value={selection}>
          <main id="main" tabIndex={-1} className="app-stage">
            {children}
          </main>
          {manage && (
            <Dialog title={t("classes.title")} onClose={() => setManage(false)} wide>
              <ClassManager />
            </Dialog>
          )}
        </SelectionContext.Provider>
      </ToastProvider>
    </div>
  );
}
