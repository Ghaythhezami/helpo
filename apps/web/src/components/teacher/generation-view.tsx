"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { LessonDetail, ResourceKind, ResourceView } from "@helpo/shared";
import { AlertTriangle, RotateCcw, X } from "lucide-react";
import { ApiError, api, errorMessage } from "@/lib/api";
import { RESOURCE_ART } from "@/lib/checks";
import { useI18n } from "@/lib/i18n";
import { qk, useLessonEvents } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { InlineConfirm } from "@/components/ui/confirm";
import { Illus } from "@/components/ui/illus";
import { AnimatedIcon } from "@/components/ui/animated-icons";
import { DUR, EASE, IS_TEST } from "@/lib/motion";
import { GenerationHero, KIND_ICON, useTabVisible } from "./generation-hero";
import { pipelineSteps } from "./making";

/** The kit is made one resource after another, in this order (the API runs the same sequence). */
export const GENERATION_ORDER: ResourceKind[] = ["SLIDES", "WORKSHEET", "QUIZ", "CARDS", "GAME"];

export type StepStatus = "waiting" | "working" | "done" | "failed";

export interface GenerationStep {
  kind: ResourceKind;
  status: StepStatus;
  progress: number;
  error: string | null;
}

/** Pure: the five sequential steps from the lesson. A resource that has not started yet is "waiting". */
export function generationSteps(lesson: Pick<LessonDetail, "resources">): GenerationStep[] {
  const byKind = new Map<ResourceKind, ResourceView>(lesson.resources.map((r) => [r.kind, r]));
  return GENERATION_ORDER.map((kind) => {
    const r = byKind.get(kind);
    const status: StepStatus = r?.status === "READY" ? "done" : r?.status === "FAILED" ? "failed" : r?.status === "WORKING" ? "working" : "waiting";
    return { kind, status, progress: status === "done" ? 100 : (r?.progress ?? 0), error: r?.error ?? null };
  });
}

/** Pure: overall percent. Analysis is the first fifth, each of the five resources is a fifth of the rest. */
export function overallPercent(analysisDone: boolean, steps: GenerationStep[]): number {
  const analysis = analysisDone ? 100 : 0;
  const rest = steps.reduce((sum, s) => sum + (s.status === "done" ? 100 : s.status === "working" ? Math.min(99, s.progress) : 0), 0) / steps.length;
  return Math.round(analysis * 0.2 + rest * 0.8);
}

/** Rows rise in a short stagger when the view opens (nothing in tests, no movement under reduced motion). */
function rowEnter(index: number, reduce: boolean) {
  return {
    initial: reduce || IS_TEST ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: DUR.enter, ease: EASE.out, delay: 0.12 + index * 0.05 },
  } as const;
}

/** Status icon of a step: its own animated icon loops while working, the check draws once when done. */
function StepIcon({ kind, status, analysis }: { kind: ResourceKind; status: StepStatus; analysis?: boolean }) {
  if (status === "failed") return <AlertTriangle className="ic" aria-hidden="true" />;
  if (status === "done") return <AnimatedIcon name="check" size={16} play />;
  return <AnimatedIcon name={analysis ? "sparkles" : KIND_ICON[kind]} size={16} loop={status === "working"} gap={1.2} />;
}

/** Real, rotating lines about what is happening for a step (keys gen.doing.KIND.0..2). Never tips, never filler. */
const DOING_LINES = 3;
const FOCUSABLE = "button:not([disabled]), a[href], [tabindex]:not([tabindex=\"-1\"])";

