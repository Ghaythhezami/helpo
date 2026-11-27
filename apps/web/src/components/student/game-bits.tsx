"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { POINTS_PER_HINT } from "@helpo/shared";
import { ArrowLeft, Check, Clock, Lightbulb, Pause, RotateCcw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Illus } from "@/components/ui/illus";
import { beep, tileArt } from "@/lib/student-helpers";
import { livePoints, type GameResult } from "@/lib/games/result";
import { SPRING } from "@/lib/motion";
import { ReadAloud } from "./read-aloud";

export interface GameProps {
  content: import("@helpo/shared").GameContent;
  seed: string;
  /** Explorer: picture tiles and read-aloud. */
  explorer: boolean;
  sound: boolean;
  onFinish: (result: GameResult) => void;
  busy?: boolean;
}

export function GameBar({
  title,
  round,
  sound,
  onSound,
  onPause,
  timer,
  onTimer,
  seconds,
  studio,
}: {
  title: string;
  round?: string;
  sound: boolean;
  onSound: () => void;
  onPause: () => void;
  timer: boolean;
  onTimer: () => void;
  seconds: number;
  studio: boolean;
}) {
  const { t } = useI18n();
  const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className="gbar">
      <Link className="back" href="/play">
        <ArrowLeft className="ic flip" aria-hidden="true" />
        {t("game.back")}
      </Link>
      <h1>{title}</h1>
      {round && <span className="st soft">{round}</span>}
      {studio && (
        <>
          <button type="button" className="tg" aria-pressed={timer} onClick={onTimer}>
            <span className="sw" />
            {t("game.timer")}
          </button>
          {timer && (
            <span className="st neu">
              <Clock className="ic" aria-hidden="true" />
              <bdi dir="ltr">{mm}</bdi>
            </span>
          )}
        </>
      )}
      <button type="button" className="tg" aria-pressed={sound} onClick={onSound}>
        <span className="sw" />
        {t("game.sound")}
      </button>
      <Button size="sm" variant="secondary" onClick={onPause}>
        <Pause className="ic" aria-hidden="true" />
        {t("game.pause")}
      </Button>
    </div>
  );
}

export function PauseDialog({ onResume, onStop }: { onResume: () => void; onStop: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onResume();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onResume]);
  return (
    <div className="ovl">
      <div className="dlg" role="dialog" aria-modal="true" aria-labelledby="pause-h">
        <h2 id="pause-h">{t("game.paused")}</h2>
        <p className="muted">{t("game.paused.text")}</p>
        <Button ref={ref} size="big" onClick={onResume}>{t("game.resume")}</Button>
        <Button variant="secondary" onClick={onStop}>{t("game.stop")}</Button>
      </div>
    </div>
  );
}

export function DoneBox({ text, cta, onClick, busy }: { text: string; cta: string; onClick: () => void; busy?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="doneb">
      <Illus name="star-buddy" size={72} className="mascot" />
      <b>{text}</b>
      <Button ref={ref} size="big" disabled={busy} onClick={onClick}>{cta}</Button>
    </div>
  );
}

export function XpPop({ xp, id }: { xp: number; id: number }) {
  const reduce = useReducedMotion();
  if (!xp) return null;
  return (
    <motion.span
      key={id}
      className="xp-pop"
      style={{ insetInlineStart: "50%", top: 8 }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.8 }}
      animate={reduce ? { opacity: [0, 1, 0] } : { opacity: [0, 1, 0], y: -34, scale: 1 }}
      transition={{ duration: 1 }}
      aria-hidden="true"
    >
      +{xp} XP
    </motion.span>
  );
}

/** Neutral answer tile: never colour-coded by pair. */
export function Tile({
  label,
  sub,
  pressed,
  matched,
  hint,
  shake,
  disabled,
  explorer,
  neutral,
  lifted,
  onClick,
  onPointerDown,
  extra,
}: {
  label: string;
  sub?: string;
  pressed?: boolean;
  matched?: boolean;
  hint?: boolean;
  shake?: boolean;
  disabled?: boolean;
  explorer: boolean;
  neutral?: boolean;
  /** Being dragged: the tile stays in place but fades while its ghost follows the pointer. */
  lifted?: boolean;
  onClick: () => void;
  onPointerDown?: (e: ReactPointerEvent) => void;
  extra?: ReactNode;
}) {
  const { t } = useI18n();
  const art = explorer || true ? tileArt(label) : null;
  return (
    <li className="tw" onPointerDown={onPointerDown}>
      <button
        type="button"
        className={`tile ${neutral ? "c-answer" : "c-peri"} ${matched ? "matched" : ""} ${hint ? "hint" : ""} ${shake ? "shake" : ""} ${lifted ? "lifted" : ""}`}
        aria-pressed={pressed ?? false}
        disabled={disabled || matched}
        onClick={onClick}
        style={explorer ? { minHeight: 100 } : undefined}
      >
        {art && <Illus name={art} size={60} />}
        <span>
          {label}
          {sub && <span className="sub">{sub}</span>}
          {matched && <span className="sr"> ({t("game.matched")})</span>}
        </span>
        {matched && <Check className="ic ck" aria-hidden="true" />}
        {extra}
      </button>
      {explorer && <ReadAloud text={label} compact />}
    </li>
  );
}

