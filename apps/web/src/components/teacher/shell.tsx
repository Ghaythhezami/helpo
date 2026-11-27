"use client";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { ApiError } from "@/lib/api";
import { initials } from "@/lib/format";
import { LocaleScopeProvider, useI18n } from "@/lib/i18n";
import { useClasses, useLessons, useMe } from "@/lib/queries";
import { relockCandidate, lockGeneration, unlockGeneration, useGenerationLock } from "@/lib/generation-lock";
import { Dialog } from "@/components/ui/dialog";
import { LanguageSwitch } from "@/components/ui/language-switch";
import { Logo } from "@/components/ui/logo";
import { ToastProvider } from "@/components/ui/toast";
import { useMedia } from "@/lib/use-media";
import { ClassManager } from "./class-manager";
import { LessonsDialog } from "./lessons-dialog";
import { TopNavItems } from "./top-nav";
import { GenerationView } from "./generation-view";

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
  const lessons = useLessons();
  const lockId = useGenerationLock();
  const [revealing, setRevealing] = useState(false);
  const [stored, setStored] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const [lessonsOpen, setLessonsOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const desktop = useMedia("(min-width: 1024px)");
  const menuButton = useRef<HTMLButtonElement>(null);
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

  // Re-lock after a refresh or a second tab: a lesson that is still being made (and was started recently) holds the lock.
  useEffect(() => {
    if (lockId || !lessons.data) return;
    const found = relockCandidate(lessons.data);
    if (found) lockGeneration(found);
  }, [lockId, lessons.data]);

  // While locked, every other URL goes back to the generating lesson, and closing the tab warns.
  useEffect(() => {
    if (!lockId) return;
    const home = `/app/lessons/${lockId}`;
    if (pathname !== home) router.replace(home);
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [lockId, pathname, router]);

  const finishGeneration = useCallback(
    (id: string) => {
      unlockGeneration();
      setRevealing(true);
      window.setTimeout(() => setRevealing(false), 800);
      void queryClient.invalidateQueries({ queryKey: ["lessons"] });
      router.replace(`/app/lessons/${id}`);
    },
    [queryClient, router],
  );
  const cancelGeneration = useCallback(() => {
    unlockGeneration();
    router.replace("/app");
  }, [router]);

  async function signOut() {
    unlockGeneration();
    await authClient.signOut();
    queryClient.clear();
    router.replace("/login");
  }

  return (
    <div className="tapp app-shell">
      {lockId && <GenerationView lessonId={lockId} onFinished={finishGeneration} onCancelled={cancelGeneration} />}
      <div className="app-inert" inert={lockId ? true : undefined} aria-hidden={lockId ? true : undefined}>
      <a className="skip-link" href="#main">{t("common.skip")}</a>
      <div className="blobs" aria-hidden="true"><i /><i /><i /></div>
      <header className="app-head">
        {!desktop && (
          <button ref={menuButton} type="button" className="rbtn menu-btn" aria-expanded={drawer} aria-controls="drawer-menu" aria-label={t("menu.open")} onClick={() => setDrawer(true)}>
            <Menu className="ic" aria-hidden="true" />
          </button>
        )}
        <Logo href="/app" label={t("shell.logo.home")} />
        {desktop && (
          <TopNavItems pathname={pathname} isAdmin={me.data?.role === "ADMIN"} onOpenLessons={() => setLessonsOpen(true)} onOpenClasses={() => setManage(true)} />
        )}
        <span className="sp" />
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
              <LanguageSwitch />
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
          <div className="app-body">
            <main id="main" tabIndex={-1} className={`app-stage ${revealing ? "gen-reveal" : ""}`}>
              {children}
            </main>
          </div>
          {drawer && !desktop && (
            <Dialog title={t("menu.label")} onClose={() => setDrawer(false)} drawer>
              <div id="drawer-menu" className="drawer-menu">
                <TopNavItems pathname={pathname} isAdmin={me.data?.role === "ADMIN"} onNavigate={() => setDrawer(false)} onOpenLessons={() => setLessonsOpen(true)} onOpenClasses={() => setManage(true)} />
                <LanguageSwitch />
                <button type="button" className="btn sec" onClick={() => void signOut()}><LogOut className="ic" aria-hidden="true" />{t("nav.signOut")}</button>
              </div>
            </Dialog>
          )}
          {lessonsOpen && <LessonsDialog onClose={() => setLessonsOpen(false)} />}
          {manage && (
            <Dialog title={t("classes.title")} onClose={() => setManage(false)} wide>
              <ClassManager />
            </Dialog>
          )}
        </SelectionContext.Provider>
      </ToastProvider>
      </div>
    </div>
  );
}
