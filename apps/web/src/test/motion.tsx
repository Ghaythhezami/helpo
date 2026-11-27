import { createElement, forwardRef, type ReactNode } from "react";

const strip = ({ initial, animate, transition, exit, onAnimationComplete, ...rest }: Record<string, unknown>) => {
  void initial; void animate; void transition; void exit; void onAnimationComplete;
  return rest;
};
const make = (tag: string) => {
  const C = forwardRef<HTMLElement, { children?: ReactNode } & Record<string, unknown>>((props, ref) => createElement(tag, { ...strip(props), ref }));
  C.displayName = `motion.${tag}`;
  return C;
};
export const motion = { div: make("div"), span: make("span"), g: make("g"), circle: make("circle"), path: make("path") };
/** Tests render the static (reduced-motion) variant unless a test sets globalThis.__reduceMotion = false. */
export const useReducedMotion = () => (globalThis as { __reduceMotion?: boolean }).__reduceMotion ?? true;
