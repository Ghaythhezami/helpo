"use client";
import { Check, Clock, Minus } from "lucide-react";
import { MASTERY_TARGET } from "@helpo/shared";
import { useI18n } from "@/lib/i18n";

/** Mastery status from a 0..1 value against the 70% target. Text and icon always accompany the colour. */
export function masteryStatus(value: number): "met" | "close" | "notyet" {
  if (value >= MASTERY_TARGET) return "met";
  if (value >= MASTERY_TARGET - 0.1) return "close";
  return "notyet";
}

const STATUS_COLOR = { met: "#2E8F63", close: "#A36F0D", notyet: "#6035CF" } as const;
const STATUS_TEXT = { met: "#1B5E41", close: "#6B4800", notyet: "#3F2BA6" } as const;

export function StatusMark({ status, children }: { status: "met" | "close" | "notyet"; children: string }) {
  const Icon = status === "met" ? Check : status === "close" ? Minus : Clock;
  return (
    <span className="mk2" style={{ color: STATUS_TEXT[status] }}>
      <Icon className="ic" style={{ color: STATUS_COLOR[status] }} aria-hidden="true" />
      {children}
    </span>
  );
}

export function Donut({ value, correct, wrong }: { value: number; correct: number; wrong: number }) {
  const { t } = useI18n();
  const r = 70;
  const c = 2 * Math.PI * r;
  const pct = Math.round(value * 100);
  const total = correct + wrong;
  return (
    <div className="donutwrap">
      <svg viewBox="0 0 200 200" role="img" aria-label={t("results.donut.aria", { n: pct })}>
        <circle cx="100" cy="100" r={r} fill="none" stroke="#E4DAFF" strokeWidth="26" />
        <circle cx="100" cy="100" r={r} fill="none" stroke="#6035CF" strokeWidth="26" strokeDasharray={`${c * value} ${c}`} transform="rotate(-90 100 100)" />
        <text x="100" y="108" textAnchor="middle" fontSize="38" fontWeight="900" fill="#24185F">{pct}%</text>
        <text x="100" y="132" textAnchor="middle" fontSize="14" fontWeight="700" fill="#4A3F86">{t("results.average")}</text>
      </svg>
      <ul className="leg">
        <li><span className="sw" style={{ background: "#6035CF" }} />{t("results.legend.correct", { n: correct, pct: total ? Math.round((correct / total) * 100) : 0 })}</li>
        <li><span className="sw" style={{ background: "#E4DAFF", border: "1px solid #B9A6FF" }} />{t("results.legend.notYet", { n: wrong, pct: total ? Math.round((wrong / total) * 100) : 0 })}</li>
      </ul>
    </div>
  );
}

export function LineChart({ points, label }: { points: { label: string; value: number }[]; label: string }) {
  const { t } = useI18n();
  const left = 44;
  const right = 390;
  const y = (v: number) => 200 - v * 192;
  const step = points.length > 1 ? (right - left - 80) / (points.length - 1) : 0;
  const x = (i: number) => left + 40 + i * step;
  return (
    <svg className="lineSvg" viewBox="0 0 400 240" role="group" aria-label={label} style={{ direction: "ltr" }}>
      <g stroke="#E6DEFB" strokeWidth="1">
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <path key={v} d={`M${left} ${y(v)}H${right}`} />
        ))}
      </g>
      <g textAnchor="end">
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <text key={v} x="38" y={y(v) + 4}>{Math.round(v * 100)}%</text>
        ))}
      </g>
      <path d={`M${left} ${y(MASTERY_TARGET)}H${right}`} stroke="#6A60A0" strokeDasharray="5 5" strokeWidth="1.5" />
      <text x={right} y={y(MASTERY_TARGET) + 18} textAnchor="end">{t("results.target")}</text>
      {points.length > 1 && <polyline fill="none" stroke="#6035CF" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} />}
      <g textAnchor="middle">
        {points.map((p, i) => (
          <g key={p.label} role="img" aria-label={`${p.label}: ${Math.round(p.value * 100)}%`} tabIndex={0}>
            <circle cx={x(i)} cy={y(p.value)} r="8" fill={i === points.length - 1 ? "#6035CF" : "#fff"} stroke="#6035CF" strokeWidth="4" />
            <text className="lbl" x={x(i)} y={y(p.value) - 14}>{Math.round(p.value * 100)}%</text>
            <text x={x(i)} y="226">{p.label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/** One horizontal bar with the 70% target line. Fill is a mark; the number and status text stay in ink. */
export function TargetBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  return (
    <svg className="bs" viewBox="0 0 100 26" preserveAspectRatio="none" role="img" aria-label={`${label}: ${pct}%`} tabIndex={0} style={{ transform: "var(--flip-x, none)" }}>
      <rect width="100" height="26" rx="6" fill="#E4DAFF" />
      <rect width={pct} height="26" rx="6" fill="#6035CF" />
      <rect x={MASTERY_TARGET * 100 - 0.5} width="1" height="26" fill={value >= MASTERY_TARGET ? "#fff" : "#24185F"} opacity={value >= MASTERY_TARGET ? 0.8 : 1} />
    </svg>
  );
}
