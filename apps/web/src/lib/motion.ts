import { useReducedMotion, type Transition } from "motion/react";

/**
 * Motion tokens (mirrors the CSS custom properties in `styles/v7.css`).
 * Rules: UI motion is 150 to 300 ms, springs only for physical things, transform and opacity only,
 * and every movement has an opacity-only (or instant) fallback under prefers-reduced-motion.
 */
export const DUR = { press: 0.09, fast: 0.14, base: 0.2, slow: 0.3, enter: 0.36, exit: 0.16 } as const;

export const EASE = {
  out: [0.16, 1, 0.3, 1],
  in: [0.4, 0, 1, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const;

/** Spring presets. `snappy` for controls and indicators, `soft` for surfaces, `playful` only for student rewards. */
export const SPRING = {
  snappy: { type: "spring", stiffness: 520, damping: 40, mass: 0.8 },
  soft: { type: "spring", stiffness: 300, damping: 32, mass: 0.9 },
  playful: { type: "spring", stiffness: 420, damping: 16, mass: 0.8 },
} as const satisfies Record<string, Transition>;

/** True in the Jest environment, where animations are skipped so tests read final values synchronously. */
export const IS_TEST = typeof process !== "undefined" && process.env.NODE_ENV === "test";

/** Enter animation for a block: small rise plus fade. With reduced motion it is a quick fade only. */
export function useEnter(distance = 8) {
  const reduce = useReducedMotion();
  return {
    initial: reduce || IS_TEST ? false : { opacity: 0, y: distance },
    animate: { opacity: 1, y: 0 },
    transition: reduce ? { duration: DUR.fast } : { duration: DUR.enter, ease: EASE.out },
  } as const;
}

/** Stagger delay for the nth item of a group: 40 ms steps, capped so long lists do not feel slow. */
export const stagger = (index: number, step = 0.04, max = 0.4) => Math.min(index * step, max);
