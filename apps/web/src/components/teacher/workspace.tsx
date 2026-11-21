"use client";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LOCALE_LABELS,
  RESOURCE_KINDS,
  BRAND,
  otherLocale,
  type CardsContent,
  type CheckView,
  type LessonDetail,
  type QuizContent,
  type ResourceKind,
  type ResourceView,
  type SlidesContent,
  type WorksheetContent,
} from "@helpo/shared";
import { ArrowDown, ArrowLeft, ArrowUp, BarChart3, MoreVertical, ChevronLeft, ChevronRight, Copy, Download, GripVertical, Highlighter, Info, ListChecks, Monitor, PanelRight, PenLine, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { exportOptions } from "@/lib/checks";
import { exportHref } from "./lesson-actions";
import { api, errorMessage } from "@/lib/api";
import { nextOpenCheck, openChecks, openChecksByResource, resourceOf } from "@/lib/checks";
import { duplicateInArray, moveInArray, replaceTextInContent } from "@/lib/content-edit";
import { useI18n } from "@/lib/i18n";
import { qk, useLessonEvents } from "@/lib/queries";
import { useCheckResolution } from "@/lib/use-check-resolution";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Async, EmptyState } from "@/components/ui/states";
import { Tabs, panelDomId, tabDomId } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { RESOURCE_ART, RESOURCE_CARD_CLASS } from "@/lib/checks";
import { Illus } from "@/components/ui/illus";
import { Note } from "./check-view";
import { ExportBar } from "./lesson-actions";
import { Making } from "./making";
import { CardsPreview, GamePreview, QuizPreview, SlidesPreview, WorksheetPreview } from "./previews";
import { ResultsBody } from "./results";
import { ShareDialogBody } from "./share-dialog";
import { ItemEditor } from "./item-editor";
import { useRegisterWorkspace } from "./workspace-bridge";
import { BlueprintPanel } from "./lesson-actions";
import { ShownInChip, TranslationBanner, useAutoTranslate } from "./translation-banner";
import { DrawLayer, Whiteboard } from "./whiteboard";
import { useResults } from "@/lib/queries";

/** Screen 2: the lesson workspace. Tabs on top, the resource in the centre, edit tools in the margins. */
export function Workspace({ id }: { id: string }) {
  const lesson = useLessonEvents(id);
  const { t } = useI18n();
  return (
    <Async query={lesson} label={t("making.loading")}>
      {(data) => <WorkspaceBody lesson={data} />}
    </Async>
  );
}

type ItemRow = { label: string };

/** One row per editable item, for the left margin. */
export function itemRows(resource: ResourceView | undefined, t: (k: "preview.game.sort" | "preview.game.statements" | "preview.game.equation" | "game.match.left") => string): ItemRow[] {
  const c = resource?.content;
  if (!resource || !c) return [];
  switch (resource.kind) {
    case "SLIDES":
      return (c as SlidesContent).slides.map((s, i) => ({ label: `${i + 1}. ${s.title}` }));
    case "WORKSHEET":
      return (c as WorksheetContent).sections.map((s, i) => ({ label: `${i + 1}. ${s.heading}` }));
    case "QUIZ":
      return (c as QuizContent).questions.map((q) => ({ label: `${q.id}. ${q.prompt}` }));
    case "CARDS":
      return (c as CardsContent).cards.map((card, i) => ({ label: `${i + 1}. ${card.front}` }));
    case "GAME": {
      const g = c as import("@helpo/shared").GameContent;
      return [
        ...g.pairs.map((p, i) => ({ label: `${t("game.match.left")} ${i + 1}: ${p.left}` })),
        ...g.sortItems.map((p) => ({ label: `${t("preview.game.sort")} ${p.label}` })),
        ...g.statements.map((p) => ({ label: `${t("preview.game.statements")} ${p.text}` })),
      ];
    }
  }
}

