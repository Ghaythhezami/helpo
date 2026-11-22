"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { LOCALES, LOCALE_LABELS, type ClassSummary, type Locale, type RefinedPrompt } from "@helpo/shared";
import { FileText, Settings2, Sparkles, X } from "lucide-react";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { qk, useClasses, useLessons } from "@/lib/queries";
import { LessonCard, LessonsDialog } from "./lessons-dialog";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Illus } from "@/components/ui/illus";
import { Skeleton } from "@/components/ui/motion";
import { ErrorState } from "@/components/ui/states";
import { ClassManager } from "./class-manager";
import { useSelectedClassId } from "./shell";
import { PROMPT_MAX, PROMPT_MIN, formatSize, titleFromFile, validateFile } from "@/lib/upload";

const FILE_TYPES = ".pdf,.docx,.pptx,.txt,.md";
const RANGE = /^\d{1,4}-\d{1,4}$/;

/** Screen 1: upload a file or describe a lesson, then see earlier lessons. Fits the viewport, never scrolls the page. */
export function CreateScreen() {
  const classes = useClasses();
  const { t } = useI18n();
  const [manage, setManage] = useState(false);
  if (classes.isPending) {
    return (
      <div className="create" role="status" aria-busy="true">
        <div className="create-skel">
          <Skeleton block={{ h: 34, w: "58%", r: 10 }} />
          <Skeleton block={{ h: 112, r: 24 }} />
          <Skeleton block={{ h: 96, r: 20 }} />
          <Skeleton block={{ h: 56, r: 999 }} />
        </div>
        <span className="sr">{t("common.loading")}…</span>
      </div>
    );
  }
  // A failed load is not "no classes yet": say so and offer a retry instead of the empty state.
  if (classes.isError) return <ErrorState error={classes.error} onRetry={() => void classes.refetch()} />;
  const list = classes.data ?? [];
  return (
    <div className="create">
      {list.length === 0 ? (
        <div className="create-empty">
          <Illus name="sprout-sun" size={96} />
          <h1 className="nl-title compact">{t("new.noClass.title")}</h1>
          <p className="nl-sub">{t("new.noClass.text")}</p>
          <Button size="big" onClick={() => setManage(true)}>{t("classes.create")}</Button>
        </div>
      ) : (
        <CreateForm classes={list} onManage={() => setManage(true)} />
      )}
      {manage && (
        <Dialog title={t("classes.title")} onClose={() => setManage(false)} wide>
          <ClassManager />
        </Dialog>
      )}
    </div>
  );
}

