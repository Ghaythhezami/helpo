import type { CSSProperties } from "react";
import { clamp01 } from "@/lib/format";

/**
 * Progress bar. The fill is full width and scaled with transform (cheap, compositor-only),
 * never by animating `width`.
 */
export function Progress({
  value,
  max = 1,
  label,
  large,
  className = "",
  valueText,
}: {
  value: number;
  max?: number;
  label: string;
  large?: boolean;
  className?: string;
  valueText?: string;
}) {
  const fraction = max > 0 ? clamp01(value / max) : 0;
  const style = { width: "100%", transform: `scaleX(${fraction})`, transformOrigin: "var(--origin-start)", transition: "transform .8s cubic-bezier(.16,1,.3,1)", ["--p" as string]: fraction } as CSSProperties;
  return (
    <div
      className={`bar ${large ? "lg" : ""} ${className}`.trim()}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value * 100) / 100}
      aria-valuetext={valueText}
    >
      <i style={style} />
    </div>
  );
}
