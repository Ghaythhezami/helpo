"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type FormEvent } from "react";
import { MAX_GRADE, MIN_GRADE, bandForGrade, type ClassDetail, type ClassSettings, type ClassSummary, type LessonSummary, type StudentSummary } from "@helpo/shared";
import { Plus, SlidersHorizontal, Users } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { BANDS_IN_ORDER, bandSentence } from "@/lib/band";
import { initials, parseNames } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { tn } from "@/lib/messages";
import { qk } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Panel, PillHeader } from "@/components/ui/card";
import { InlineConfirm } from "@/components/ui/confirm";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";

export function CreateClass({ onCreated }: { onCreated?: (c: ClassSummary) => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [grade, setGrade] = useState(6);
  const [subject, setSubject] = useState("Science");
  const [error, setError] = useState<string | null>(null);
  const gradeId = useId();

  const create = useMutation({
    mutationFn: () => api<ClassSummary>("/classes", { method: "POST", body: { name: name.trim(), grade, subject: subject.trim() || "Science" } }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: qk.classes });
      await queryClient.invalidateQueries({ queryKey: qk.dashboard });
      toast.show(t("classes.created", { name: created.name }));
      onCreated?.(created);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!name.trim()) return setError(t("classes.nameError"));
    create.mutate();
  }

  return (
    <Panel aria-labelledby="create-class-h">
      <PillHeader id="create-class-h" icon={<Plus aria-hidden="true" />}>{t("classes.create")}</PillHeader>
      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="class-name">{t("classes.name")}</label>
          <input id="class-name" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="6B" />
        </div>
        <div className="field">
          <label htmlFor={gradeId}>{t("classes.grade")}</label>
          <select id={gradeId} value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
            {Array.from({ length: MAX_GRADE - MIN_GRADE + 1 }, (_, i) => MIN_GRADE + i).map((g) => (
              <option key={g} value={g}>{t("grade.n", { n: g })} · {t(`band.${bandForGrade(g)}` as "band.EXPLORER")}</option>
            ))}
          </select>
          <p className="hint">{bandSentence(grade, t)}</p>
        </div>
        <div className="field">
          <label htmlFor="class-subject">{t("classes.subject")}</label>
          <input id="class-subject" value={subject} maxLength={40} onChange={(e) => setSubject(e.target.value)} />
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <div className="acts" style={{ marginTop: 16 }}>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? t("classes.creating") : t("classes.create")}</Button>
        </div>
      </form>
    </Panel>
  );
}

/* ------------------------------- My class (hub) ------------------------------- */

const STOPS: [number, number][] = [
  [11.5, 59.5],
  [28.1, 40.5],
  [44.8, 59.5],
  [61.5, 40.5],
  [78.1, 59.5],
  [90.6, 40.5],
];

export type StopState = "done" | "cur" | "lock";

/** Lessons in order, with the first lesson that has not been taught as the current stop. */
export function worldStops(lessons: LessonSummary[]): { number: number; note: "mastery" | "title" | "locked" | "plan"; state: StopState; lesson: LessonSummary | null }[] {
  const sorted = [...lessons].sort((a, b) => (a.lessonNumber ?? 99) - (b.lessonNumber ?? 99)).slice(0, STOPS.length);
  let currentSet = false;
  const stops: { number: number; note: "mastery" | "title" | "locked" | "plan"; state: StopState; lesson: LessonSummary | null }[] = sorted.map((lesson, i) => {
    const taught = lesson.averageScore !== null;
    const state: StopState = taught ? "done" : currentSet ? "lock" : "cur";
    if (!taught && !currentSet) currentSet = true;
    return { number: lesson.lessonNumber ?? i + 1, note: (taught ? "mastery" : state === "cur" ? "title" : "locked") as "mastery" | "title" | "locked", state, lesson };
  });
  for (let i = stops.length; i < STOPS.length; i++) stops.push({ number: i + 1, note: "plan", state: "lock", lesson: null });
  return stops;
}

const SETTING_ROWS = ["pointsEnabled", "teamsEnabled", "soundsEnabled", "celebrationsEnabled"] as const;

