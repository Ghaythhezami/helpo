"use client";
import Link from "next/link";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useI18n } from "@/lib/i18n";
import { SPRING } from "@/lib/motion";
import { AnimatedIcon, type AnimatedIconName } from "@/components/ui/animated-icons";

export interface NavProps {
  pathname: string;
  isAdmin: boolean;
  /** Called after any item is used (closes the drawer on phones). */
  onNavigate?: () => void;
  onOpenLessons: () => void;
  onOpenClasses: () => void;
}

function Item({ icon, label, href, onClick, current }: { icon: AnimatedIconName; label: string; href?: string; onClick?: () => void; current?: boolean }) {
  const reduce = useReducedMotion();
  // Hover or focus plays the icon once (lucide-animated); the current item carries one shared pill that slides between items.
  const [hot, setHot] = useState(false);
  const hover = { onPointerEnter: () => setHot(true), onPointerLeave: () => setHot(false), onFocus: () => setHot(true), onBlur: () => setHot(false) };
  const body = (
    <>
      {current && <motion.span layoutId="nav-pill" className="nav-pill" aria-hidden="true" transition={reduce ? { duration: 0 } : SPRING.snappy} />}
      <span className="ri-ic" aria-hidden="true"><AnimatedIcon name={icon} size={20} play={hot} /></span>
      <span className="ri-lbl">{label}</span>
    </>
  );
  if (href) {
    return (
      <Link className="nav-item" href={href} aria-current={current ? "page" : undefined} onClick={onClick} {...hover}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" className="nav-item" onClick={onClick} {...hover}>
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
      <Item icon="plus" label={t("nav.newLesson")} href="/app" current={pathname === "/app"} onClick={onNavigate} />
      <Item icon="bookOpen" label={t("menu.lessons")} onClick={done(onOpenLessons)} />
      <Item icon="users" label={t("nav.classesShort")} onClick={done(onOpenClasses)} />
      {isAdmin && <Item icon="shieldCheck" label={t("nav.admin")} href="/admin" current={pathname.startsWith("/admin")} onClick={onNavigate} />}
    </nav>
  );
}
