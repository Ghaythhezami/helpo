import { createElement, forwardRef, Fragment, type ReactNode } from "react";

/** Props that only motion understands: dropped so the DOM element stays clean. */
const MOTION_PROPS = ["initial", "animate", "transition", "exit", "variants", "whileHover", "whileTap", "whileFocus", "whileInView", "layout", "layoutId", "onAnimationComplete", "drag", "dragConstraints"];
const strip = (props: Record<string, unknown>) => {
  const rest = { ...props };
  for (const key of MOTION_PROPS) delete rest[key];
  return rest;
};
const cache = new Map<string, unknown>();
const make = (tag: string) => {
  const C = forwardRef<HTMLElement, { children?: ReactNode } & Record<string, unknown>>((props, ref) => createElement(tag, { ...strip(props), ref }));
  C.displayName = `motion.${tag}`;
  return C;
};
/** Any `motion.<tag>` renders the plain tag. */
export const motion = new Proxy({} as Record<string, ReturnType<typeof make>>, {
  get: (_t, tag: string) => {
    if (!cache.has(tag)) cache.set(tag, make(tag));
    return cache.get(tag) as ReturnType<typeof make>;
  },
});
/** Exits are not played in tests: children simply mount and unmount. */
export const AnimatePresence = ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children);
/** Every variant started through useAnimation, so a test can see that an icon played. */
export const controlsLog: string[] = [];
export const useAnimation = () => ({ start: async (name: string) => void controlsLog.push(name), stop: () => undefined, set: () => undefined });
export const animate = () => ({ stop: () => undefined });
/** Tests render the static (reduced-motion) variant unless a test sets globalThis.__reduceMotion = false. */
export const useReducedMotion = () => (globalThis as { __reduceMotion?: boolean }).__reduceMotion ?? true;
