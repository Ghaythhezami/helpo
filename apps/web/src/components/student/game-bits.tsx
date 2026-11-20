"use client";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Check, Clock, Lightbulb, Pause, RotateCcw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Illus } from "@/components/ui/illus";
import { tileArt } from "@/lib/student-helpers";
import { ReadAloud } from "./read-aloud";

export interface GameProps {
  content: import("@helpo/shared").GameContent;
  seed: string;
  /** Explorer: picture tiles and read-aloud. */
  explorer: boolean;
  sound: boolean;
  onFinish: (result: { total: number; firstTryCorrect: number; retriedCorrect: number }) => void;
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
      <Link className="back" href="/join">
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
  onClick,
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
  onClick: () => void;
  extra?: ReactNode;
}) {
  const { t } = useI18n();
  const art = explorer || true ? tileArt(label) : null;
  return (
    <li className="tw">
      <button
        type="button"
        className={`tile ${neutral ? "c-answer" : "c-peri"} ${matched ? "matched" : ""} ${hint ? "hint" : ""} ${shake ? "shake" : ""}`}
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

export function Tools({ onHint, hintLabel, children }: { onHint?: () => void; hintLabel?: string; children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="toolrow">
      {onHint && (
        <Button variant="secondary" onClick={onHint}>
          <Lightbulb className="ic" aria-hidden="true" />
          {hintLabel ?? t("game.hint")}
        </Button>
      )}
      {children}
    </div>
  );
}

export function ResetIcon() {
  return <RotateCcw className="ic" aria-hidden="true" />;
}
