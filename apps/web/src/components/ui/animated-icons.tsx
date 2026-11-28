"use client";
import { useEffect, type CSSProperties } from "react";
import { motion, useAnimation, useReducedMotion, type Variants } from "motion/react";
import { IS_TEST } from "@/lib/motion";
import { useTabVisible } from "@/lib/use-tab-visible";

/**
 * Animated Lucide icons, installed locally (no new dependency).
 *
 * Source: the lucide-animated library (https://lucide-animated.com, MIT). Its registry JSON for sparkles, file-text, layers,
 * check, users, shield-check and plus was read through the lucide-animated MCP server and re-expressed as data below; its
 * presentation, list-checks, gamepad-2 and book-open icons do not exist there, so they are animated in the same style from
 * the Lucide path data. One generic component drives all of them: parts marked `fx` animate, the rest stay still.
 *
 * Motion rules (DESIGN_SYSTEM.md section 6): only stroke offset, transform and opacity move; the icon is fully drawn at rest
 * and in tests; under prefers-reduced-motion and in hidden tabs nothing plays. `play` plays one cycle each time it turns
 * true; `loop` repeats a cycle every `gap` seconds while true (working states, never near a task in progress).
 */

type Fx = { k: "draw" | "y" | "x" | "pop"; v?: number; delay?: number };
type Attrs = Record<string, string | number>;
interface Part {
  tag: "path" | "line" | "circle";
  a: Attrs;
  fx?: Fx;
}

const p = (d: string, fx?: Fx): Part => ({ tag: "path", a: { d }, fx });
const l = (x1: number, y1: number, x2: number, y2: number, fx?: Fx): Part => ({ tag: "line", a: { x1, y1, x2, y2 }, fx });
const draw = (delay = 0): Fx => ({ k: "draw", delay });

export const ANIMATED_ICONS: Record<string, Part[]> = {
  /** analysis: sparkles (lucide-animated) */
  sparkles: [
    p("M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z", { k: "pop", v: 1.12 }),
    p("M20 3v4", draw(0.1)),
    p("M22 5h-4", draw(0.18)),
    p("M4 17v2", draw(0.26)),
    p("M5 18H3", draw(0.34)),
  ],
  presentation: [p("M2 3h20", { k: "y", v: -1 }), p("M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"), p("m7 21 5-5 5 5", draw(0.1))],
  fileText: [
    p("M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"),
    p("M14 2v5a1 1 0 0 0 1 1h5"),
    p("M10 9H8", draw(0.05)),
    p("M16 13H8", draw(0.2)),
    p("M16 17H8", draw(0.35)),
  ],
  listChecks: [p("M13 5h8", draw(0.2)), p("M13 12h8", draw(0.35)), p("M13 19h8", draw(0.5)), p("m3 17 2 2 4-4", draw(0.3)), p("m3 7 2 2 4-4", draw(0.05))],
  layers: [
    p("m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"),
    p("m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65", { k: "y", v: -9 }),
    p("m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65", { k: "y", v: -5 }),
  ],
  gamepad: [
    l(6, 11, 10, 11, draw(0.05)),
    l(8, 9, 8, 13, draw(0.15)),
    l(15, 12, 15.01, 12, { k: "pop", v: 1.7, delay: 0.1 }),
    l(18, 10, 18.01, 10, { k: "pop", v: 1.7, delay: 0.2 }),
    p("M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z", { k: "y", v: -0.8 }),
  ],
  check: [p("M4 12 9 17L20 6", draw())],
  plus: [p("M5 12h14", draw(0)), p("M12 5v14", draw(0.12))],
  bookOpen: [p("M12 5v16", draw(0.05)), p("M20.001 19A2 2 0 0 0 22 17V5a2 2 0 0 0-1.999-2L16 3.002A5 5 0 0 0 12 5a5 5 0 0 0-4-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 1.999 2H8a5 5 0 0 1 4 2 5 5 0 0 1 4-2z", { k: "pop", v: 1.04 })],
  users: [
    p("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"),
    { tag: "circle", a: { cx: 9, cy: 7, r: 4 } },
    p("M22 21v-2a4 4 0 0 0-3-3.87", { k: "x", v: -6, delay: 0.1 }),
    p("M16 3.13a4 4 0 0 1 0 7.75", { k: "x", v: -6, delay: 0.1 }),
  ],
  shieldCheck: [
    p("M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"),
    p("m9 12 2 2 4-4", draw(0.05)),
  ],
};

