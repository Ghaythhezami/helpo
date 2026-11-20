"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { RESOURCE_KINDS, type LessonDetail, type ResourceKind, type ResourceView } from "@helpo/shared";
import { AlertTriangle, ArrowRight, Check, Square } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { RESOURCE_ART, RESOURCE_CARD_CLASS, resourceMeta } from "@/lib/checks";
import { useI18n } from "@/lib/i18n";
import { qk, useLessonEvents } from "@/lib/queries";
import { Button, ButtonLink } from "@/components/ui/button";
import { Hero, Panel } from "@/components/ui/card";
import { Illus } from "@/components/ui/illus";
import { Pill } from "@/components/ui/pill";
import { Progress } from "@/components/ui/progress";
import { Async } from "@/components/ui/states";
import { BlueprintPanel } from "./lesson-actions";

export type StepState = "done" | "active" | "todo";

/** Honest pipeline steps from the lesson status: Uploading, Reading, Understanding, Making. */
export function pipelineSteps(status: LessonDetail["status"], chars: number): { id: "upload" | "read" | "understand" | "make"; state: StepState }[] {
  const order = ["DRAFT", "UPLOADED", "EXTRACTING", "ANALYZING", "ANALYZED", "GENERATING", "READY", "PARTIAL"];
  const at = order.indexOf(status);
  const done = (i: number) => at > i;
  return [
    { id: "upload", state: at >= 1 ? "done" : "active" },
    { id: "read", state: done(2) || (status === "EXTRACTING" && chars > 0) ? "done" : at >= 1 && at <= 2 ? "active" : at > 2 ? "done" : "todo" },
    { id: "understand", state: done(4) || status === "ANALYZED" ? "done" : status === "ANALYZING" || (status === "EXTRACTING" && chars > 0) ? "active" : "todo" },
    { id: "make", state: status === "READY" || status === "PARTIAL" ? "done" : status === "GENERATING" ? "active" : "todo" },
  ];
}

export function MakingView({ id }: { id: string }) {
  const lesson = useLessonEvents(id);
  const { t } = useI18n();
  return (
    <Async query={lesson} label={t("making.loading")}>
      {(data) => <Making lesson={data} />}
    </Async>
  );
}

