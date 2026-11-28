"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { DUR, IS_TEST } from "@/lib/motion";

const TABBABLE = 'button:not([disabled]), a[href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog: focus moves in, Escape, the backdrop and the close button leave, Tab stays inside. Long content scrolls inside.
 * It leaves with a short exit (the `.closing` class, 160 ms, faster than the entrance) and only then calls `onClose`; under
 * reduced motion, and in tests, it closes at once. A caller that unmounts it itself simply skips the exit.
 */
export function Dialog({ title, onClose, children, wide, drawer }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; drawer?: boolean }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const [closing, setClosing] = useState(false);
  const closeRef = useRef(onClose);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (timer.current) return;
    if (reduce || IS_TEST) return closeRef.current();
    setClosing(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      closeRef.current();
      setClosing(false); // a caller that keeps the dialog open (it vetoed the close) gets it back
    }, DUR.exit * 1000);
  }, [reduce]);

  useEffect(() => {
    opener.current = document.activeElement;
    ref.current?.querySelector<HTMLElement>("[data-autofocus], input, textarea, select, button, a[href]")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") return requestClose();
      if (event.key !== "Tab" || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(TABBABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    // A press on the backdrop itself (not inside the dialog) closes it; Esc and the close button remain the keyboard routes.
    const overlay = ref.current?.parentElement ?? null;
    const onBackdrop = (event: MouseEvent) => {
      if (event.target === overlay) requestClose();
    };
    document.addEventListener("keydown", onKey);
    overlay?.addEventListener("mousedown", onBackdrop);
    return () => {
      document.removeEventListener("keydown", onKey);
      overlay?.removeEventListener("mousedown", onBackdrop);
      if (timer.current) clearTimeout(timer.current);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [requestClose]);

  return (
    <div className={`ovl ${drawer ? "drawer-ovl" : ""} ${closing ? "closing" : ""}`}>
      <div ref={ref} className={`dlg app-dlg ${wide ? "wide" : ""} ${drawer ? "drawer" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="dlg-head">
          <h2>{title}</h2>
          <button type="button" className="rbtn" aria-label={t("common.close")} onClick={requestClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="dlg-body">{children}</div>
      </div>
    </div>
  );
}