function WorkspaceBody({ lesson }: { lesson: LessonDetail }) {
  const { t, locale } = useI18n();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const auto = useAutoTranslate(lesson);
  const { resolve, reopen } = useCheckResolution(lesson.id);
  // The route title is static ("Lesson"); name the page after the lesson so tabs and history are distinguishable (WCAG 2.4.2).
  useEffect(() => {
    document.title = `${lesson.title} · ${BRAND.name}`;
  }, [lesson.title]);

  const wanted = params.get("tab")?.toUpperCase() as ResourceKind | undefined;
  const [tab, setTab] = useState<ResourceKind>(wanted && RESOURCE_KINDS.includes(wanted) ? wanted : "SLIDES");
  const [left, setLeft] = useState(true);
  const [right, setRight] = useState(true);
  const [sheet, setSheet] = useState<"list" | "edit" | null>(null);
  const [board, setBoard] = useState(false);
  const [dialog, setDialog] = useState<"share" | "results" | "info" | null>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const [draw, setDraw] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const selectTab = useCallback((k: ResourceKind) => {
    setTab(k);
    setSlideIndex(0);
  }, []);
  const toggleBoard = useCallback(() => setBoard((v) => !v), []);
  const openShare = useCallback(() => setDialog("share"), []);
  const openResults = useCallback(() => setDialog("results"), []);
  useRegisterWorkspace({ lessonId: lesson.id, title: lesson.title, tab, setTab: selectTab, boardOpen: board, toggleBoard, openShare, openResults });
  const [menu, setMenu] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [menuRow, setMenuRow] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selection, setSelection] = useState("");
  const [request, setRequest] = useState("");

  const byResource = openChecksByResource(lesson.checks);
  const open = openChecks(lesson.checks);
  const resource = resourceOf(lesson.resources, tab);
  const ready = lesson.resources.filter((r) => r.status === "READY").length;
  const usable = ready > 0;
  const active = lesson.checks.find((c) => c.id === activeId && c.status === "OPEN") ?? open.find((c) => c.resource === tab) ?? open[0] ?? null;

  const focusCheck = useCallback((check: CheckView) => {
    setActiveId(check.id);
    setTab(check.resource);
    setEditingId(null);
    setRight(true);
    setSheet("edit");
  }, []);

  const save = useMutation({
    mutationFn: (v: { resource: ResourceView; content: ResourceView["content"]; undoTo?: ResourceView["content"]; message?: string }) =>
      api<ResourceView>(`/resources/${v.resource.id}`, { method: "PATCH", body: { content: v.content } }),
    onSuccess: (_d, v) => {
      void queryClient.invalidateQueries({ queryKey: qk.lesson(lesson.id) });
      toast.show(v.message ?? t("check.saved"), v.undoTo ? { undo: () => save.mutate({ resource: v.resource, content: v.undoTo ?? null }), undoLabel: t("common.undo") } : undefined);
    },
    onError: (e) => toast.show(errorMessage(e)),
  });

  const rewrite = useMutation({
    mutationFn: async (action: "simpler" | "example" | "translate") => {
      const res = await api<{ text: string }>(`/resources/${resource?.id}/rewrite`, {
        method: "POST",
        body: { text: selection, action, ...(action === "translate" ? { language: LOCALE_LABELS[otherLocale(locale)] } : {}) },
      });
      return res.text;
    },
    onSuccess: (text) => {
      if (!resource?.content) return;
      const next = replaceTextInContent(resource.content, selection, text);
      if (!next.changed) return toast.show(t("rewrite.notFound"));
      setSelection("");
      save.mutate({ resource, content: next.content, undoTo: resource.content, message: t("rewrite.done") });
    },
    onError: (e) => toast.show(errorMessage(e)),
  });

  const change = useMutation({
    mutationFn: () => api<{ summary: string; resource: ResourceView }>(`/resources/${resource?.id}/change`, { method: "POST", body: { request: request.trim() } }),
    onSuccess: (data) => {
      const previous = resource?.content;
      setRequest("");
      void queryClient.invalidateQueries({ queryKey: qk.lesson(lesson.id) });
      toast.show(data.summary, previous ? { undo: () => save.mutate({ resource: data.resource, content: previous, message: t("check.restored") }), undoLabel: t("common.undo") } : undefined);
    },
    onError: (e) => toast.show(errorMessage(e)),
  });

  const quick = (action: "simpler" | "example" | "translate") => {
    if (selection) return rewrite.mutate(action);
    setRequest(t(`ask.${action}` as "ask.simpler"));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (event.ctrlKey || event.metaKey || event.altKey || board || dialog || !active) return;
      const key = event.key.toLowerCase();
      if (key === "a") resolve(active, "ACCEPTED");
      else if (key === "e") setEditingId(active.id);
      else if (key === "d") resolve(active, "DISMISSED");
      else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        const next = nextOpenCheck(lesson.checks, active.id);
        if (next) focusCheck(next);
      } else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, lesson.checks, resolve, focusCheck, board, dialog]);

  const captureSelection = () => {
    const text = window.getSelection()?.toString().trim() ?? "";
    setSelection(text.length >= 3 ? text : "");
  };

  /** Re-order / duplicate / delete items in the resource, saved as a new version with Undo. */
  const edit = (op: "up" | "down" | "dup" | "del" | "move", i: number, to?: number) => {
    if (!resource?.content) return;
    const c = resource.content;
    const apply = <T,>(items: T[]): T[] => (op === "move" ? moveInArray(items, i, to ?? i) : op === "up" ? moveInArray(items, i, i - 1) : op === "down" ? moveInArray(items, i, i + 1) : op === "dup" ? duplicateInArray(items, i) : items.filter((_, k) => k !== i));
    let next: ResourceView["content"] = null;
    if (resource.kind === "SLIDES") next = { ...(c as SlidesContent), slides: apply((c as SlidesContent).slides) };
    else if (resource.kind === "QUIZ") next = { questions: apply((c as QuizContent).questions) };
    else if (resource.kind === "CARDS") next = { cards: apply((c as CardsContent).cards) };
    else if (resource.kind === "WORKSHEET") next = { ...(c as WorksheetContent), sections: apply((c as WorksheetContent).sections) };
    if (next) save.mutate({ resource, content: next, undoTo: c });
    if (resource.kind === "SLIDES") setSlideIndex(op === "move" ? (to ?? i) : op === "up" ? Math.max(0, i - 1) : op === "down" ? i + 1 : i);
  };

  const slideCount = resource?.kind === "SLIDES" ? ((resource.content as SlidesContent | null)?.slides.length ?? 0) : 0;
  const rows = itemRows(resource, (k) => t(k));
  const canEditList = resource?.kind !== "GAME";

  const preview = (() => {
    if (!resource || !resource.content) return null;
    const common = { resource, checks: lesson.checks, onOpenCheck: focusCheck };
    const onSave = (content: ResourceView["content"]) => save.mutate({ resource, content, undoTo: resource.content });
    switch (resource.kind) {
      case "SLIDES":
        return <SlidesPreview {...common} onSave={onSave} activeIndex={slideIndex} onIndex={setSlideIndex} />;
      case "WORKSHEET":
        return <WorksheetPreview {...common} lessonTitle={lesson.title} />;
      case "QUIZ":
        return <QuizPreview {...common} onSave={onSave} lessonTitle={lesson.title} />;
      case "GAME":
        return <GamePreview resource={resource} />;
      case "CARDS":
        return <CardsPreview resource={resource} />;
    }
  })();

  const tabs = RESOURCE_KINDS.map((k) => {
    const r = resourceOf(lesson.resources, k);
    const status = r?.status ?? "WAITING";
    return {
      id: k,
      className: RESOURCE_CARD_CLASS[k],
      badge: byResource[k],
      label: (
        <>
          <Illus name={RESOURCE_ART[k]} size={22} />
          <i className={`dot s-${status.toLowerCase()}`} aria-hidden="true" />
          {t(`resource.${k}` as "resource.SLIDES")}
          <span className="sr"> ({t(`tabstatus.${status}` as "tabstatus.READY")})</span>
        </>
      ),
    };
  });

  const list = (
    <div className="ws-list" aria-label={t("ws.items")}>
      <h2>{t("ws.items")} <span className="muted small">({rows.length})</span></h2>
      {rows.length === 0 ? (
        <p className="muted small">{t("ws.items.none")}</p>
      ) : (
        <ol>
          {rows.map((row, i) => (
            <li
              key={i}
              draggable={canEditList}
              className={dragFrom === i ? "dragging" : undefined}
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => canEditList && e.preventDefault()}
              onDrop={() => {
                if (dragFrom !== null && dragFrom !== i) edit("move", dragFrom, i);
                setDragFrom(null);
              }}
              onDragEnd={() => setDragFrom(null)}
            >
              {canEditList && <span className="grip" aria-hidden="true"><GripVertical className="ic" /></span>}
              <button
                type="button"
                className={`row-main ${slideIndex === i && tab === "SLIDES" ? "on" : ""}`}
                aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                onKeyDown={(e) => {
                  if (!canEditList || !e.altKey) return;
                  if (e.key === "ArrowUp") { e.preventDefault(); edit("move", i, i - 1); }
                  if (e.key === "ArrowDown") { e.preventDefault(); edit("move", i, i + 1); }
                }}
                onClick={() => { setSlideIndex(i); document.getElementById(`item-${tab.toLowerCase()}-${i}`)?.scrollIntoView({ block: "nearest" }); setSheet(null); }}
              >
                <span className="num">{i + 1}</span>
                {row.label.replace(/^\d+\.\s*/, "")}
              </button>
              {canEditList && (
                <span className="row-menu-wrap">
                  <button type="button" className="row-menu-btn" aria-haspopup="true" aria-expanded={menuRow === i} aria-label={t("ws.menu", { n: i + 1 })} onClick={() => setMenuRow(menuRow === i ? null : i)}>
                    <MoreVertical className="ic" aria-hidden="true" />
                  </button>
                  {menuRow === i && (
                    <span className="row-menu" role="group" aria-label={t("ws.menu", { n: i + 1 })}>
                      <button type="button" aria-label={t("ws.up", { n: i + 1 })} disabled={i === 0} onClick={() => { edit("up", i); setMenuRow(null); }}><ArrowUp className="ic" aria-hidden="true" />{t("ws.moveUp")}</button>
                      <button type="button" aria-label={t("ws.down", { n: i + 1 })} disabled={i === rows.length - 1} onClick={() => { edit("down", i); setMenuRow(null); }}><ArrowDown className="ic" aria-hidden="true" />{t("ws.moveDown")}</button>
                      <button type="button" aria-label={t("ws.dup", { n: i + 1 })} onClick={() => { edit("dup", i); setMenuRow(null); }}><Copy className="ic" aria-hidden="true" />{t("ws.duplicate")}</button>
                      <button type="button" aria-label={t("ws.del", { n: i + 1 })} onClick={() => { edit("del", i); setMenuRow(null); }}><Trash2 className="ic" aria-hidden="true" />{t("ws.delete")}</button>
                    </span>
                  )}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  const editPanel = (
    <div className="ws-edit" aria-label={t("ws.edit")}>
      <h2><PenLine className="ic" aria-hidden="true" /> {t("ws.edit")}</h2>
      {resource?.status === "READY" && resource.content && resource.kind !== "GAME" && (
        <ItemEditor resource={resource} index={slideIndex} onSave={(content) => save.mutate({ resource, content, undoTo: resource.content })} />
      )}
      <Button size="sm" variant="secondary" disabled={!usable} onClick={() => { setSheet(null); setDialog("results"); }}><BarChart3 className="ic" aria-hidden="true" />{t("steps.results")}</Button>
      {resource?.status === "READY" && (
        <form
          className="ask"
          onSubmit={(e) => {
            e.preventDefault();
            if (request.trim().length >= 3) change.mutate();
          }}
        >
          <label htmlFor="ask">{t("ask.label")}</label>
          <input id="ask" value={request} maxLength={500} onChange={(e) => setRequest(e.target.value)} placeholder={t("ask.placeholder")} />
          <div className="chips-row" role="group" aria-label={t("ask.quick")}>
            {(["simpler", "example", "translate"] as const).map((a) => (
              <button key={a} type="button" className="chip-btn" disabled={rewrite.isPending} onClick={() => quick(a)}>{t(`rewrite.${a}` as "rewrite.simpler")}</button>
            ))}
          </div>
          <p className="muted small" role="status" aria-live="polite">{selection ? t("rewrite.selected", { text: selection.length > 50 ? `${selection.slice(0, 50)}…` : selection }) : t("ask.hint")}</p>
          <Button type="submit" size="sm" disabled={request.trim().length < 3 || change.isPending}>{change.isPending ? t("change.working") : t("ask.send")}</Button>
        </form>
      )}

      <h2><Highlighter className="ic" aria-hidden="true" /> {t("check.aside")} <span className="muted small">({open.length})</span></h2>
      {lesson.checks.length === 0 ? (
        <p className="muted small">{t("check.none.text")}</p>
      ) : (
        lesson.checks
          .filter((c) => c.resource === tab || c.status === "OPEN")
          .map((check) => (
            <Note
              key={check.id}
              check={check}
              active={active?.id === check.id}
              editing={editingId === check.id}
              file={lesson.sourceFileName}
              onActivate={() => focusCheck(check)}
              onResolve={(status, text) => { resolve(check, status, text); setEditingId(null); }}
              onEdit={() => setEditingId(check.id)}
              onCancelEdit={() => setEditingId(null)}
              onUndo={() => reopen(check)}
            />
          ))
      )}
      <p className="muted small">{t("check.honest")}</p>
      {resource?.status === "READY" && <ExportBar resource={resource} lessonId={lesson.id} />}
    </div>
  );

  return (
    <div className="ws">
      <header className="ws-head">
        <Link href="/app" className="rbtn ws-back" aria-label={t("ws.back")}><ArrowLeft className="ic flip" aria-hidden="true" /></Link>
        <div className="ws-title">
          <h1>{lesson.title}</h1>
          <button type="button" className="info-btn" aria-label={t("ws.understood")} onClick={() => setDialog("info")}><Info className="ic" aria-hidden="true" /></button>
        </div>
        <Tabs group="kit" tabs={tabs} value={tab} onChange={(id) => { setTab(id as ResourceKind); setSlideIndex(0); }} label={t("check.resources")} />
        <div className="ws-actions">
          <div className="dl">
            <button type="button" className="btn sm sec" aria-expanded={menu} disabled={!resource || resource.status !== "READY" || exportOptions(resource.kind).length === 0} onClick={() => setMenu((v) => !v)}>
              <Download className="ic" aria-hidden="true" /><span className="lbl">{t("ws.download")}</span>
            </button>
            {menu && resource && (
              <div className="avpop dl-pop">
                {exportOptions(resource.kind).map((o) => (
                  <a key={`${o.format}-${o.key}`} className="btn sm sec" href={exportHref(resource.id, o.format, o.key)} download onClick={() => setMenu(false)}>
                    {o.key === undefined ? t(`export.${o.format}` as "export.pptx") : o.key ? t("export.pdf.key") : t("export.pdf.nokey")}
                  </a>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="btn sm" disabled={!usable} onClick={() => setDialog("share")}><Send className="ic flip" aria-hidden="true" /><span className="lbl">{t("share.cta")}</span></button>
        </div>
      </header>
      <TranslationBanner lesson={lesson} failed={auto.failed} onRetry={auto.retry} />

      <div className={`ws-body ${left ? "" : "no-left"} ${right ? "" : "no-right"}`}>
        <aside className="ws-side ws-left">{left && !narrow && list}</aside>
        <section className="ws-center" role="tabpanel" id={panelDomId("kit", tab)} aria-labelledby={tabDomId("kit", tab)}>
          <div className="ws-stage" tabIndex={0} onMouseUp={captureSelection} onKeyUp={captureSelection}>
            {!usable && lesson.status !== "READY" ? (
              <Making lesson={lesson} />
            ) : !resource ? (
              <EmptyState art="magic-book" title={t("check.noResource")}>{t("check.noResource.text")}</EmptyState>
            ) : resource.status !== "READY" || !resource.content ? (
              <EmptyState art="robot-helper" title={resource.status === "FAILED" ? t("status.failed") : t("status.working")}>{resource.error ?? t("check.notReady")}</EmptyState>
            ) : (
              <>
                <ShownInChip contentLocale={resource.contentLocale} />
                {preview}
              </>
            )}
            {draw && usable && <DrawLayer storageKey={`${lesson.id}:${tab}:${tab === "SLIDES" ? slideIndex : 0}`} />}
          </div>
          <div className="ws-controls" role="group" aria-label={t("ws.controls")}>
            <button type="button" className="tool wide" aria-pressed={left} onClick={() => setLeft((v) => !v)} aria-label={t("ws.toggleList")}><ListChecks className="ic" aria-hidden="true" /></button>
            {slideCount > 0 && (
              <span className="pager">
                <button type="button" className="tool" aria-label={t("ws.prev")} disabled={slideIndex <= 0} onClick={() => setSlideIndex(slideIndex - 1)}><ChevronLeft className="ic flip" aria-hidden="true" /></button>
                <b><bdi dir="ltr">{Math.min(slideIndex + 1, slideCount)} / {slideCount}</bdi></b>
                <button type="button" className="tool" aria-label={t("ws.next")} disabled={slideIndex >= slideCount - 1} onClick={() => setSlideIndex(slideIndex + 1)}><ChevronRight className="ic flip" aria-hidden="true" /></button>
              </span>
            )}
            <span className="sp" />
            <button type="button" className="tool wide drawtoggle" aria-label={t("ws.draw")} aria-pressed={draw} disabled={!usable} onClick={() => setDraw((v) => !v)}><PenLine className="ic" aria-hidden="true" /><span className="lbl">{t("ws.draw")}</span></button>
            <button type="button" className="tool wide" aria-label={t("board.title")} aria-pressed={board} onClick={() => setBoard((v) => !v)}><Monitor className="ic" aria-hidden="true" /><span className="lbl">{t("board.title")}</span></button>
            <button type="button" className="tool wide" aria-pressed={right} onClick={() => setRight((v) => !v)} aria-label={t("ws.toggleEdit")}><PanelRight className="ic flip" aria-hidden="true" /></button>
          </div>
        </section>
        <aside className="ws-side ws-right">{right && !narrow && editPanel}</aside>
      </div>

      <nav className="ws-bar" aria-label={t("ws.tools")}>
        <button type="button" className="tool mob" onClick={() => setSheet("list")}><ListChecks className="ic" aria-hidden="true" />{t("ws.list")}</button>
        <button type="button" className="tool mob" onClick={() => setSheet("edit")}><PenLine className="ic" aria-hidden="true" />{t("ws.edit")}{open.length > 0 ? ` (${open.length})` : ""}</button>
        <button type="button" className="tool mob" aria-pressed={board} onClick={() => setBoard((v) => !v)}><Monitor className="ic" aria-hidden="true" />{t("ws.board")}</button>
        <button type="button" className="tool mob primary" disabled={!usable} onClick={() => setDialog("share")}><Send className="ic flip" aria-hidden="true" />{t("ws.share")}</button>
      </nav>

      {sheet && (
        <Dialog title={sheet === "list" ? t("ws.items") : t("ws.edit")} onClose={() => setSheet(null)}>
          {sheet === "list" ? list : editPanel}
        </Dialog>
      )}
      {dialog === "share" && (
        <Dialog title={t("share.title")} onClose={() => setDialog(null)} wide>
          <ShareDialogBody lesson={lesson} tab={tab} />
        </Dialog>
      )}
      {dialog === "results" && <ResultsDialog lesson={lesson} onClose={() => setDialog(null)} />}
      {dialog === "info" && (
        <Dialog title={t("bp.title")} onClose={() => setDialog(null)} wide>
          {lesson.blueprint ? <BlueprintPanel blueprint={lesson.blueprint} /> : <p className="muted">{t("bp.none")}</p>}
        </Dialog>
      )}
      {board && <Whiteboard lessonId={lesson.id} onClose={() => setBoard(false)} />}
    </div>
  );
}

function ResultsDialog({ lesson, onClose }: { lesson: LessonDetail; onClose: () => void }) {
  const [sid] = useState(() => window.localStorage.getItem(`helpo:last-session:${lesson.id}`) ?? undefined);
  const results = useResults(lesson.id, sid);
  const { t } = useI18n();
  return (
    <Dialog title={t("steps.results")} onClose={onClose} wide>
      <Async query={results} label={t("nav.results")}>{(r) => <ResultsBody lesson={lesson} results={r} />}</Async>
    </Dialog>
  );
}