export function GamificationSettings({ cls }: { cls: ClassDetail }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const baseId = useId();
  const [goalText, setGoalText] = useState(String(cls.settings.weeklyGoalXp));

  const patch = useMutation({
    mutationFn: (body: Partial<ClassSettings>) => api<ClassSettings>(`/classes/${cls.id}/settings`, { method: "PATCH", body }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: qk.class(cls.id) });
      const previous = queryClient.getQueryData<ClassDetail>(qk.class(cls.id));
      if (previous) queryClient.setQueryData<ClassDetail>(qk.class(cls.id), { ...previous, settings: { ...previous.settings, ...body } });
      return { previous };
    },
    onError: (error, _body, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(qk.class(cls.id), ctx.previous);
      toast.show(errorMessage(error));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: qk.class(cls.id) }),
  });

  const s = cls.settings;
  return (
    <Panel aria-labelledby="gs-h">
      <PillHeader id="gs-h" icon={<SlidersHorizontal aria-hidden="true" />}>{t("hub.settings")}</PillHeader>
      <p className="muted small" style={{ marginTop: 12 }}>{t("hub.settings.note", { name: cls.name })}</p>
      <ul className="toggles">
        {SETTING_ROWS.map((key) => (
          <li key={key}>
            <div>
              <div className="gh">
                <b id={`${baseId}-${key}`}>{t(`setting.${key}` as "setting.pointsEnabled")}</b>
                <Pill tone={s[key] ? "ready" : "neu"}>{s[key] ? t("common.on") : t("common.off")}</Pill>
              </div>
              <p className="muted small">{t(`setting.${key}.text` as "setting.pointsEnabled.text")}</p>
            </div>
            <Switch checked={s[key]} labelledBy={`${baseId}-${key}`} onChange={(v) => patch.mutate({ [key]: v })} />
          </li>
        ))}
      </ul>
      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault();
          const value = Number(goalText);
          if (!Number.isInteger(value) || value < 50 || value > 10000) return toast.show(t("hub.settings.goalError"));
          patch.mutate({ weeklyGoalXp: value });
        }}
      >
        <label htmlFor={`${baseId}-goal`}>{t("hub.settings.goal")}</label>
        <div className="acts">
          <input id={`${baseId}-goal`} inputMode="numeric" value={goalText} onChange={(e) => setGoalText(e.target.value)} style={{ maxWidth: 160 }} />
          <Button type="submit" size="sm" variant="secondary">{t("hub.settings.save")}</Button>
        </div>
      </form>
      <h3 style={{ marginTop: 16, fontWeight: 900, fontSize: 17 }}>{t("hub.settings.defaults")}</h3>
      <div className="bands">
        {BANDS_IN_ORDER.map((b) => (
          <div key={b} className={`bandc ${b === cls.band ? "on" : ""}`}>
            <b>{t(`band.${b}` as "band.EXPLORER")}{b === cls.band ? ` (${t("hub.settings.thisClass")})` : ""}</b>
            <span className="muted">{t(`band.${b}.grades` as "band.EXPLORER.grades")}. {t(`band.${b}.summary` as "band.EXPLORER.summary")}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function Roster({ cls }: { cls: ClassDetail }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<StudentSummary | null>(null);
  const names = parseNames(text);

  const add = useMutation({
    mutationFn: () => api<StudentSummary[]>(`/classes/${cls.id}/students`, { method: "POST", body: { names } }),
    onSuccess: async (added) => {
      setText("");
      setError(null);
      toast.show(t("roster.added", { n: added.length }));
      await queryClient.invalidateQueries({ queryKey: qk.class(cls.id) });
      await queryClient.invalidateQueries({ queryKey: qk.classes });
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/classes/${cls.id}/students/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setRemoving(null);
      await queryClient.invalidateQueries({ queryKey: qk.class(cls.id) });
      await queryClient.invalidateQueries({ queryKey: qk.classes });
    },
    onError: (e) => toast.show(errorMessage(e)),
  });

  const sorted = [...cls.students].sort((a, b) => a.fullName.localeCompare(b.fullName));

  return (
    <Panel aria-labelledby="roster-h">
      <PillHeader id="roster-h" icon={<Users aria-hidden="true" />}>{t("roster.title")}</PillHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (names.length === 0) return setError(t("roster.error.none"));
          if (names.length > 60) return setError(t("roster.error.max"));
          add.mutate();
        }}
      >
        <div className="field">
          <label htmlFor="roster-names">{t("roster.paste")}</label>
          <textarea id="roster-names" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Sara Ahmed\nOmar Kacem"} style={{ minHeight: 96 }} />
          <p className="hint">{t("roster.hint")}</p>
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <div className="acts" style={{ marginTop: 12 }}>
          <Button type="submit" size="sm" disabled={add.isPending}>{names.length > 0 ? tn(t, "roster.add", names.length) : t("roster.add.empty")}</Button>
        </div>
      </form>
      {sorted.length === 0 ? (
        <EmptyState art="star-buddy" title={t("roster.empty")}>{t("roster.empty.text")}</EmptyState>
      ) : (
        <ul className="people" aria-label={t("roster.list", { name: cls.name })} style={{ marginTop: 12 }}>
          {sorted.map((s) => (
            <li key={s.id}>
              <span className="ini" aria-hidden="true">{initials(s.fullName)}</span>
              <span style={{ flex: 1 }}>
                {s.fullName}
                <span className="muted small"> · {t("roster.shownAs", { name: s.displayName })}</span>
              </span>
              <Pill tone="soft" icon={false}>{t("student.levelShort", { level: s.level })}</Pill>
              <Button size="sm" variant="ghost" aria-label={t("roster.remove.aria", { name: s.fullName })} onClick={() => setRemoving(s)}>{t("common.remove")}</Button>
            </li>
          ))}
        </ul>
      )}
      {removing && (
        <InlineConfirm
          message={t("roster.remove.confirm", { name: removing.fullName, class: cls.name })}
          confirmLabel={t("roster.remove.yes")}
          cancelLabel={t("roster.remove.keep")}
          busy={remove.isPending}
          onConfirm={() => remove.mutate(removing.id)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </Panel>
  );
}
