"use client";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BADGES, TEACHER_AWARDABLE_BADGES, type BadgeKey, type LessonDetail, type ReteachPlan, type ResultsView as Results } from "@helpo/shared";
import { Award, ChartColumn, Check, Gamepad2, HeartHandshake, LifeBuoy, Lightbulb, Minus, Repeat, Rocket, Table, Target, TrendingDown, TriangleAlert, X } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { initials, pct } from "@/lib/format";
import { useI18n, type TFunction } from "@/lib/i18n";
import { qk, useClassDetail, useLesson, useResults } from "@/lib/queries";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel, PillHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Progress } from "@/components/ui/progress";
import { Async, EmptyState } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { Donut, LineChart, StatusMark, TargetBar, masteryStatus } from "./charts";

export function ResultsView({ id }: { id: string }) {
  const lesson = useLesson(id);
  const results = useResults(id);
  const { t } = useI18n();
  return (
    <Async query={lesson} label={t("nav.results")}>
      {(l) => (
        <Async query={results} label={t("nav.results")}>
          {(r) => <ResultsBody lesson={l} results={r} />}
        </Async>
      )}
    </Async>
  );
}

/** One plain sentence: who answered, the average, and what needs another look. */
export function headline(results: Results, t: TFunction): string {
  if (results.average === null || results.answered === 0) return t("results.headline.none");
  const weakest = [...results.mastery].sort((a, b) => a.value - b.value)[0];
  const base = t("results.headline", { answered: results.answered, total: results.classSize, avg: Math.round(results.average * 100) });
  return weakest && weakest.value < 0.7 ? `${base} ${t("results.headline.weak", { code: weakest.code, pct: Math.round(weakest.value * 100) })}` : `${base} ${t("results.headline.good")}`;
}

function TableToggle({ pressed, onToggle }: { pressed: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" className="tg" aria-pressed={pressed} onClick={onToggle} style={{ marginTop: 12 }}>
      <Table className="ic" aria-hidden="true" />
      {t("results.viewTable")}
    </button>
  );
}

