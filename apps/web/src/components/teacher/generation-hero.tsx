"use client";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import type { ResourceKind } from "@helpo/shared";
import { AnimatedIcon, type AnimatedIconName } from "@/components/ui/animated-icons";
import { useTabVisible } from "@/lib/use-tab-visible";
import { SPRING } from "@/lib/motion";
import type { GenerationStep } from "./generation-view";

export { useTabVisible };

/** One animated icon per resource, from the lucide-animated set (see `ui/animated-icons.tsx`). */
export const KIND_ICON: Record<ResourceKind, AnimatedIconName> = { SLIDES: "presentation", WORKSHEET: "fileText", QUIZ: "listChecks", CARDS: "layers", GAME: "gamepad" };

const LAMP = { x: 180, y: 160 };
/** Five nodes on an arc above the lamp, left to right in generation order (mirrored by CSS in RTL). */
const NODES = [170, 130, 90, 50, 10].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return { x: Math.round(180 + 142 * Math.cos(a)), y: Math.round(158 - 118 * Math.sin(a)) };
});
const SPRING_LINE = { type: "spring", stiffness: 70, damping: 20, mass: 1 } as const;
const SPRING_GLOW = { type: "spring", stiffness: 120, damping: 22, mass: 1 } as const;

function pathTo(i: number): string {
  const n = NODES[i];
  const cx = (n.x + LAMP.x) / 2 + (n.x < LAMP.x ? -22 : n.x > LAMP.x ? 22 : 0);
  const cy = (n.y + LAMP.y - 34) / 2;
  return `M${LAMP.x} ${LAMP.y - 34} Q${cx} ${cy} ${n.x} ${n.y + 23}`;
}

