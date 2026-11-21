"use client";
import Link from "next/link";
import { RESOURCE_KINDS } from "@helpo/shared";
import { BookOpen, ChevronsLeft, Eye, ChevronsRight, FilePlus2, LogOut, Monitor, PanelLeftClose, PanelLeftOpen, Send, ShieldCheck, Users, BarChart3 } from "lucide-react";
import type { ReactNode } from "react";
import { RESOURCE_ART } from "@/lib/checks";
import { useI18n } from "@/lib/i18n";
import { Illus } from "@/components/ui/illus";
import { LanguageSwitch } from "@/components/ui/language-switch";
import { useWorkspaceInfo } from "./workspace-bridge";

export interface NavProps {
  pathname: string;
  isAdmin: boolean;
  collapsed?: boolean;
  /** Called after any item is used (closes the drawer on phones). */
  onNavigate?: () => void;
  onOpenLessons: () => void;
  onOpenClasses: () => void;
  onSignOut: () => void;
}

function Item({ icon, label, href, onClick, current, collapsed, pressed, sub }: { icon: ReactNode; label: string; href?: string; onClick?: () => void; current?: boolean; collapsed?: boolean; pressed?: boolean; sub?: boolean }) {
  const cls = `rail-item ${sub ? "sub" : ""}`;
  const body = (
    <>
      <span className="ri-ic" aria-hidden="true">{icon}</span>
      <span className={collapsed ? "sr" : "ri-lbl"}>{label}</span>
    </>
  );
  if (href) {
    return (
      <Link className={cls} href={href} aria-current={current ? "page" : undefined} title={collapsed ? label : undefined} onClick={onClick}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} aria-current={current ? "page" : undefined} aria-pressed={pressed} title={collapsed ? label : undefined} onClick={onClick}>
      {body}
    </button>
  );
}

/** The menu items, shared by the desktop rail and the phone drawer. */
export function NavItems({ pathname, isAdmin, collapsed, onNavigate, onOpenLessons, onOpenClasses, onSignOut }: NavProps) {
  const { t } = useI18n();
  const ws = useWorkspaceInfo();
  const done = (fn: () => void) => () => {
    fn();
    onNavigate?.();
  };
  return (
    <>
      <nav className="rail-nav" aria-label={t("menu.label")}>
        <Item icon={<FilePlus2 className="ic" />} label={t("menu.create")} href="/app" current={pathname === "/app"} collapsed={collapsed} onClick={onNavigate} />
        <Item icon={<BookOpen className="ic" />} label={t("menu.lessons")} onClick={done(onOpenLessons)} collapsed={collapsed} />
        {ws && (
          <div role="group" aria-label={t("menu.current", { title: ws.title })} className="rail-group">
            {!collapsed && <p className="rail-title" title={ws.title}>{ws.title}</p>}
            {RESOURCE_KINDS.map((k) => (
              <Item
                key={k}
                sub
                icon={<Illus name={RESOURCE_ART[k]} size={22} />}
                label={t(`resource.${k}` as "resource.SLIDES")}
                current={ws.tab === k && pathname.startsWith("/app/lessons/")}
                collapsed={collapsed}
                onClick={done(() => ws.setTab(k))}
              />
            ))}
            <Item sub icon={<Eye className="ic" />} label={t("preview.student")} href={`/app/lessons/${ws.lessonId}/preview`} collapsed={collapsed} onClick={onNavigate} />
            <Item sub icon={<Monitor className="ic" />} label={t("board.title")} pressed={ws.boardOpen} collapsed={collapsed} onClick={done(ws.toggleBoard)} />
            <Item sub icon={<Send className="ic flip" />} label={t("steps.share")} collapsed={collapsed} onClick={done(ws.openShare)} />
            <Item sub icon={<BarChart3 className="ic" />} label={t("steps.results")} collapsed={collapsed} onClick={done(ws.openResults)} />
          </div>
        )}
        <Item icon={<Users className="ic" />} label={t("classes.manage")} onClick={done(onOpenClasses)} collapsed={collapsed} />
        {isAdmin && <Item icon={<ShieldCheck className="ic" />} label={t("nav.admin")} href="/admin" current={pathname.startsWith("/admin")} collapsed={collapsed} onClick={onNavigate} />}
      </nav>
      <div className="rail-foot">
        {!collapsed && <LanguageSwitch />}
        <Item icon={<LogOut className="ic flip" />} label={t("nav.signOut")} collapsed={collapsed} onClick={done(onSignOut)} />
      </div>
    </>
  );
}

/** Slim collapsible rail on the start side (left in English, right in Arabic). */
export function SideRail({ collapsed, onToggle, ...nav }: NavProps & { collapsed: boolean; onToggle: () => void }) {
  const { t, dir } = useI18n();
  const Toggle = collapsed ? (dir === "rtl" ? ChevronsLeft : ChevronsRight) : dir === "rtl" ? ChevronsRight : ChevronsLeft;
  return (
    <aside className={`rail ${collapsed ? "collapsed" : ""}`} aria-label={t("menu.label")}>
      <button type="button" className="rail-toggle" aria-expanded={!collapsed} aria-controls="rail-body" onClick={onToggle} title={collapsed ? t("menu.expand") : t("menu.collapse")}>
        {collapsed ? <PanelLeftOpen className="ic flip" aria-hidden="true" /> : <PanelLeftClose className="ic flip" aria-hidden="true" />}
        <span className="sr">{collapsed ? t("menu.expand") : t("menu.collapse")}</span>
        <Toggle className="sr" aria-hidden="true" />
      </button>
      <div id="rail-body" className="rail-body">
        <NavItems {...nav} collapsed={collapsed} />
      </div>
    </aside>
  );
}
