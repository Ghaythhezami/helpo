"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/** Modal dialog: focus moves in, Escape and the close button leave, Tab stays inside. Long content scrolls inside it. */
export function Dialog({ title, onClose, children, wide, drawer }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; drawer?: boolean }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    ref.current?.querySelector<HTMLElement>("[data-autofocus], input, textarea, select, button, a[href]")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") return onClose();
      if (event.key !== "Tab" || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])')];
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
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  return (
    <div className={`ovl ${drawer ? "drawer-ovl" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`dlg app-dlg ${wide ? "wide" : ""} ${drawer ? "drawer" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="dlg-head">
          <h2>{title}</h2>
          <button type="button" className="rbtn" aria-label={t("common.close")} onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="dlg-body">{children}</div>
      </div>
    </div>
  );
}