/** Hint button that shows what it costs (free for Explorers) plus any extra tools. */
export function Tools({ onHint, explorer = false, children }: { onHint?: () => void; explorer?: boolean; children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="toolrow">
      {onHint && (
        <Button variant="secondary" onClick={onHint}>
          <Lightbulb className="ic" aria-hidden="true" />
          {explorer ? t("game.hint.freeLabel") : t("game.hint.cost", { n: POINTS_PER_HINT })}
        </Button>
      )}
      {children}
    </div>
  );
}

/** Stat-bar chips: this round's XP (when the game has it), the live points estimate and, for older bands, the cost rule. */
export function PointChips({ xp, result, explorer }: { xp?: number; result: GameResult; explorer: boolean }) {
  const { t } = useI18n();
  return (
    <>
      {xp !== undefined && <span className="st soft">{t("game.roundXp", { xp })}</span>}
      <span className="st neu pts">{t("game.points", { n: livePoints(result, explorer) })}</span>
      {!explorer && <span className="muted small ptsrule">{t("game.rule.wrong")}</span>}
    </>
  );
}

/** Plays a short tone when `token` changes to a new non-null value (a fresh game event). */
export function useBeep(sound: boolean, token: unknown, frequency: number): void {
  useEffect(() => {
    if (token) beep(sound, frequency);
  }, [sound, token, frequency]);
}

/** Holds `value` for `ms` after it changes to a new non-null value (one-shot shake or pulse). */
export function useFlash<T>(value: T | null, ms = 450): T | null {
  const [flash, setFlash] = useState<T | null>(null);
  useEffect(() => {
    if (value === null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot visual flash follows a game event
    setFlash(value);
    const id = setTimeout(() => setFlash(null), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return flash;
}

/** Press feedback for tiles and cards: a small spring squeeze, or nothing at all under reduced motion. */
export function useTap() {
  const reduce = useReducedMotion();
  return reduce ? {} : ({ whileTap: { scale: 0.97 }, transition: SPRING.snappy } as const);
}

interface DragState<T> {
  item: T;
  x: number;
  y: number;
}

/**
 * Pointer-event drag and drop for mouse, pen and touch. Targets are elements with a data-drop value.
 * A move of less than 8 px stays a tap, so click handlers keep working; wasDrag() tells a click that
 * follows a drag to stand down.
 */
export function usePointerDrag<T>(onDrop: (item: T, target: string | null) => void) {
  const [drag, setDrag] = useState<DragState<T> | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const pending = useRef<DragState<T> | null>(null);
  const moving = useRef(false);
  const justDragged = useRef(false);
  const drop = useRef(onDrop);
  useEffect(() => {
    drop.current = onDrop;
  });

  useEffect(() => {
    const targetAt = (x: number, y: number): string | null => document.elementFromPoint?.(x, y)?.closest<HTMLElement>("[data-drop]")?.dataset.drop ?? null;
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      if (!moving.current && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 8) return;
      moving.current = true;
      setDrag({ item: p.item, x: e.clientX, y: e.clientY });
      setOver(targetAt(e.clientX, e.clientY));
    };
    const end = (e: PointerEvent) => {
      const p = pending.current;
      pending.current = null;
      if (!p || !moving.current) return;
      moving.current = false;
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 0);
      setDrag(null);
      setOver(null);
      drop.current(p.item, e.type === "pointercancel" ? null : targetAt(e.clientX, e.clientY));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  return {
    drag,
    over,
    begin: (e: ReactPointerEvent, item: T) => {
      if (e.button !== 0) return;
      pending.current = { item, x: e.clientX, y: e.clientY };
      moving.current = false;
    },
    wasDrag: () => justDragged.current,
  };
}

/** The card that follows the pointer while dragging. Decorative: the real control stays in place. */
export function DragGhost({ x, y, label, art }: { x: number; y: number; label: string; art?: string | null }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="ghost"
      aria-hidden="true"
      style={{ left: x, top: y }}
      initial={reduce ? { opacity: 0.6 } : { opacity: 0.6, scale: 0.9 }}
      animate={reduce ? { opacity: 0.95 } : { opacity: 0.95, scale: 1.06 }}
      transition={SPRING.snappy}
    >
      {art && <Illus name={art} size={44} />}
      <span>{label}</span>
    </motion.div>
  );
}

export function ResetIcon() {
  return <RotateCcw className="ic" aria-hidden="true" />;
}
