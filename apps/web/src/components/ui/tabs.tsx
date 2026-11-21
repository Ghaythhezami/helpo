"use client";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

export interface TabItem {
  id: string;
  label: ReactNode;
  className?: string;
  badge?: number;
  /** Plain-text name for assistive tech when the label contains extra markup. */
  name?: string;
}

export const tabDomId = (group: string, id: string) => `${group}-tab-${id}`;
export const panelDomId = (group: string, id: string) => `${group}-panel-${id}`;

/** Roving-tabindex tab list (arrow keys, Home and End). Render the matching role=tabpanel yourself. */
export function Tabs({ group, tabs, value, onChange, label }: { group: string; tabs: TabItem[]; value: string; onChange: (id: string) => void; label: string }) {
  const { t, dir } = useI18n();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((t) => t.id === value);
    let next = index;
    // Arrow keys follow the reading direction: in RTL the left arrow moves forward.
    const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
    const back = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
    if (event.key === forward) next = (index + 1) % tabs.length;
    else if (event.key === back) next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[next].id);
    refs.current[tabs[next].id]?.focus();
  }

  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          ref={(el) => {
            refs.current[tab.id] = el;
          }}
          type="button"
          role="tab"
          id={tabDomId(group, tab.id)}
          className={`tab ${tab.className ?? ""}`.trim()}
          aria-controls={panelDomId(group, tab.id)}
          aria-selected={tab.id === value}
          tabIndex={tab.id === value ? 0 : -1}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.badge ? (
            <span className="n">
              {tab.badge}
              <span className="sr"> {t("tabs.toCheck")}</span>
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