export function Making({ lesson }: { lesson: LessonDetail }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();
  const [picked, setPicked] = useState<ResourceKind[]>([...RESOURCE_KINDS]);
  const [quizCount, setQuizCount] = useState(10);
  const [difficulty, setDifficulty] = useState<"" | "easy" | "medium" | "hard">("");
  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.lesson(lesson.id) });

  const generate = useMutation({
    mutationFn: () => api<LessonDetail>(`/lessons/${lesson.id}/generate`, { method: "POST", body: { resources: picked, quizCount, ...(difficulty ? { difficulty } : {}) } }),
    onSuccess: refresh,
  });
  const cancel = useMutation({ mutationFn: () => api(`/lessons/${lesson.id}/cancel`, { method: "POST" }), onSuccess: refresh });
  const retry = useMutation({
    mutationFn: (kind: ResourceKind) => api(`/lessons/${lesson.id}/resources/${kind}/retry`, { method: "POST" }),
    onSettled: refresh,
  });

  const status = lesson.status;
  const byKind = new Map<ResourceKind, ResourceView>(lesson.resources.map((r) => [r.kind, r]));
  const kinds = lesson.resources.length ? RESOURCE_KINDS.filter((k) => byKind.has(k)) : [...RESOURCE_KINDS];
  const ready = kinds.filter((k) => byKind.get(k)?.status === "READY").length;
  const failed = kinds.filter((k) => byKind.get(k)?.status === "FAILED");
  const processing = status === "UPLOADED" || status === "EXTRACTING" || status === "ANALYZING" || status === "DRAFT";
  const generating = status === "GENERATING";
  const usable = (status === "READY" || status === "PARTIAL") && ready > 0;
  const openChecks = lesson.checks.filter((c) => c.status === "OPEN").length;
  const steps = pipelineSteps(status, lesson.sourceChars);
  const quotaLeft = lesson.quota.limit - lesson.quota.used;

  return (
    <>
      <Hero className="making-hero">
        <div className="copy">
          <h1>{t("making.title", { title: lesson.title })}</h1>
          <p className="muted" role="status" aria-live="polite">
            {status === "FAILED" ? t("making.failed.line") : processing ? t("making.processing") : status === "ANALYZED" ? t("making.analyzed") : generating ? t("making.progress", { done: ready, total: kinds.length }) : t("making.done.line")}
          </p>
          {lesson.aiWritten && <p><span className="st chk">{t("check.aiWritten")}</span></p>}
        </div>
        <div className="act">
          {generating && (
            <Button variant="secondary" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              <Square className="ic" aria-hidden="true" />
              {t("making.stop")}
            </Button>
          )}
        </div>
      </Hero>

      <ol className="pipeline" aria-label={t("making.steps")}>
        {steps.map((s) => (
          <li key={s.id} className={s.state} aria-current={s.state === "active" ? "step" : undefined}>
            <span className="dot" aria-hidden="true">{s.state === "done" ? <Check className="ic" /> : null}</span>
            <span>{t(`making.step.${s.id}` as "making.step.upload")}</span>
            <span className="sr"> {t(`making.state.${s.state}` as "making.state.done")}</span>
          </li>
        ))}
      </ol>

      {status === "FAILED" && lesson.resources.length === 0 && (
        <Panel role="alert" style={{ borderColor: "#E2B64F" }}>
          <div className="callout"><AlertTriangle aria-hidden="true" /><div><b>{t("making.failed.title0")}</b><p>{t("making.failed.text0")}</p></div></div>
          <ButtonLink size="sm" href="/app/lessons/new">{t("making.back")}</ButtonLink>
        </Panel>
      )}

      {status === "ANALYZED" && (
        <>
          {lesson.blueprint && <BlueprintPanel blueprint={lesson.blueprint} />}
          <Panel aria-labelledby="gen-h" className="gen-options">
            <h2 id="gen-h" style={{ fontSize: 22, fontWeight: 900 }}>{t("making.options")}</h2>
            <fieldset className="nl-res">
              <legend className="lab">{t("new.resources")}</legend>
              {RESOURCE_KINDS.map((k) => (
                <label key={k}>
                  <input type="checkbox" checked={picked.includes(k)} onChange={(e) => setPicked((l) => (e.target.checked ? [...l, k] : l.filter((x) => x !== k)))} />
                  {t(`resource.${k}` as "resource.SLIDES")}
                </label>
              ))}
            </fieldset>
            <div className="acts" style={{ marginTop: 12 }}>
              <div className="field" style={{ marginTop: 0 }}>
                <label htmlFor="qcount">{t("making.quizCount")}</label>
                <select id="qcount" value={quizCount} onChange={(e) => setQuizCount(Number(e.target.value))}>
                  {[5, 8, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="field" style={{ marginTop: 0 }}>
                <label htmlFor="diff">{t("making.difficulty")}</label>
                <select id="diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
                  <option value="">{t("making.difficulty.auto")}</option>
                  {(["easy", "medium", "hard"] as const).map((d) => <option key={d} value={d}>{t(`difficulty.${d}` as "difficulty.easy")}</option>)}
                </select>
              </div>
            </div>
            {generate.isError && <p className="err" role="alert">{errorMessage(generate.error)}</p>}
            <div className="acts" style={{ marginTop: 16, alignItems: "center" }}>
              <Button size="big" disabled={picked.length === 0 || generate.isPending} onClick={() => generate.mutate()}>
                {generate.isPending ? t("new.making") : t("making.make")}
                <ArrowRight className="flip" aria-hidden="true" />
              </Button>
              <span className="muted small">{t("making.quota", { used: lesson.quota.used, limit: lesson.quota.limit, left: quotaLeft })}</span>
            </div>
          </Panel>
        </>
      )}

      {(generating || usable || lesson.resources.length > 0) && status !== "ANALYZED" && (
        <ul className="gen">
          {kinds.map((kind) => {
            const resource = byKind.get(kind);
            const rs = resource?.status ?? "WAITING";
            const state = rs === "READY" ? "done" : rs === "FAILED" ? "bad" : rs === "WORKING" ? "making" : "";
            return (
              <li key={kind} className={`gc ${RESOURCE_CARD_CLASS[kind]} ${state}`}>
                <Illus name={RESOURCE_ART[kind]} size={72} />
                <b>{t(`resource.${kind}` as "resource.SLIDES")}</b>
                <span className="m">{resource ? resourceMeta(resource, t) : t("resource.notMade")}</span>
                {rs === "READY" ? (
                  <Pill tone="ready">{t("status.ready")}</Pill>
                ) : rs === "FAILED" ? (
                  <>
                    <Pill tone="chk">{t("status.failed")}</Pill>
                    <Button size="sm" disabled={retry.isPending} onClick={() => retry.mutate(kind)} aria-label={`${t("common.tryAgain")}: ${t(`resource.${kind}` as "resource.SLIDES")}`}>{t("common.tryAgain")}</Button>
                  </>
                ) : (
                  <>
                    <Pill tone={rs === "WORKING" ? "soft" : "neu"} icon={false}>{rs === "WORKING" ? t("status.working") : t("status.waiting")}</Pill>
                    {rs === "WORKING" ? <Progress value={resource?.progress ?? 0} max={100} label={`${t(`resource.${kind}` as "resource.SLIDES")}: ${resource?.progress ?? 0}%`} /> : <span className="skel" aria-hidden="true"><i /><i /></span>}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {failed.length > 0 && !generating && (
        <Panel role="alert" style={{ borderColor: "#E2B64F" }}>
          <div className="callout">
            <AlertTriangle aria-hidden="true" />
            <div>
              <b>{t("making.failed.title", { names: failed.map((k) => t(`resource.${k}` as "resource.SLIDES")).join(", ") })}</b>
              <p>{t("making.failed.text")}</p>
              {retry.isError && <p className="err">{errorMessage(retry.error)}</p>}
            </div>
          </div>
        </Panel>
      )}

      {usable && (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: reduce ? 0.15 : 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <Panel className="success wave" aria-labelledby="done-h">
            <Illus name="star-buddy" size={100} />
            <div className="tx">
              <h2 id="done-h">{lesson.generation.seconds !== null ? t("making.done.title", { n: Math.round(lesson.generation.seconds) }) : t("making.done.titleNoTime")}</h2>
              <p className="muted">{t("making.done.text", { n: ready, checks: openChecks })}</p>
            </div>
            <ButtonLink size="big" href={`/app/lessons/${lesson.id}/check`}>
              {t("making.done.cta")}
              <ArrowRight className="flip" aria-hidden="true" />
            </ButtonLink>
          </Panel>
        </motion.div>
      )}
    </>
  );
}