function NowLine({ kind, active, reduce }: { kind: ResourceKind; active: boolean; reduce: boolean }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const visible = useTabVisible();
  useEffect(() => {
    if (!active || reduce || !visible) return;
    const id = setInterval(() => setI((n) => (n + 1) % DOING_LINES), 3200);
    return () => clearInterval(id);
  }, [active, reduce, visible]);
  const line = active ? t(`gen.doing.${kind}.${reduce ? 0 : i}` as "gen.doing.SLIDES.0") : "";
  const motionless = reduce || IS_TEST;
  return (
    <p className="gen-now muted" aria-hidden="true">
      <AnimatePresence mode="wait" initial={false}>
        {active && (
          <motion.span
            key={`${kind}-${i}`}
            initial={motionless ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={motionless ? undefined : { opacity: 0, y: -6, transition: { duration: DUR.exit, ease: EASE.in } }}
            transition={{ duration: DUR.base, ease: EASE.out }}
          >
            {line}
          </motion.span>
        )}
      </AnimatePresence>
    </p>
  );
}

/**
 * Full-viewport generation view and focus lock. While it is mounted the rest of the app is `inert` (the shell sets that),
 * focus stays inside, Esc does nothing. Exits: cancel (confirmed) and finishing. It shows the analysis, then the five
 * sequential steps (Slides, Worksheet, Quiz, Cards, Games), each with its own state, tied to the real status and
 * `resource.progress`.
 */
export function GenerationView({ lessonId, onFinished, onCancelled }: { lessonId: string; onFinished: (id: string) => void; onCancelled: () => void }) {
  const { t } = useI18n();
  const reduce = useReducedMotion() ?? false;
  const queryClient = useQueryClient();
  const lesson = useLessonEvents(lessonId, { awaitGeneration: true });
  const data = lesson.data;
  const rootRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const finishing = useRef(false);
  const finishedCb = useRef(onFinished);
  useEffect(() => {
    finishedCb.current = onFinished;
  }, [onFinished]);
  const [confirming, setConfirming] = useState(false);

  const retry = useMutation({
    mutationFn: (kind: ResourceKind) => api(`/lessons/${lessonId}/resources/${kind}/retry`, { method: "POST" }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: qk.lesson(lessonId) }),
  });
  const cancel = useMutation({
    mutationFn: () => api(`/lessons/${lessonId}/cancel`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.lessons() });
      onCancelled();
    },
  });

  // Focus lock: Tab cycles inside the view, Escape is swallowed (the only exits are Cancel and finishing).
  useEffect(() => {
    headRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return e.preventDefault();
      if (e.key !== "Tab" || !rootRef.current) return;
      const items = [...rootRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return e.preventDefault();
      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement;
      if (!rootRef.current.contains(at)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (at === first || at === headRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && at === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // A lesson that no longer exists releases the lock.
  const gone = lesson.error instanceof ApiError && lesson.error.status === 404;
  useEffect(() => {
    if (gone) onCancelled();
  }, [gone, onCancelled]);

  const steps = data ? generationSteps(data) : GENERATION_ORDER.map((kind) => ({ kind, status: "waiting" as StepStatus, progress: 0, error: null }));
  const status = data?.status ?? "UPLOADED";
  const analysis = data ? pipelineSteps(status, data.sourceChars) : [];
  const activeAnalysis = analysis.find((a) => a.state === "active");
  const analysisDone = ["ANALYZED", "GENERATING", "READY", "PARTIAL"].includes(status);
  const analysisFailed = status === "FAILED" && (data?.resources.length ?? 0) === 0;
  const readyCount = steps.filter((s) => s.status === "done").length;
  // The lock lifts on READY, and on PARTIAL (some resources failed): the workspace offers the retry for those.
  const finished = (status === "READY" || status === "PARTIAL") && readyCount > 0;
  const percent = finished ? 100 : overallPercent(analysisDone, steps);

  // Completion choreography: the nodes pop in a stagger and a light bloom opens (the hero), then the whole view eases out and
  // the workspace is revealed. A timer backs the exit up (animations do not complete in a hidden tab). Reduced motion: a short hold.
  const [leaving, setLeaving] = useState(false);
  const release = useCallback(() => {
    if (finishing.current) return;
    finishing.current = true;
    finishedCb.current(lessonId);
  }, [lessonId]);
  useEffect(() => {
    if (!finished || finishing.current) return;
    if (reduce) {
      const id = setTimeout(release, 500);
      return () => clearTimeout(id);
    }
    const out = setTimeout(() => setLeaving(true), 1500);
    const safety = setTimeout(release, 2200);
    return () => {
      clearTimeout(out);
      clearTimeout(safety);
    };
  }, [finished, reduce, release]);

  const stepLabel = (kind: ResourceKind) => (kind === "GAME" ? t("gen.games") : t(`resource.${kind}` as "resource.SLIDES"));
  const labels = Object.fromEntries(GENERATION_ORDER.map((k) => [k, stepLabel(k)])) as Record<ResourceKind, string>;
  const current = steps.find((s) => s.status === "working");
  const analysisStatus: StepStatus = analysisFailed ? "failed" : analysisDone ? "done" : "working";

  return (
    <motion.div
      ref={rootRef}
      className="gen-ovl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gen-title"
      aria-describedby="gen-live"
      initial={{ opacity: 0, scale: reduce ? 1 : 0.99 }}
      animate={leaving ? { opacity: 0, scale: 1.025 } : { opacity: 1, scale: 1 }}
      transition={leaving ? { duration: 0.32, ease: EASE.in } : { duration: reduce ? 0.1 : 0.3, ease: EASE.out }}
      onAnimationComplete={() => leaving && release()}
    >
      <div className="gen-card">
        <div className="gen-left">
          <GenerationHero steps={steps} percent={percent} analysisDone={analysisDone} finished={finished} reduce={reduce} labels={labels} />
          <h1 id="gen-title" ref={headRef} tabIndex={-1}>{finished ? t("gen.done") : data ? t("gen.title", { title: data.title }) : t("gen.title.plain")}</h1>
          <p id="gen-live" className="muted" role="status" aria-live="polite">
            {analysisFailed ? t("gen.failed.text") : finished ? t("gen.done.text", { n: readyCount }) : !analysisDone ? t("gen.analysing") : current ? t("gen.making", { name: stepLabel(current.kind) }) : t("gen.next")}
            <span className="sr"> {t("gen.percent", { n: percent })}</span>
          </p>
          <div className="gen-total" role="progressbar" aria-label={t("making.steps")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <i style={{ transform: `scaleX(${percent / 100})` }} />
          </div>
          <NowLine key={current?.kind ?? "none"} kind={current?.kind ?? "SLIDES"} active={!!current && !finished} reduce={reduce} />
        </div>

        <div className="gen-right">
          <ol className="gen-steps" aria-label={t("making.steps")}>
            <motion.li className={`gen-step ${analysisStatus}`} {...rowEnter(0, reduce)}>
              <span className="gs-ic"><StepIcon kind="SLIDES" status={analysisStatus} analysis /></span>
              <span className="gs-name">
                <b>{t("gen.analysis")}</b>
                <span className="muted small">
                  {analysisFailed ? t("gen.state.failed") : analysisDone ? t("gen.state.done") : activeAnalysis ? t(`making.step.${activeAnalysis.id}` as "making.step.upload") : t("gen.state.waiting")}
                </span>
              </span>
            </motion.li>
            {steps.map((s, idx) => (
              <motion.li key={s.kind} className={`gen-step ${s.status}`} aria-current={s.status === "working" ? "step" : undefined} {...rowEnter(idx + 1, reduce)}>
                <span className="gs-ic"><StepIcon kind={s.kind} status={s.status} /></span>
                <Illus name={RESOURCE_ART[s.kind]} size={28} className="gs-art" />
                <span className="gs-name">
                  <b>{stepLabel(s.kind)}</b>
                  <span className="muted small">
                    {t(`gen.state.${s.status}` as "gen.state.done")}
                    {s.status === "working" ? ` · ${Math.round(s.progress)}%` : ""}
                  </span>
                  {s.status === "working" && (
                    <span className="gs-bar" role="progressbar" aria-label={stepLabel(s.kind)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.progress)}>
                      <i style={{ transform: `scaleX(${Math.max(0.04, s.progress / 100)})` }} />
                    </span>
                  )}
                </span>
                {s.status === "failed" && (
                  <Button size="sm" disabled={retry.isPending} onClick={() => retry.mutate(s.kind)} aria-label={`${t("common.tryAgain")}: ${stepLabel(s.kind)}`}>
                    <RotateCcw className="ic" aria-hidden="true" />
                    {t("common.tryAgain")}
                  </Button>
                )}
              </motion.li>
            ))}
          </ol>

          {retry.isError && <p className="err" role="alert">{errorMessage(retry.error)}</p>}
          {cancel.isError && <p className="err" role="alert">{errorMessage(cancel.error)}</p>}

          <div className="gen-actions">
            {confirming ? (
              <InlineConfirm message={t("gen.cancel.confirm")} confirmLabel={t("gen.cancel.yes")} cancelLabel={t("gen.cancel.no")} busy={cancel.isPending} onConfirm={() => cancel.mutate()} onCancel={() => setConfirming(false)} />
            ) : status === "FAILED" ? (
              <Button onClick={onCancelled}>{t("gen.back")}</Button>
            ) : !finished ? (
              <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
                <X className="ic" aria-hidden="true" />
                {t("gen.cancel")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
