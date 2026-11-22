"use client";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { animate, useReducedMotion } from "motion/react";
import { IS_TEST, SPRING } from "@/lib/motion";

/**
 * FLIP for a list whose items keep their native element (drag and drop stays native HTML).
 * After every render it compares each `[data-flip]` child's position with the last one and
 * springs the difference back to zero. Transform only; skipped with reduced motion.
 */
export function useFlip(ref: RefObject<HTMLElement | null>) {
  const reduce = useReducedMotion();
  const last = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const next = new Map<string, number>();
    root.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => {
      const key = el.dataset.flip as string;
      const top = el.getBoundingClientRect().top - (Number(el.dataset.shift) || 0);
      next.set(key, top);
      const prev = last.current.get(key);
      if (prev === undefined || reduce || IS_TEST) return;
      const delta = prev - top;
      if (Math.abs(delta) < 2) return;
      animate(el, { y: [delta, 0] }, SPRING.snappy);
    });
    last.current = next;
  });
}
