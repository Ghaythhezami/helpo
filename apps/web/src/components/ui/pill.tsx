import type { ReactNode } from "react";
import { AlertTriangle, Check, Clock, Minus } from "lucide-react";

export type PillTone = "ready" | "chk" | "neu" | "soft";

const ICONS = { ready: Check, chk: AlertTriangle, neu: Minus, soft: Clock } as const;

/** Status pill: icon + text, never colour alone. */
export function Pill({ tone = "neu", icon = true, className = "", children }: { tone?: PillTone; icon?: boolean | ReactNode; className?: string; children: ReactNode }) {
  const Icon = ICONS[tone];
  return (
    <span className={`st ${tone} ${className}`.trim()}>
      {icon === true ? tone !== "soft" && <Icon className="ic" aria-hidden="true" /> : icon}
      {children}
    </span>
  );
}

export function Chip({ className = "", children }: { className?: string; children: ReactNode }) {
  return <span className={`chip ${className}`.trim()}>{children}</span>;
}