export type AnimatedIconName = "sparkles" | "presentation" | "fileText" | "listChecks" | "layers" | "gamepad" | "check" | "plus" | "bookOpen" | "users" | "shieldCheck";

const PIVOT: CSSProperties = { transformBox: "fill-box", transformOrigin: "center" };
const SPRING_ICON = { type: "spring", stiffness: 180, damping: 14, mass: 0.8 } as const;

/** The two states of a part: `normal` is the fully drawn rest state, `animate` is one cycle. */
export function variantsFor(fx: Fx): Variants {
  const delay = fx.delay ?? 0;
  switch (fx.k) {
    case "draw":
      return {
        normal: { pathLength: 1, opacity: 1, scale: 1 },
        animate: { pathLength: [0, 1], opacity: [0, 1], scale: [0.6, 1], transition: { duration: 0.42, delay, opacity: { duration: 0.1, delay } } },
      };
    case "y":
      return { normal: { y: 0 }, animate: { y: [0, fx.v ?? -2, 0], transition: { duration: 0.6, delay, times: [0, 0.4, 1], ease: ["easeOut", "easeInOut"] } } };
    case "x":
      return { normal: { x: 0 }, animate: { x: [fx.v ?? -4, 0], transition: { ...SPRING_ICON, delay } } };
    default:
      return { normal: { scale: 1 }, animate: { scale: [1, fx.v ?? 1.15, 1], transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] } } };
  }
}

function Shape({ part, controls }: { part: Part; controls: ReturnType<typeof useAnimation> }) {
  const { tag, a, fx } = part;
  if (!fx) {
    const Tag = tag;
    return <Tag {...(a as object)} />;
  }
  const M = motion[tag] as typeof motion.path;
  return <M {...(a as object)} animate={controls} initial="normal" variants={variantsFor(fx)} style={fx.k === "pop" || fx.k === "draw" ? PIVOT : undefined} />;
}

export interface AnimatedIconProps {
  name: AnimatedIconName;
  size?: number;
  /** Plays one cycle every time it turns true (hover or focus on a nav item, a step finishing). */
  play?: boolean;
  /** Repeats a cycle every `gap` seconds while true (a step that is being worked on). */
  loop?: boolean;
  gap?: number;
  className?: string;
  /** Position when nested inside another <svg> (the lamp hero). */
  x?: number;
  y?: number;
}

/** An animated Lucide icon. Decorative: always aria-hidden (the label lives next to it). */
export function AnimatedIcon({ name, size = 20, play = false, loop = false, gap = 1.6, className = "", x, y }: AnimatedIconProps) {
  const controls = useAnimation();
  const reduce = useReducedMotion();
  const visible = useTabVisible();
  const still = reduce || IS_TEST;

  useEffect(() => {
    if (still || !visible || !(play || loop)) return;
    let alive = true;
    const run = async () => {
      do {
        await controls.start("animate");
        if (!loop || !alive) break;
        await new Promise((r) => setTimeout(r, gap * 1000));
      } while (alive);
    };
    void run();
    return () => {
      alive = false;
      try {
        controls.stop();
        controls.set("normal"); // back to the fully drawn rest state
      } catch {
        /* unmounting: the controls are already detached */
      }
    };
  }, [play, loop, gap, still, visible, controls]);

  return (
    <svg
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`aicon ${className}`.trim()}
      aria-hidden="true"
      focusable="false"
      data-icon={name}
    >
      {ANIMATED_ICONS[name].map((part, i) => (
        <Shape key={i} part={part} controls={controls} />
      ))}
    </svg>
  );
}
