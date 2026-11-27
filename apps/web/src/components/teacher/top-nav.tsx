"use client";
import Link from "next/link";
import { BookOpen, FilePlus2, ShieldCheck, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

export interface NavProps {
  pathname: string;
  isAdmin: boolean;
  /** Called after any item is used (closes the drawer on phones). */
  onNavigate?: () => void;
  onOpenLessons: () => void;
  onOpenClasses: () => void;
}

function Item({ icon, label, href, onClick, current }: { icon: ReactNode; label: string; href?: string; onClick?: () => void; current?: boolean }) {
  const body = (
    <>
      <span className="ri-ic" aria-hidden="true">{icon}</span>
      <span className="ri-lbl">{label}</span>
    </>
  );
  if (href) {
    return (
      <Link className="nav-item" href={href} aria-current={current ? "page" : undefined} onClick={onClick}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" className="nav-item" onClick={onClick}>
      {body}
    </button>
  );
}

/**
 * The teacher and admin navigation: New lesson, My lessons, Classes, Admin. Nothing about the open lesson lives here (its
 * tabs, Share and Results belong to the workspace header), so no action appears twice. Rendered in the top bar on
 * desktop and as a vertical list in the phone drawer.
 */
export function TopNavItems({ pathname, isAdmin, onNavigate, onOpenLessons, onOpenClasses }: NavProps) {
  const { t } = useI18n();
  const done = (fn: () => void) => () => {
    fn();
    onNavigate?.();
  };
  return (
    <nav className="top-nav" aria-label={t("menu.label")}>
      <Item icon={<FilePlus2 className="ic" />} label={t("nav.newLesson")} href="/app" current={pathname === "/app"} onClick={onNavigate} />
      <Item icon={<BookOpen className="ic" />} label={t("menu.lessons")} onClick={done(onOpenLessons)} />
      <Item icon={<Users className="ic" />} label={t("nav.classesShort")} onClick={done(onOpenClasses)} />
      {isAdmin && <Item icon={<ShieldCheck className="ic" />} label={t("nav.admin")} href="/admin" current={pathname.startsWith("/admin")} onClick={onNavigate} />}
    </nav>
  );
}
