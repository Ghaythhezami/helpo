"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./button";

/** Dialog-free inline confirmation ("End the quiz for all 18 students?"). Focus moves to the confirm button. */
export function InlineConfirm({
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy,
}: {
  message: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="conf on" role="group" aria-label="Please confirm">
      <span>{message}</span>
      <Button ref={ref} size="sm" onClick={onConfirm} disabled={busy}>
        {confirmLabel}
      </Button>
      <Button size="sm" variant="secondary" onClick={onCancel}>
        {cancelLabel}
      </Button>
    </div>
  );
}
