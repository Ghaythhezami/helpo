"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DUR, EASE, IS_TEST } from "@/lib/motion";

export interface ToastOptions {
  /** Shows an Undo button that runs this callback. */
  undo?: () => void;
  undoLabel?: string;
  durationMs?: number;
}

interface ToastState extends ToastOptions {
  id: number;
  message: string;
}

interface ToastApi {
  show: (message: string, options?: ToastOptions) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

/** One toast at a time, polite live region, optional Undo. Mount it inside the themed (.tapp / .sapp) wrapper. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const counter = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduce = useReducedMotion();
  const still = reduce || IS_TEST;

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  const show = useCallback(
    (message: string, options: ToastOptions = {}) => {
      if (timer.current) clearTimeout(timer.current);
      counter.current += 1;
      setToast({ id: counter.current, message, ...options });
      timer.current = setTimeout(() => setToast(null), options.durationMs ?? (options.undo ? 8000 : 3500));
    },
    [],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
        <AnimatePresence initial={false} mode="wait">
          {toast && (
          <motion.div
            className="toast on mx"
            key={toast.id}
            style={{ x: "-50%" }}
            initial={still ? false : { opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={still ? undefined : { opacity: 0, y: 8, scale: 0.98, transition: { duration: DUR.exit, ease: EASE.in } }}
            transition={{ duration: DUR.slow, ease: EASE.out }}
          >
            <span>{toast.message}</span>
            {toast.undo && (
              <button
                type="button"
                onClick={() => {
                  toast.undo?.();
                  dismiss();
                }}
              >
                {toast.undoLabel ?? "Undo"}
                <span className="sr"> {toast.message}</span>
              </button>
            )}
          </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
