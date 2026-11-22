"use client";
import { useEffect, useRef, type CSSProperties } from "react";
import { animate, useReducedMotion } from "motion/react";
import { DUR, EASE, IS_TEST } from "@/lib/motion";

/**
 * A number that counts up once on mount. The DOM text is the final value from the first paint
 * (so assistive tech, tests and reduced-motion users never see a wrong number); the count is a
 * visual flourish only and is skipped under prefers-reduced-motion.
 */
export function CountUp({ value, format = (n) => String(Math.round(n)), duration = 0.8 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const node = ref.current;
    if (!node || reduce || IS_TEST) return;
    const controls = animate(0, value, { duration, ease: EASE.out, onUpdate: (v) => void (node.textContent = format(v)) });
    return () => controls.stop();
    // format is a pure formatter; only a new value restarts the count
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce, duration]);
  return <span ref={ref} style={{ fontVariantNumeric: "tabular-nums" }}>{format(value)}</span>;
}

const CONFETTI_COLORS = ["#6035cf", "#ffc83d", "#2e8f63", "#ff7a59", "#4aa8ff"];

/**
 * A short, calm confetti burst for wins only. Pure CSS (transform and opacity), decorative (aria-hidden),
 * and hidden entirely under prefers-reduced-motion.
 */
export function Confetti({ pieces = 18 }: { pieces?: number }) {
  return (
    <span className="confetti-burst" aria-hidden="true">
      {Array.from({ length: pieces }, (_, i) => {
        const angle = (i / pieces) * Math.PI * 2 + (i % 2) * 0.3;
        const dist = 90 + (i % 4) * 28;
        const style = {
          "--dx": `${Math.round(Math.cos(angle) * dist)}px`,
          "--dy": `${Math.round(Math.sin(angle) * dist - 40)}px`,
          "--rot": `${(i * 67) % 360}deg`,
          "--cc": CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          animationDelay: `${(i % 5) * 30}ms`,
        } as CSSProperties;
        return <i key={i} style={style} />;
      })}
    </span>
  );
}

/** Skeleton shaped like the thing that is loading (never a spinner): `lines` text rows or a `block`. */
export function Skeleton({ lines = 0, block, className = "" }: { lines?: number; block?: { w?: number | string; h: number | string; r?: number }; className?: string }) {
  return (
    <span className={`sk ${className}`.trim()} aria-hidden="true">
      {block && <i className="sk-b" style={{ width: block.w ?? "100%", height: block.h, borderRadius: block.r ?? 14 }} />}
      {Array.from({ length: lines }, (_, i) => (
        <i key={i} className="sk-l" style={{ width: `${i === lines - 1 && lines > 1 ? 62 : 100 - (i % 3) * 8}%` }} />
      ))}
    </span>
  );
}

export { DUR };