function CreateForm({ classes, onManage }: { classes: ClassSummary[]; onManage: () => void }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { classId: selected, setClassId } = useSelectedClassId();
  const classId = classes.find((c) => c.id === selected)?.id ?? classes[0].id;
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState<Locale>(locale);
  const [duration, setDuration] = useState(45);
  const [title, setTitle] = useState("");
  const [pageRange, setPageRange] = useState("");
  const [needRange, setNeedRange] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [before, setBefore] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [refineError, setRefineError] = useState<string | null>(null);

  const refine = useMutation({
    mutationFn: () => api<RefinedPrompt>("/lessons/refine-prompt", { method: "POST", body: { prompt: prompt.trim(), classId, locale } }),
    onMutate: () => setRefineError(null),
    onSuccess: (res) => {
      setBefore(prompt);
      setPrompt(res.prompt);
      setSuggestions(res.suggestions.slice(0, 3));
    },
    onError: () => setRefineError(t("refine.error")),
  });

  const lessonTitle = title.trim() || (file ? titleFromFile(file.name) : "");
  const chips = [t("create.chip1"), t("create.chip2"), t("create.chip3")];

  function choose(next: File | null) {
    setFileError(null);
    setDuplicate(null);
    setNeedRange(false);
    if (!next) return;
    const problem = validateFile(next);
    if (problem) return setFileError(problem === "type" ? t("new.file.type") : t("new.file.size"));
    setFile(next);
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    choose(e.dataTransfer.files?.[0] ?? null);
  }

  const create = useMutation({
    mutationFn: async (reuse: boolean) => {
      const form = new FormData();
      form.append("classId", classId);
      if (lessonTitle) form.append("title", lessonTitle);
      if (prompt.trim()) form.append("prompt", prompt.trim());
      form.append("durationMin", String(duration));
      form.append("contentLocale", language);
      form.append("reuse", String(reuse));
      form.append("autoGenerate", "true");
      if (pageRange.trim()) form.append("pageRange", pageRange.trim());
      if (file) form.append("file", file);
      const res = await api<{ lessonId?: string; id?: string }>("/lessons", { method: "POST", form });
      return (res.lessonId ?? res.id) as string;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: qk.lessons() });
      router.push(`/app/lessons/${id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409 && typeof e.extra.existingLessonId === "string") return setDuplicate(e.extra.existingLessonId);
      if (e instanceof ApiError && e.status === 422) {
        setNeedRange(true);
        return setError(t("new.pages.over"));
      }
      setError(errorMessage(e));
    },
  });

  const hasSource = Boolean(file || prompt.trim().length >= PROMPT_MIN);
  const busy = create.isPending;

  return (
    <>
      <div className="create-main" onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
        <p className="eyebrow">{t("create.eyebrow")}</p>
        <h1 className="nl-title compact">{t("create.title")}</h1>
        <p className="nl-sub">{t("create.subtitle")}</p>

        {file ? (
          <div className="nl-file create-file">
            <span className="fi"><FileText aria-hidden="true" /></span>
            <span className="fn">
              <b>{file.name}</b>
              <span className="muted small">{file.name.split(".").pop()?.toUpperCase()} · {formatSize(file.size)}</span>
            </span>
            <button type="button" className="lnk" aria-label={t("new.file.remove", { name: file.name })} onClick={() => { setFile(null); if (input.current) input.current.value = ""; }}>
              <X className="ic" aria-hidden="true" />
              {t("common.remove")}
            </button>
          </div>
        ) : (
          <label className={`create-drop ${dragging ? "dragging" : ""}`}>
            <Illus name="cloud-upload" size={48} className="drop-ill" />
            <span className="drop-main">{dragging ? t("new.dropNow") : t("new.select")}</span>
            <span className="drop-sub">{t("new.drop")} · {t("new.types")}</span>
            <input ref={input} type="file" className="sr" accept={FILE_TYPES} onChange={(e) => choose(e.target.files?.[0] ?? null)} />
          </label>
        )}
        {fileError && <p className="err" role="alert">{fileError}</p>}

        <div className="create-prompt">
          <label htmlFor="prompt">{t("create.or")}</label>
          <div className="prompt-wrap">
            <textarea id="prompt" rows={2} maxLength={PROMPT_MAX} value={prompt} className={refine.isPending ? "refining" : ""} aria-busy={refine.isPending} onChange={(e) => { setPrompt(e.target.value); setBefore(null); }} placeholder={t("new.describe.placeholder")} />
            <button type="button" className="refine-btn" disabled={prompt.trim().length < PROMPT_MIN || refine.isPending} onClick={() => refine.mutate()} aria-label={t("refine.button")} title={t("refine.button")}>
              <Sparkles className="ic" aria-hidden="true" />
              <span>{refine.isPending ? t("refine.working") : t("refine.button")}</span>
            </button>
          </div>
          {refineError && <p className="muted small" role="status">{refineError}</p>}
          {before !== null && (
            <div className="refine-bar" role="status">
              <button type="button" className="chip-btn" onClick={() => { setPrompt(before); setBefore(null); setSuggestions([]); }}>{t("common.undo")}</button>
              {suggestions.map((s) => (
                <button key={s} type="button" className="chip-btn" onClick={() => setPrompt((p) => `${p.trim()} ${s.replace(/^\+\s*/, "")}`.slice(0, PROMPT_MAX))}>{s}</button>
              ))}
            </div>
          )}
          <div className="chips-row suggestions" role="group" aria-label={t("create.chips")}>
            {chips.map((c) => (
              <button key={c} type="button" className="chip-btn" onClick={() => setPrompt(c)}>{c}</button>
            ))}
          </div>
        </div>

        {duplicate && (
          <div className="nl-dup" role="alert">
            <b>{t("new.dup.title")}</b> {t("new.dup.text")}
            <span className="acts" style={{ marginInlineStart: 8 }}>
              <Link className="btn sm" href={`/app/lessons/${duplicate}`}>{t("new.dup.open")}</Link>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setDuplicate(null); create.mutate(false); }}>{t("new.dup.new")}</Button>
            </span>
          </div>
        )}
        {error && <p className="err" role="alert">{error}</p>}

        <div className="create-row">
          <div className="inline-field">
            <label htmlFor="class-pick">{t("new.class.label")}</label>
            <select id="class-pick" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name} · {t("grade.n", { n: c.grade })}</option>)}
            </select>
          </div>
          <div className="langsw" role="radiogroup" aria-label={t("new.language")}>
            {LOCALES.map((code) => (
              <button key={code} type="button" role="radio" lang={code} aria-checked={language === code} onClick={() => setLanguage(code)}>{LOCALE_LABELS[code]}</button>
            ))}
          </div>
          <details className="more">
            <summary><Settings2 className="ic" aria-hidden="true" />{t("new.more")}</summary>
            <div className="more-pop">
              <div className="field">
                <label htmlFor="duration">{t("new.class.duration")}</label>
                <select id="duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                  {[30, 40, 45, 50, 60, 90].map((m) => <option key={m} value={m}>{t("min.n", { n: m })}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="title">{t("new.lesson.title")}</label>
                <input id="title" value={title} placeholder={lessonTitle || t("new.lesson.title.auto")} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="range">{t("new.pages.label")}</label>
                <input id="range" dir="ltr" value={pageRange} placeholder="12-40" onChange={(e) => setPageRange(e.target.value)} />
                {needRange && <p className="hint">{t("new.pages.hint")}</p>}
              </div>
              <button type="button" className="lnk" onClick={onManage}>{t("classes.manage")}</button>
            </div>
          </details>
          <Button size="big" className="create-make" aria-busy={busy || undefined} disabled={busy || !hasSource || (needRange && !RANGE.test(pageRange.trim()))} onClick={() => create.mutate(true)}>
            {busy ? t("new.uploading") : t("new.make")}
          </Button>
        </div>
      </div>
      <PreviousLessons />
    </>
  );
}

function PreviousLessons() {
  const { t } = useI18n();
  const lessons = useLessons();
  const [all, setAll] = useState(false);
  const list = useMemo(() => [...(lessons.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [lessons.data]);

  return (
    <section className="prev" aria-labelledby="prev-h">
      <div className="prev-head">
        <h2 id="prev-h">{t("create.previous")}</h2>
        {list.length > 4 && <button type="button" className="lnk" onClick={() => setAll(true)}>{t("create.seeAll")}</button>}
      </div>
      {lessons.isPending ? (
        <div className="prev-skel" role="status" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} block={{ h: 96, r: 18 }} />)}
          <span className="sr">{t("common.loading")}…</span>
        </div>
      ) : lessons.isError ? (
        <p className="err" role="alert">{errorMessage(lessons.error)}</p>
      ) : list.length === 0 ? (
        <div className="prev-empty"><Illus name="magic-book" size={44} /><p className="muted">{t("create.previous.empty")}</p></div>
      ) : (
        <ul className="prev-strip">
          {list.slice(0, 12).map((l) => <LessonCard key={l.id} lesson={l} />)}
        </ul>
      )}
      {all && <LessonsDialog onClose={() => setAll(false)} />}
    </section>
  );
}
