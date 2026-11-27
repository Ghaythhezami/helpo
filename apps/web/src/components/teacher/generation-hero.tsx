"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, Gamepad2, Layers, ListChecks, Presentation, FileText, type LucideIcon } from "lucide-react";
import type { ResourceKind } from "@helpo/shared";
import type { GenerationStep } from "./generation-view";

const ICONS: Record<ResourceKind, LucideIcon> = { SLIDES: Presentation, WORKSHEET: FileText, QUIZ: ListChecks, CARDS: Layers, GAME: Gamepad2 };
const LAMP = { x: 180, y: 150 };
/** Five nodes on an arc above the lamp, left to right in generation order (mirrored by CSS in RTL). */
const NODES = [170, 130, 90, 50, 10].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return { x: Math.round(180 + 142 * Math.cos(a)), y: Math.round(150 - 112 * Math.sin(a)) };
});
const SPRING = { type: "spring", stiffness: 170, damping: 22, mass: 0.9 } as const;

/** True while the tab is visible: decorative loops pause in background tabs. */
export function useTabVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== "hidden");
    on();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}

function pathTo(i: number): string {
  const n = NODES[i];
  const cx = (n.x + LAMP.x) / 2 + (n.x < LAMP.x ? -18 : n.x > LAMP.x ? 18 : 0);
  const cy = (n.y + LAMP.y - 30) / 2;
  return `M${LAMP.x} ${LAMP.y - 30} Q${cx} ${cy} ${n.x} ${n.y + 22}`;
}

/**
 * The signature animation: a Nibras lamp whose light grows with the real progress. Each resource is a node on an arc; a
 * line of light is drawn from the lamp to it as that resource is made, the node's ring fills with its live percent and it
 * pops when done. Everything animates transform, opacity or stroke offset only. Reduced motion renders a static ring.
 */
export function GenerationHero({ steps, percent, analysisDone, finished, reduce, labels }: { steps: GenerationStep[]; percent: number; analysisDone: boolean; finished: boolean; reduce: boolean; labels: Record<ResourceKind, string> }) {
  const visible = useTabVisible();

  if (reduce) {
    return (
      <div className="gen-hero static" data-variant="static">
        <svg viewBox="0 0 120 120" role="img" aria-label={`${percent}%`}>
          <circle cx="60" cy="60" r="52" className="gh-ring-bg" />
          <circle cx="60" cy="60" r="52" className="gh-ring" pathLength={100} strokeDasharray={`${percent} 100`} transform="rotate(-90 60 60)" />
        </svg>
        <p className="gen-pct" aria-hidden="true">{percent}%</p>
      </div>
    );
  }

  const glow = 0.45 + (percent / 100) * 0.95;
  return (
    <div className={`gen-hero ${visible ? "" : "paused"}`} data-variant="animated">
      <svg viewBox="0 0 360 200" role="img" aria-label={`${percent}%`}>
        <defs>
          <radialGradient id="gh-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffd86b" stopOpacity="0.95" />
            <stop offset="45%" stopColor="#b39bff" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#6035cf" stopOpacity="0" />
          </radialGradient>
        </defs>

        <motion.circle cx={LAMP.x} cy={LAMP.y - 20} r="92" fill="url(#gh-glow)" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: glow, opacity: analysisDone || finished ? 0.95 : 0.55 }} transition={SPRING} style={{ transformOrigin: `${LAMP.x}px ${LAMP.y - 20}px` }} />

        {NODES.map((_, i) => {
          const s = steps[i];
          const drawn = s.status === "done" ? 1 : s.status === "working" ? Math.max(0.08, s.progress / 100) : 0;
          return (
            <g key={s.kind}>
              <path d={pathTo(i)} className="gh-line-bg" />
              <motion.path d={pathTo(i)} className={`gh-line ${s.status}`} initial={{ pathLength: 0 }} animate={{ pathLength: drawn }} transition={{ ...SPRING, stiffness: 90 }} />
            </g>
          );
        })}

        {!finished && (
          <g className="gh-particles" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <circle key={i} cx={LAMP.x - 24 + i * 8} cy={LAMP.y - 30} r={1.6 + (i % 3) * 0.5} style={{ ["--i" as string]: i }} />
            ))}
          </g>
        )}

        <g className="gh-lamp" aria-hidden="true">
          <path d="M152 168 Q180 190 208 168 Q212 152 180 150 Q148 152 152 168 Z" className="gh-shade" />
          <path d="M206 160 Q222 156 226 146 Q214 152 204 154 Z" className="gh-shade" />
          <rect x="166" y="176" width="28" height="6" rx="3" className="gh-base" />
          <motion.path d="M180 118 Q194 136 180 150 Q166 136 180 118 Z" className="gh-bulb" animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} style={{ transformOrigin: "180px 150px" }} />
        </g>

        {NODES.map((n, i) => {
          const s = steps[i];
          const Icon = ICONS[s.kind];
          return (
            <motion.g key={s.kind} className={`gh-node ${s.status}`} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: s.status === "done" ? [1, 1.22, 1] : 1, opacity: 1 }} transition={s.status === "done" ? { duration: 0.45, times: [0, 0.4, 1], ease: "easeOut" } : { ...SPRING, delay: i * 0.07 }} style={{ transformOrigin: `${n.x}px ${n.y}px` }}>
              <title>{labels[s.kind]}</title>
              <circle cx={n.x} cy={n.y} r="22" className="gh-node-bg" />
              <motion.circle cx={n.x} cy={n.y} r="22" className="gh-node-ring" fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: s.status === "done" ? 1 : s.status === "working" ? Math.max(0.05, s.progress / 100) : 0 }} transition={SPRING} transform={`rotate(-90 ${n.x} ${n.y})`} />
              {s.status === "done" ? <Check x={n.x - 11} y={n.y - 11} width={22} height={22} className="gh-ic" /> : <Icon x={n.x - 10} y={n.y - 10} width={20} height={20} className="gh-ic" />}
            </motion.g>
          );
        })}
      </svg>
      <p className="gen-pct" aria-hidden="true">{percent}%</p>
    </div>
  );
}