/**
 * The signature animation: a Nibras lamp whose light grows with the real progress, in four layers (halo, light cone, lamp,
 * nodes). Each resource is a node on an arc; a line of light is drawn from the lamp to it as that resource is made (a spark
 * travels along it while it works), the node ring fills with its live percent, its own animated icon loops, and it pops
 * with a ripple when done. When the kit is finished the nodes pop in a stagger and one light bloom opens before the
 * workspace appears. Only transform, opacity and stroke offsets move; loops pause in hidden tabs; reduced motion renders a
 * static ring.
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

  const glow = 0.5 + (percent / 100) * 0.9;
  const lit = analysisDone || finished;
  return (
    <div className={`gen-hero ${visible ? "" : "paused"} ${finished ? "finished" : ""}`} data-variant="animated">
      <svg viewBox="0 0 360 215" role="img" aria-label={`${percent}%`}>
        <defs>
          <radialGradient id="gh-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffd86b" stopOpacity="0.95" />
            <stop offset="42%" stopColor="#b39bff" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#6035cf" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="gh-bloom" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff6cf" stopOpacity="1" />
            <stop offset="35%" stopColor="#ffd86b" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#ffd86b" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="gh-beam" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#ffd86b" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ffd86b" stopOpacity="0" />
          </linearGradient>
        </defs>

        <ellipse cx={LAMP.x} cy={LAMP.y + 31} rx="52" ry="6" className="gh-ground" />
        <motion.circle cx={LAMP.x} cy={LAMP.y - 20} r="110" fill="url(#gh-glow)" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: glow, opacity: lit ? 0.95 : 0.5 }} transition={SPRING_GLOW} style={{ transformOrigin: `${LAMP.x}px ${LAMP.y - 20}px` }} />
        <motion.path d={`M${LAMP.x - 9} ${LAMP.y - 30} L${LAMP.x + 9} ${LAMP.y - 30} L${LAMP.x + 78} 14 L${LAMP.x - 78} 14 Z`} fill="url(#gh-beam)" initial={{ opacity: 0 }} animate={{ opacity: finished ? 0.5 : lit ? [0.16, 0.3, 0.16] : 0.08 }} transition={lit && !finished ? { duration: 4.2, repeat: Infinity, ease: "easeInOut" } : { duration: 0.4 }} />

        {NODES.map((_, i) => {
          const s = steps[i];
          const drawn = s.status === "done" ? 1 : s.status === "working" ? Math.max(0.08, s.progress / 100) : 0;
          return (
            <g key={s.kind}>
              <path d={pathTo(i)} className="gh-line-bg" />
              <motion.path d={pathTo(i)} className="gh-line-glow" initial={{ pathLength: 0 }} animate={{ pathLength: drawn }} transition={SPRING_LINE} />
              <motion.path d={pathTo(i)} className={`gh-line ${s.status}`} initial={{ pathLength: 0 }} animate={{ pathLength: drawn }} transition={SPRING_LINE} />
              {s.status === "working" && <motion.path d={pathTo(i)} className="gh-spark" pathLength={1} strokeDasharray="0.05 0.95" initial={{ strokeDashoffset: 0 }} animate={{ strokeDashoffset: visible ? -1 : 0 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} />}
            </g>
          );
        })}

        {!finished && (
          <g className="gh-particles" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <circle key={i} cx={LAMP.x - 24 + i * 8} cy={LAMP.y - 34} r={1.6 + (i % 3) * 0.5} style={{ ["--i" as string]: i }} />
            ))}
          </g>
        )}

        <g className="gh-lamp" aria-hidden="true">
          <path d="M152 178 Q180 200 208 178 Q212 162 180 160 Q148 162 152 178 Z" className="gh-shade" />
          <path d="M206 170 Q222 166 226 156 Q214 162 204 164 Z" className="gh-shade" />
          <rect x="166" y="186" width="28" height="6" rx="3" className="gh-base" />
          <motion.path d="M180 128 Q194 146 180 160 Q166 146 180 128 Z" className="gh-bulb" animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 2.4, repeat: visible ? Infinity : 0, ease: "easeInOut" }} style={{ transformOrigin: "180px 160px" }} />
        </g>

        {NODES.map((n, i) => {
          const s = steps[i];
          const done = s.status === "done";
          return (
            <motion.g
              key={s.kind}
              className={`gh-node ${s.status}`}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={finished ? { scale: [1, 1.24, 1], opacity: 1 } : { scale: done ? [1, 1.2, 1] : 1, opacity: 1 }}
              transition={finished ? { duration: 0.55, delay: 0.25 + i * 0.09, times: [0, 0.45, 1], ease: [0.16, 1, 0.3, 1] } : done ? { duration: 0.45, times: [0, 0.4, 1], ease: "easeOut" } : { ...SPRING.soft, delay: i * 0.07 }}
              style={{ transformOrigin: `${n.x}px ${n.y}px` }}
            >
              <title>{labels[s.kind]}</title>
              {done && <motion.circle key="ripple" cx={n.x} cy={n.y} r="22" className="gh-ripple" initial={{ scale: 1, opacity: 0.6 }} animate={{ scale: 1.9, opacity: 0 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} style={{ transformOrigin: `${n.x}px ${n.y}px` }} />}
              <circle cx={n.x} cy={n.y + 3} r="22" className="gh-node-shadow" />
              <circle cx={n.x} cy={n.y} r="22" className="gh-node-bg" />
              <motion.circle cx={n.x} cy={n.y} r="22" className="gh-node-ring" fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: done ? 1 : s.status === "working" ? Math.max(0.05, s.progress / 100) : 0 }} transition={SPRING_LINE} transform={`rotate(-90 ${n.x} ${n.y})`} />
              {done ? (
                <g className="gh-ic"><AnimatedIcon name="check" size={22} x={n.x - 11} y={n.y - 11} play /></g>
              ) : (
                <g className="gh-ic"><AnimatedIcon name={KIND_ICON[s.kind]} size={20} x={n.x - 10} y={n.y - 10} loop={s.status === "working"} gap={1.2} /></g>
              )}
            </motion.g>
          );
        })}

        {finished && <motion.circle key="bloom" cx={LAMP.x} cy={LAMP.y - 30} r="70" fill="url(#gh-bloom)" initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: [0.2, 2.8], opacity: [0, 0.95, 0] }} transition={{ duration: 1, delay: 0.55, times: [0, 0.35, 1], ease: [0.16, 1, 0.3, 1] }} style={{ transformOrigin: `${LAMP.x}px ${LAMP.y - 30}px` }} />}
      </svg>
      <p className="gen-pct" aria-hidden="true">{finished ? <Check className="ic" /> : `${percent}%`}</p>
    </div>
  );
}