function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <table className="dt">
      <caption className="sr">{caption}</caption>
      <thead>
        <tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>{row.map((cell, k) => <td key={k}>{cell}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

export function ResultsBody({ lesson, results }: { lesson: LessonDetail; results: Results }) {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const cls = useClassDetail(lesson.classId);
  const [tab, setTab] = useState<ResTab>("questions");
  const [tables, setTables] = useState<Record<string, boolean>>({});
  const flip = (k: string) => setTables((s) => ({ ...s, [k]: !s[k] }));

  const cells = results.grid.flatMap((g) => g.cells);
  const correct = cells.filter((c) => c === "correct").length;
  const wrong = cells.filter((c) => c === "wrong" || c === "partial").length;
  const best = results.grid.reduce((m, g) => Math.max(m, g.score), 0);
  const byLesson = (cls.data?.lessons ?? [])
    .filter((l) => l.averageScore !== null)
    .sort((a, b) => (a.lessonNumber ?? 0) - (b.lessonNumber ?? 0))
    .map((l, i) => ({ label: l.lessonNumber ? `L${l.lessonNumber}` : `#${i + 1}`, value: l.averageScore as number }));
  const nextNumber = (lesson.lessonNumber ?? 0) + 1;
  const noData = results.sessionId === null || results.answered === 0;

  const reteach = useMutation({ mutationFn: () => api<ReteachPlan>(`/lessons/${lesson.id}/reteach`, { method: "POST" }) });
  const addToNext = useMutation({
    mutationFn: (plan: ReteachPlan) =>
      api<LessonDetail>("/lessons", {
        method: "POST",
        body: {
          classId: lesson.classId,
          title: `${plan.warmUpTitle}`.slice(0, 140),
          lessonNumber: nextNumber <= 99 ? nextNumber : undefined,
          unitTitle: lesson.unitTitle ?? undefined,
          durationMin: lesson.durationMin,
          description: [plan.warmUpTitle, ...plan.warmUpSteps, plan.smallGroupTask].join("\n"),
          contentLocale: lesson.contentLocale,
        },
      }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: qk.dashboard });
      await queryClient.invalidateQueries({ queryKey: qk.class(lesson.classId) });
      toast.show(t("results.reteach.added", { n: nextNumber }));
      router.push(`/app/lessons/new?from=${created.id}`);
    },
    onError: (e) => toast.show(errorMessage(e)),
  });

  return (
    <>
      <ResultsSummary lesson={lesson} results={results} reteach={reteach} />
      <Tabs group="res" label={t("results.tabs")} value={tab} onChange={(v) => setTab(v as ResTab)} tabs={[{ id: "questions", label: t("results.tab.questions") }, { id: "students", label: t("results.tab.students") }, { id: "concepts", label: t("results.tab.concepts") }, { id: "more", label: t("results.tab.more") }]} />

      {noData ? (
        <Panel>
          <EmptyState art="cup" title={t("results.empty.title")} action={<ButtonLink size="sm" href={`/app/lessons/${lesson.id}/teach`}>{t("results.empty.cta")}</ButtonLink>}>
            {t("results.empty.text")}
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid2 results-tabs">
          <div className="stack">
            {tab === "concepts" && (<Panel aria-labelledby="avg-h">
              <PillHeader id="avg-h" icon={<ChartColumn aria-hidden="true" />}>{t("results.average")}</PillHeader>
              {tables.donut ? (
                <DataTable caption={t("results.answersByResult")} head={[t("results.col.result"), t("results.col.answers"), t("results.col.share")]} rows={[[t("results.correct"), correct, pct(correct / Math.max(1, correct + wrong))], [t("results.notYet"), wrong, pct(wrong / Math.max(1, correct + wrong))]]} />
              ) : (
                <Donut value={results.average ?? 0} correct={correct} wrong={wrong} />
              )}
              <TableToggle pressed={Boolean(tables.donut)} onToggle={() => flip("donut")} />
              <div className="tiles" style={{ marginTop: 16 }}>
                <div className="tile"><span className="muted small">{t("results.tile.correct")}</span><b><bdi dir="ltr">{correct} / {correct + wrong}</bdi></b></div>
                <div className="tile"><span className="muted small">{t("results.tile.answered")}</span><b><bdi dir="ltr">{results.answered} / {results.classSize}</bdi></b></div>
                <div className="tile"><span className="muted small">{t("results.tile.best")}</span><b>{pct(best)}</b></div>
              </div>
            </Panel>)}

            {tab === "concepts" && (<Panel aria-labelledby="line-h">
              <PillHeader id="line-h" icon={<TrendingDown aria-hidden="true" />}>{t("results.byLesson")}</PillHeader>
              {byLesson.length === 0 ? (
                <p className="muted" style={{ marginTop: 12 }}>{t("results.byLesson.empty")}</p>
              ) : (
                <>
                  <div style={{ marginTop: 12 }}>
                    {tables.line ? (
                      <DataTable caption={t("results.byLesson")} head={[t("results.col.lesson"), t("results.average")]} rows={byLesson.map((p) => [p.label, pct(p.value)])} />
                    ) : (
                      <LineChart points={byLesson} label={t("results.line.aria", { from: Math.round(byLesson[0].value * 100), to: Math.round(byLesson[byLesson.length - 1].value * 100) })} />
                    )}
                  </div>
                  <TableToggle pressed={Boolean(tables.line)} onToggle={() => flip("line")} />
                </>
              )}
            </Panel>)}

            {tab === "questions" && (<Panel aria-labelledby="q-h">
              <PillHeader id="q-h" icon={<Target aria-hidden="true" />}>{t("results.byQuestion")}</PillHeader>
              {tables.q ? (
                <DataTable caption={t("results.byQuestion")} head={[t("results.col.question"), t("results.col.objective"), t("results.col.correct")]} rows={results.questions.map((q) => [`${q.id} ${q.prompt}`, q.objectiveCode, pct(q.percent)])} />
              ) : (
                <div className="chart">
                  {results.questions.map((q) => (
                    <div key={q.id} className="mrow pr">
                      <span><b>{q.id}</b> {q.prompt.length > 48 ? `${q.prompt.slice(0, 48)}…` : q.prompt}</span>
                      <Progress value={q.percent ?? 0} label={`${q.id}: ${pct(q.percent)}`} />
                      <span className="mk2">{pct(q.percent)}</span>
                    </div>
                  ))}
                </div>
              )}
              <TableToggle pressed={Boolean(tables.q)} onToggle={() => flip("q")} />
              {results.misconception && (
                <div className="callout" style={{ marginTop: 16 }}>
                  <TriangleAlert aria-hidden="true" />
                  <div>
                    <b>{t("results.misconception", { q: `Q${results.misconception.questionIndex + 1}` })}</b> {results.misconception.note}
                  </div>
                </div>
              )}
            </Panel>)}

            {tab === "students" && (<Panel aria-labelledby="grid-h">
              <PillHeader id="grid-h" icon={<Table aria-hidden="true" />}>{t("results.grid")}</PillHeader>
              <p className="muted small" style={{ marginTop: 12 }}>{t("results.grid.note")}</p>
              <div className="gridscroll" tabIndex={0} role="region" aria-label={t("results.grid")}>
                <table className="dt gridtbl">
                  <thead>
                    <tr>
                      <th scope="col">{t("results.col.student")}</th>
                      {results.questions.map((q) => <th key={q.id} scope="col">{q.id}</th>)}
                      <th scope="col">{t("results.col.score")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.grid.map((g) => (
                      <tr key={g.participantId}>
                        <th scope="row">{g.name}</th>
                        {g.cells.map((c, i) => (
                          <td key={i} className={`cell ${c}`}>
                            {c === "correct" ? <Check className="ic" aria-hidden="true" /> : c === "wrong" ? <X className="ic" aria-hidden="true" /> : c === "partial" ? <Minus className="ic" aria-hidden="true" /> : <span aria-hidden="true">·</span>}
                            <span className="sr">{t(`cell.${c}` as "cell.correct")}</span>
                          </td>
                        ))}
                        <td>{pct(g.score)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>)}

            {tab === "more" && (<GameInsights results={results} />)}
          </div>

          <div className="stack">
            {tab === "concepts" && (<Panel aria-labelledby="ms-h">
              <PillHeader id="ms-h" icon={<Target aria-hidden="true" />}>{t("results.mastery")}</PillHeader>
              {tables.mastery ? (
                <DataTable caption={t("results.mastery")} head={[t("results.col.objective"), t("results.col.score"), t("results.col.target")]} rows={results.mastery.map((m) => [`${m.code} ${m.text}`, pct(m.value), "70%"])} />
              ) : (
                <div className="chart">
                  {results.mastery.map((m) => {
                    const status = masteryStatus(m.value);
                    return (
                      <div key={m.code} className="mrow">
                        <span><b>{m.code}</b> {t(`bloom.${m.bloom}` as "bloom.remember")}</span>
                        <TargetBar value={m.value} label={m.code} />
                        <StatusMark status={status}>{`${pct(m.value)} ${t(`mastery.${status}` as "mastery.met")}`}</StatusMark>
                      </div>
                    );
                  })}
                  <p className="muted small">{t("results.mastery.note")}</p>
                </div>
              )}
              <TableToggle pressed={Boolean(tables.mastery)} onToggle={() => flip("mastery")} />
            </Panel>)}

            {tab === "students" && (<Panel aria-labelledby="help-h">
              <PillHeader id="help-h" icon={<LifeBuoy aria-hidden="true" />}>{t("results.needsHelp")}</PillHeader>
              {results.needsHelp.length === 0 ? (
                <p className="muted" style={{ marginTop: 12 }}>{t("results.needsHelp.none")}</p>
              ) : (
                <ul className="people" style={{ marginTop: 8 }}>
                  {results.needsHelp.map((p) => (
                    <li key={p.participantId}>
                      <span className="ini" aria-hidden="true">{initials(p.name)}</span>
                      <span style={{ flex: 1 }}>{p.name}{p.missed.length > 0 && <span className="muted small"> · {t("results.missed", { list: p.missed.join(", ") })}</span>}</span>
                      <Pill tone="soft" icon={false}>{pct(p.score)}</Pill>
                    </li>
                  ))}
                </ul>
              )}
              <h3 style={{ marginTop: 16, fontWeight: 900, fontSize: 17 }}>{t("results.notSubmitted", { n: results.notSubmitted.length })}</h3>
              {results.notSubmitted.length === 0 ? (
                <p className="muted">{t("results.notSubmitted.none")}</p>
              ) : (
                <ul className="people">
                  {results.notSubmitted.map((p) => (
                    <li key={p.studentId}>
                      <span className="ini" aria-hidden="true">{initials(p.name)}</span>
                      <span style={{ flex: 1 }}>{p.name}</span>
                      <Pill tone="neu" icon={false}>{t("results.noAnswers")}</Pill>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>)}

            {tab === "more" && (<AwardBadge classId={lesson.classId} students={cls.data?.students ?? []} />)}

            {tab === "more" && (<Panel aria-labelledby="rt-h">
              <PillHeader id="rt-h" icon={<Repeat aria-hidden="true" />}>{t("results.reteach")}</PillHeader>
              {reteach.data ? (
                <div style={{ marginTop: 12 }}>
                  <p><b>{reteach.data.warmUpTitle}</b></p>
                  <ol className="optl">
                    {reteach.data.warmUpSteps.map((s, i) => (
                      <li key={i}><span className="l">{i + 1}</span><span>{s}</span></li>
                    ))}
                  </ol>
                  <p className="keyline" style={{ marginTop: 8 }}><b>{t("results.reteach.group")}</b> {reteach.data.smallGroupTask}</p>
                  <p className="muted small">{t("results.reteach.target", { code: reteach.data.targetObjectiveCode })}</p>
                </div>
              ) : (
                <p className="muted" style={{ marginTop: 12 }}>{t("results.reteach.text")}</p>
              )}
              {reteach.isError && <p className="err" role="alert">{errorMessage(reteach.error)}</p>}
              <div className="acts" style={{ marginTop: 12 }}>
                <Button size="sm" variant={reteach.data ? "secondary" : "primary"} disabled={reteach.isPending} onClick={() => reteach.mutate()}>
                  <Rocket className="ic" aria-hidden="true" />
                  {reteach.isPending ? t("results.reteach.making") : reteach.data ? t("results.reteach.again") : t("results.reteach.make")}
                </Button>
                {reteach.data && (
                  <Button size="sm" disabled={addToNext.isPending} onClick={() => addToNext.mutate(reteach.data)}>
                    {t("results.addTo", { n: nextNumber })}
                  </Button>
                )}
              </div>
            </Panel>)}
          </div>
        </div>
      )}
    </>
  );
}

function GameInsights({ results }: { results: Results }) {
  const { t } = useI18n();
  return (
    <Panel aria-labelledby="gi-h">
      <PillHeader id="gi-h" icon={<Gamepad2 aria-hidden="true" />}>{t("results.games")}</PillHeader>
      {results.gameInsights.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>{t("results.games.none")}</p>
      ) : (
        <div className="tiles" style={{ marginTop: 16 }}>
          {results.gameInsights.map((g) => (
            <div className="tile" key={g.game}>
              <span className="muted small">{t(`game.${g.game}` as "game.MATCH")}</span>
              <b>{t("results.stars", { n: g.averageStars.toFixed(1) })}</b>
              <span className="small">{t("results.plays", { n: g.plays })}</span>
            </div>
          ))}
        </div>
      )}
      <h3 style={{ marginTop: 16, fontWeight: 900, fontSize: 17 }}>{t("results.goal")}</h3>
      <p style={{ marginTop: 8 }}>{t("results.goal.text", { earned: results.classGoal.earnedXp, goal: results.classGoal.goalXp })}</p>
      <Progress large value={results.classGoal.earnedXp} max={Math.max(1, results.classGoal.goalXp)} label={t("results.goal")} />
      <p className="muted small" style={{ marginTop: 8 }}>{t("results.goal.note")}</p>
      <div className="callout" style={{ marginTop: 16 }}>
        <Lightbulb aria-hidden="true" />
        <div>{t("results.games.tip")}</div>
      </div>
    </Panel>
  );
}

function AwardBadge({ students }: { classId: string; students: { id: string; fullName: string; displayName: string; badges: BadgeKey[] }[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [badge, setBadge] = useState<BadgeKey>(TEACHER_AWARDABLE_BADGES[0]);
  const [picked, setPicked] = useState<string[]>([]);
  const [log, setLog] = useState<string | null>(null);
  const sorted = [...students].sort((a, b) => a.fullName.localeCompare(b.fullName));

  const award = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => api(`/students/${id}/badges`, { method: "POST", body: { badge } })));
      return ids;
    },
    onSuccess: async (ids) => {
      setPicked([]);
      const name = BADGES[badge].name;
      setLog(t("results.award.log", { n: ids.length, badge: t(`badge.${badge}` as "badge.KIND_HELPER") || name }));
      await queryClient.invalidateQueries({ queryKey: ["classes"] });
      toast.show(t("results.award.toast", { n: ids.length }), {
        undoLabel: t("common.undo"),
        undo: async () => {
          await Promise.all(ids.map((id) => api(`/students/${id}/badges/${badge}`, { method: "DELETE" }).catch(() => undefined)));
          setLog(null);
          await queryClient.invalidateQueries({ queryKey: ["classes"] });
        },
      });
    },
    onError: (e) => toast.show(errorMessage(e)),
  });

  return (
    <Panel aria-labelledby="award-h">
      <PillHeader id="award-h" icon={<Award aria-hidden="true" />}>{t("results.award")}</PillHeader>
      <p className="muted small" style={{ marginTop: 12 }}>{t("results.award.note")}</p>
      <div className="stk2" role="radiogroup" aria-label={t("results.award.badge")}>
        {TEACHER_AWARDABLE_BADGES.map((b) => (
          <button key={b} type="button" role="radio" aria-checked={badge === b} onClick={() => setBadge(b)}>
            {b === "KIND_HELPER" ? <HeartHandshake className="ic" aria-hidden="true" /> : <Rocket className="ic" aria-hidden="true" />}
            {t(`badge.${b}` as "badge.KIND_HELPER")}
          </button>
        ))}
      </div>
      {sorted.length === 0 ? (
        <p className="muted">{t("results.award.none")}</p>
      ) : (
        <ul className="awl" aria-label={t("results.award.students")}>
          {sorted.map((s) => (
            <li key={s.id}>
              <label>
                <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))} />
                <span className="ini" aria-hidden="true">{initials(s.fullName)}</span>
                <span>{s.fullName}</span>
              </label>
              <span className="got">{s.badges.filter((b) => TEACHER_AWARDABLE_BADGES.includes(b)).map((b) => <Pill key={b} tone="ready" icon={false}>{t(`badge.${b}` as "badge.KIND_HELPER")}</Pill>)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="acts" style={{ marginTop: 12, alignItems: "center" }}>
        <Button size="sm" disabled={picked.length === 0 || award.isPending} onClick={() => award.mutate(picked)}>{t("results.award")}</Button>
        <span className="muted small" role="status" aria-live="polite">{picked.length === 0 ? t("results.award.hint") : t("results.award.selected", { n: picked.length })}</span>
      </div>
      {log && <p className="muted small" style={{ marginTop: 8 }}>{log}</p>}
    </Panel>
  );
}

type ResTab = "questions" | "students" | "concepts" | "more";

/** Three numbers first, then what to do next: weakest concept, a re-teach suggestion and who needs help. */
function ResultsSummary({ results, reteach }: { lesson: LessonDetail; results: Results; reteach: { data?: ReteachPlan; isPending: boolean; mutate: () => void } }) {
  const { t } = useI18n();
  const weakest = [...results.mastery].sort((a, b) => a.value - b.value)[0];
  const minutes = typeof results.averageTimeSec === "number" ? Math.round(results.averageTimeSec / 60) : null;
  return (
    <>
      <div className="res-numbers" role="group" aria-label={t("results.numbers")}>
        <div className="tile"><span className="muted small">{t("results.joined")}</span><b><bdi dir="ltr">{results.answered} / {results.classSize}</bdi></b></div>
        <div className="tile"><span className="muted small">{t("results.average")}</span><b>{pct(results.average)}</b></div>
        <div className="tile"><span className="muted small">{t("results.time")}</span><b>{minutes === null ? "–" : t("min.n", { n: Math.max(1, minutes) })}</b></div>
      </div>
      <Panel aria-labelledby="next-h" className="res-next">
        <h2 id="next-h" style={{ fontSize: 20, fontWeight: 900 }}>{t("results.next")}</h2>
        <ul className="bp-list">
          {weakest && weakest.value < 0.7 ? <li><b>{t("results.next.weak", { code: weakest.code, pct: Math.round(weakest.value * 100) })}</b> {weakest.text}</li> : <li>{t("results.headline.good")}</li>}
          {results.misconception && <li>{results.misconception.note}</li>}
          <li>{reteach.data ? reteach.data.warmUpTitle : t("results.next.reteach")}</li>
          {results.needsHelp.length > 0 && <li>{t("results.next.help", { names: results.needsHelp.slice(0, 4).map((p) => p.name).join(", ") })}</li>}
        </ul>
        {!reteach.data && <Button size="sm" disabled={reteach.isPending} onClick={() => reteach.mutate()}>{reteach.isPending ? t("results.reteach.making") : t("results.reteach.make")}</Button>}
      </Panel>
    </>
  );
}
