"use client";
import { useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { migrateSlides, type CheckView, type GameContent, type QuizContent, type ResourceView, type SlidesContent, type WorksheetContent } from "@helpo/shared";
import { useReducedMotion } from "motion/react";
import { Check, ChevronLeft, ChevronRight, Eye, EyeOff, Maximize2, Sparkles, X } from "lucide-react";
import { toLines, updateQuestion } from "@/lib/content-edit";
import { IS_TEST } from "@/lib/motion";
import { initEquation } from "@/lib/games/equation";
import { initMatch, matchMessageText, matchReducer } from "@/lib/games/match";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/pill";

type Save = (content: ResourceView["content"]) => void;

/** Wraps flagged text in a button that jumps to its AI check (colour plus underline, never colour alone). */
function Flag({ checks, itemRef, onOpen, children }: { checks: CheckView[]; itemRef: string; onOpen: (c: CheckView) => void; children: ReactNode }) {
  const { t } = useI18n();
  const open = checks.find((c) => c.itemRef === itemRef && c.status === "OPEN") ?? null;
  const done = checks.find((c) => c.itemRef === itemRef);
  if (!open) {
    return done ? <span className={`mk ${done.status === "DISMISSED" ? "dis" : "fixed"}`}>{children}</span> : <>{children}</>;
  }
  return (
    <button type="button" className="mk" onClick={() => onOpen(open)} aria-label={t("check.flagged", { text: typeof children === "string" ? children : open.itemRef })}>
      {children}
    </button>
  );
}

const inputStyle = { minHeight: 44, width: "100%", borderRadius: 12, border: "2px solid var(--line)", padding: "0 12px", font: "inherit" } as const;

/* --------------------------------- slides --------------------------------- */

type Slide = SlidesContent["slides"][number];
type Fit = "normal" | "dense" | "tight";

const nonEmpty = (list: (string | null | undefined)[] | null | undefined): string[] => (list ?? []).filter((x): x is string => typeof x === "string" && x.trim().length > 0);

/** Visible text length of a slide: drives the type size so long slides shrink instead of overflowing. */
export function slideTextLength(s: Slide): number {
  const parts = [
    s.title, s.subtitle, s.keyIdea, s.question, s.term, s.definition, s.example,
    ...s.bullets, ...(s.options ?? []), ...(s.takeaways ?? []),
    ...(s.steps ?? []).flatMap((x) => [x.title, x.detail]),
    ...(s.columns ?? []).flatMap((c) => [c.heading, ...c.points]),
  ];
  return nonEmpty(parts).reduce((n, p) => n + p.length, 0);
}

const fitFor = (s: Slide): Fit => {
  const n = slideTextLength(s);
  return n > 420 ? "tight" : n > 260 ? "dense" : "normal";
};

const LETTERS = ["0", "1", "2", "3", "4", "5"] as const;

/** Slide direction for the transition: "" on first paint (no animation), then "fwd" or "back". */
function useSlideDirection(index: number): "" | "fwd" | "back" {
  const [state, setState] = useState<{ prev: number; dir: "" | "fwd" | "back" }>({ prev: index, dir: "" });
  const dir = state.prev === index ? state.dir : index > state.prev ? "fwd" : "back";
  if (state.prev !== index) setState({ prev: index, dir });
  return dir;
}

function QuizBody({ slide, head, revealed, onReveal }: { slide: Slide; head: ReactNode; revealed?: boolean; onReveal?: (v: boolean) => void }) {
  const { t } = useI18n();
  const [local, setLocal] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const options = nonEmpty(slide.options).slice(0, 6);
  const answer = slide.answerIndex;
  const canReveal = answer !== null && answer >= 0 && answer < options.length;
  const shown = canReveal && (revealed ?? local);
  const toggle = () => {
    setLocal(!shown);
    onReveal?.(!shown);
  };
  return (
    <>
      {head}
      {slide.question && <p className="nsl-q nsl-clamp">{slide.question}</p>}
      {options.length > 0 && (
        <div className="nsl-opts" role="group" aria-label={t("slide.options")} data-count={options.length}>
          {options.map((o, i) => {
            const state = shown ? (i === answer ? "correct" : "dim") : picked === i ? "picked" : undefined;
            return (
              <button key={i} type="button" className="nsl-opt" data-state={state} aria-pressed={picked === i} onClick={() => setPicked(picked === i ? null : i)}>
                <span className="nsl-letter" aria-hidden="true">{t(`slide.letter.${LETTERS[i]}` as "slide.letter.0")}</span>
                <span className="nsl-opt-t">{o}</span>
                {state === "correct" && (
                  <span className="nsl-ok"><Check className="ic" aria-hidden="true" />{t("slide.correct")}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <div className="nsl-foot">
        {canReveal && (
          <button type="button" className="nsl-reveal" data-testid="slide-reveal" onClick={toggle}>
            {shown ? <EyeOff className="ic" aria-hidden="true" /> : <Eye className="ic" aria-hidden="true" />}
            {shown ? t("slide.hide") : t("slide.reveal")}
          </button>
        )}
        <div className="nsl-explain nsl-clamp" aria-live="polite" data-open={shown && !!slide.keyIdea ? "1" : "0"}>
          {shown && slide.keyIdea && (<><b>{t("slide.explanation")}</b> {slide.keyIdea}</>)}
        </div>
      </div>
    </>
  );
}

/**
 * One purpose-built 16:9 template per layout; the AI picks the layout, never positions. Everything inside is sized in
 * container units (cqw), so the same markup is the editor stage, the small card and the full-screen view.
 * The quiz answer stays hidden until the teacher reveals it; the state belongs to the slide and resets when it changes.
 */
export function SlideBody({ slide, index, total, revealed, onReveal, wrapTitle }: {
  slide: Slide;
  index?: number;
  total?: number;
  revealed?: boolean;
  onReveal?: (v: boolean) => void;
  /** Lets the caller wrap the heading text (the AI-check flag button). */
  wrapTitle?: (title: string) => ReactNode;
}) {
  const { t } = useI18n();
  const wrap = (s: string): ReactNode => (wrapTitle ? wrapTitle(s) : s);
  const label = index === undefined || total === undefined ? slide.title : t("slide.label", { n: index + 1, total, title: slide.title });
  const bullets = nonEmpty(slide.bullets).slice(0, 5);
  const columns = (slide.columns ?? []).slice(0, 2);
  const steps = (slide.steps ?? []).filter((s) => s.title.trim() || s.detail.trim()).slice(0, 6);
  const takeaways = nonEmpty(slide.takeaways).slice(0, 3);
  const head = (text: string) => (
    <div className="nsl-h"><h4 className="nsl-title">{wrap(text)}</h4></div>
  );
  const bulletsView = (
    <>
      {head(slide.title)}
      {slide.keyIdea && <p className="nsl-key nsl-clamp">{slide.keyIdea}</p>}
      <ul className="nsl-list">{bullets.map((b, i) => <li key={i}><span className="nsl-clamp">{b}</span></li>)}</ul>
    </>
  );

  let body: ReactNode;
  switch (slide.layout) {
    case "title":
      body = (
        <div className="nsl-hero">
          <h4 className="nsl-title nsl-hero-t">{wrap(slide.title)}</h4>
          {slide.subtitle && <p className="nsl-chip">{slide.subtitle}</p>}
          {slide.question && (
            <div className="nsl-hook">
              <Sparkles className="nsl-hook-ic" aria-hidden="true" />
              <div><small>{t("slide.hook")}</small><p className="nsl-clamp">{slide.question}</p></div>
            </div>
          )}
        </div>
      );
      break;
    case "twoColumn":
      body =
        columns.length === 2 ? (
          <>
            {head(slide.title)}
            {slide.keyIdea && <p className="nsl-key nsl-clamp">{slide.keyIdea}</p>}
            <div className="nsl-cols">
              {columns.map((c, i) => (
                <section key={i} className="nsl-col">
                  {c.heading && <h5>{c.heading}</h5>}
                  <ul className="nsl-list">{nonEmpty(c.points).slice(0, 4).map((p, k) => <li key={k}><span className="nsl-clamp">{p}</span></li>)}</ul>
                </section>
              ))}
              <span className="nsl-vs" aria-hidden="true">{t("slide.vs")}</span>
            </div>
          </>
        ) : bulletsView;
      break;
    case "definition":
      body =
        slide.definition || slide.term ? (
          <>
            <div className="nsl-h"><h4 className="nsl-term">{wrap(slide.term || slide.title)}</h4></div>
            {slide.definition && <p className="nsl-def">{slide.definition}</p>}
            {slide.example && <div className="nsl-example"><small>{t("slide.example")}</small><p className="nsl-clamp">{slide.example}</p></div>}
          </>
        ) : bulletsView;
      break;
    case "process":
      body =
        steps.length > 0 ? (
          <>
            {head(slide.title)}
            <ol className="nsl-steps" data-cols={steps.length > 4 ? 3 : steps.length}>
              {steps.map((s, i) => (
                <li key={i}>
                  <span className="nsl-num">{i + 1}</span>
                  {s.title.trim() && s.title.trim() !== String(i + 1) && <b className="nsl-step-t nsl-clamp">{s.title}</b>}
                  {s.detail && <span className="nsl-step-d nsl-clamp">{s.detail}</span>}
                </li>
              ))}
            </ol>
          </>
        ) : bulletsView;
      break;
    case "quizBreak":
      body = <QuizBody key={`${slide.title}|${slide.question ?? ""}|${slide.answerIndex ?? ""}`} slide={slide} revealed={revealed} onReveal={onReveal} head={<>{head(slide.title)}<p className="nsl-chip nsl-tag">{t("slide.layout.quizBreak")}</p></>} />;
      break;
    case "summary":
      body =
        takeaways.length > 0 ? (
          <>
            {head(slide.title)}
            <p className="nsl-over">{t("slide.takeaways")}</p>
            <ol className="nsl-take">
              {takeaways.map((x, i) => <li key={i}><span className="nsl-num">{i + 1}</span><span className="nsl-clamp">{x}</span></li>)}
            </ol>
            {slide.question && <div className="nsl-ticket"><b>{t("slide.exit")}</b><span className="nsl-clamp">{slide.question}</span></div>}
          </>
        ) : bulletsView;
      break;
    default:
      body = bulletsView;
  }

  return (
    <div className="nsl" role="group" aria-roledescription="slide" aria-label={label} data-testid="slide-frame" data-layout={slide.layout} data-fit={fitFor(slide)} data-emoji={slide.emoji ? "1" : "0"}>
      <span className="nsl-band" aria-hidden="true" />
      {slide.emoji && <span className="nsl-emoji" aria-hidden="true">{slide.emoji}</span>}
      <div className="nsl-in">{body}</div>
    </div>
  );
}

/** The slide plus the direction-aware enter animation (CSS; off under reduced motion in CSS and here). */
function SlideStage({ slide, index, total, wrapTitle }: { slide: Slide; index: number; total: number; wrapTitle?: (title: string) => ReactNode }) {
  const dir = useSlideDirection(index);
  const reduce = useReducedMotion();
  return (
    <div key={index} className="nsl-stage" data-dir={dir || undefined} data-motion={reduce || IS_TEST ? "off" : "on"}>
      <SlideBody slide={slide} index={index} total={total} wrapTitle={wrapTitle} />
    </div>
  );
}

/** Full-viewport presenter: the same SlideBody, contained at 16:9, with keyboard and button navigation. */
function PresentMode({ slides, index, onIndex, onClose, deckTitle }: { slides: Slide[]; index: number; onIndex: (i: number) => void; onClose: () => void; deckTitle: string }) {
  const { t, dir } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  const last = slides.length - 1;
  const go = (i: number) => onIndex(Math.max(0, Math.min(last, i)));

  useEffect(() => {
    const el = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    el?.focus();
    let entered = false;
    try {
      void Promise.resolve(el?.requestFullscreen?.())
        .then(() => { entered = !!document.fullscreenElement; })
        .catch(() => undefined);
    } catch {
      /* fullscreen is optional */
    }
    const onFs = () => {
      if (entered && !document.fullscreenElement) closeRef.current();
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      if (document.fullscreenElement) void Promise.resolve(document.exitFullscreen?.()).catch(() => undefined);
      opener?.focus?.();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const fwd = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
    const back = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
    if (e.key === "Tab") {
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
      if (items.length === 0) return;
      const first = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    if ((e.key === " " || e.key === "Enter") && (e.target as HTMLElement).closest("button")) return;
    let handled = true;
    if (e.key === "Escape") onClose();
    else if (e.key === fwd || e.key === "PageDown" || e.key === " ") go(index + 1);
    else if (e.key === back || e.key === "PageUp") go(index - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(last);
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const slide = slides[Math.min(index, last)];
  return createPortal(
    <div ref={ref} className="nsl-present" role="dialog" aria-modal="true" aria-label={t("slide.present.label", { title: deckTitle || slide.title })} tabIndex={-1} onKeyDown={onKeyDown}>
      <button type="button" className="nsl-p-exit" data-testid="slide-exit" onClick={onClose}><X className="ic" aria-hidden="true" />{t("slide.exitFull")}</button>
      <div className="nsl-p-stage"><SlideStage slide={slide} index={index} total={slides.length} /></div>
      <div className="nsl-p-bar">
        <button type="button" className="nsl-p-btn" aria-label={t("ws.prev")} disabled={index <= 0} onClick={() => go(index - 1)}><ChevronLeft className="ic flip" aria-hidden="true" /></button>
        <b className="nsl-p-count" aria-live="polite"><bdi dir="ltr">{index + 1} / {slides.length}</bdi></b>
        <button type="button" className="nsl-p-btn" aria-label={t("ws.next")} disabled={index >= last} onClick={() => go(index + 1)}><ChevronRight className="ic flip" aria-hidden="true" /></button>
      </div>
    </div>,
    document.body,
  );
}

export function SlidesPreview({ resource, checks, onOpenCheck, activeIndex, onIndex }: { resource: ResourceView; checks: CheckView[]; onSave: Save; onOpenCheck: (c: CheckView) => void; activeIndex?: number; onIndex?: (i: number) => void }) {
  const { t } = useI18n();
  const content = useMemo(() => migrateSlides(resource.content as SlidesContent | null), [resource.content]);
  const slides = content?.slides ?? [];
  const [localIndex, setLocalIndex] = useState(0);
  const [presenting, setPresenting] = useState(false);
  const index = Math.min(activeIndex ?? localIndex, slides.length - 1);
  const setIndex = (i: number) => (onIndex ? onIndex(i) : setLocalIndex(i));
  const slide = slides[index];
  if (!content || !slide) return <p className="muted">{t("preview.empty")}</p>;
  const ref = `S${index + 1}`;
  const flagged = checks.some((c) => c.itemRef === ref && c.status === "OPEN");

  return (
    <div>
      <div className="nsl-bar" role="group" aria-label={t("slide.tools")}>
        <p className="muted small">{content.deckTitle}</p>
        <button type="button" className="nsl-present-btn" data-testid="slide-present" aria-haspopup="dialog" onClick={() => setPresenting(true)}>
          <Maximize2 className="ic" aria-hidden="true" />{t("slide.present")}
        </button>
      </div>
      <div className="nsl-wrap" data-resource-id={resource.id} data-layout={slide.layout}>
        <SlideStage
          slide={slide}
          index={index}
          total={slides.length}
          wrapTitle={flagged ? (title) => <Flag checks={checks} itemRef={ref} onOpen={onOpenCheck}>{title}</Flag> : undefined}
        />
      </div>
      <div className="thumbs" style={{ marginTop: 12 }} role="group" aria-label={t("resource.SLIDES")}>
        {slides.map((s, i) => (
          <button key={i} type="button" className="thumb" aria-pressed={i === index} onClick={() => setIndex(i)}>
            S{i + 1} {s.title.length > 18 ? `${s.title.slice(0, 18)}…` : s.title}
          </button>
        ))}
      </div>
      {slide.speakerNotes && <p className="keyline small" style={{ marginTop: 12 }}><b>{t("preview.speakerNote")}</b> {slide.speakerNotes}</p>}
      {presenting && <PresentMode slides={slides} index={index} onIndex={setIndex} onClose={() => setPresenting(false)} deckTitle={content.deckTitle} />}
    </div>
  );
}

/* -------------------------------- worksheet -------------------------------- */

const LEVELS = ["support", "core", "stretch"] as const;

export function WorksheetPreview({ resource, checks, onOpenCheck }: { resource: ResourceView; checks: CheckView[]; onOpenCheck: (c: CheckView) => void; lessonTitle: string }) {
  const { t } = useI18n();
  const content = resource.content as WorksheetContent;
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("core");
  const [key, setKey] = useState(false);
  const sections = content.sections.filter((s) => s.level === level);
  const offsets = sections.map((_, i) => sections.slice(0, i).reduce((n, sec) => n + sec.items.length, 0));
  return (
    <div className="doc" data-resource-id={resource.id}>
      <h3>{content.title}</h3>
      <p>{content.instructions}</p>
      <div className="acts">
        <div className="thumbs" role="group" aria-label={t("preview.level")}>
          {LEVELS.map((l) => (
            <button key={l} type="button" className="thumb" aria-pressed={l === level} onClick={() => setLevel(l)}>{t(`level.${l}` as "level.core")}</button>
          ))}
        </div>
        <button type="button" className="tg" aria-pressed={key} onClick={() => setKey((v) => !v)}>{t("preview.answerKey")}</button>
      </div>
      <div className="dm"><span>{t("preview.worksheet.meta", { level: t(`level.${level}` as "level.core"), n: sections.length })}</span><span>{t("preview.points", { n: content.totalPoints })}</span></div>
      {sections.length === 0 && <p className="muted">{t("preview.worksheet.none")}</p>}
      {sections.map((s, si) => (
        <div className="q" key={si} id={`item-worksheet-${si}`}>
          <div className="qh"><Chip>{t(`wtype.${s.type}` as "wtype.mcq")}</Chip><Chip>{s.objectiveCode}</Chip><b>{s.heading}</b></div>
          <ol className="optl">
            {s.items.map((item, i) => {
              const number = offsets[si] + i + 1;
              const ref = `A${number}`;
              return (
                <li key={i} style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                  <span className="l">{number}</span>
                  <span style={{ flex: 1 }}>
                    <Flag checks={checks} itemRef={ref} onOpen={onOpenCheck}>{item.prompt}</Flag>
                    {item.options && item.options.length > 0 && <span className="small muted"> ({item.options.join(" · ")})</span>}
                    {key && <span className="keyline small" style={{ display: "block", marginTop: 4 }}><b>{t("preview.answer")}</b> {item.answer}</span>}
                  </span>
                  <span className="muted small">{t("preview.pts", { n: item.points })}</span>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------- quiz ----------------------------------- */

export function QuizPreview({ resource, checks, onSave, onOpenCheck, lessonTitle }: { resource: ResourceView; checks: CheckView[]; onSave: Save; onOpenCheck: (c: CheckView) => void; lessonTitle: string }) {
  const { t } = useI18n();
  const content = resource.content as QuizContent;
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ prompt: string; options: { text: string; correct: boolean }[]; answers: string }>({ prompt: "", options: [], answers: "" });

  return (
    <div className="doc" data-resource-id={resource.id}>
      <h3>{lessonTitle}</h3>
      <div className="dm"><span>{t("preview.quiz.meta", { n: content.questions.length })}</span></div>
      {content.questions.map((q, i) => (
        <div className="q" key={q.id} id={`item-quiz-${i}`}>
          <div className="qh">
            <span className="qn">{q.id}</span>
            <Chip>{t(`qtype.${q.type}` as "qtype.mcq")}</Chip>
            <Chip>{t("preview.covers", { code: q.objectiveCode })}</Chip>
            <Chip>{t(`difficulty.${q.difficulty}` as "difficulty.easy")}</Chip>
          </div>
          {editing === i ? (
            <div className="edit on">
              <label className="sr" htmlFor={`q-${i}-prompt`}>{t("preview.quiz.prompt", { id: q.id })}</label>
              <textarea id={`q-${i}-prompt`} value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} />
              {draft.options.map((o, k) => (
                <div key={k} className="acts" style={{ alignItems: "center", flexWrap: "nowrap" }}>
                  <label className="sr" htmlFor={`q-${i}-o-${k}`}>{t("preview.quiz.option", { n: k + 1 })}</label>
                  <input id={`q-${i}-o-${k}`} value={o.text} onChange={(e) => setDraft({ ...draft, options: draft.options.map((x, j) => (j === k ? { ...x, text: e.target.value } : x)) })} style={inputStyle} />
                  <label style={{ display: "flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}>
                    <input type="radio" name={`q-${i}-key`} checked={o.correct} onChange={() => setDraft({ ...draft, options: draft.options.map((x, j) => ({ ...x, correct: j === k })) })} />
                    {t("preview.quiz.correct")}
                  </label>
                </div>
              ))}
              {q.type === "short" && (
                <div className="field" style={{ marginTop: 0 }}>
                  <label htmlFor={`q-${i}-acc`}>{t("preview.quiz.accepted")}</label>
                  <input id={`q-${i}-acc`} value={draft.answers} onChange={(e) => setDraft({ ...draft, answers: e.target.value })} />
                </div>
              )}
              <div className="acts">
                <Button size="sm" onClick={() => { onSave(updateQuestion(content, i, { prompt: draft.prompt, ...(q.options ? { options: draft.options } : {}), ...(q.type === "short" ? { acceptedAnswers: toLines(draft.answers.replace(/;/g, "\n")) } : {}) })); setEditing(null); }}>{t("common.save")}</Button>
                <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
              </div>
            </div>
          ) : (
            <>
              <p><Flag checks={checks} itemRef={q.id} onOpen={onOpenCheck}>{q.prompt}</Flag></p>
              {q.options && q.options.length > 0 && (
                <ul className="optl">
                  {q.options.map((o, k) => (
                    <li key={k} className={o.correct ? "key" : undefined}>
                      <span className="l">{String.fromCharCode(65 + k)}</span>
                      <span>{o.text}</span>
                      {o.correct && (<><Check className="ic" style={{ color: "var(--ready)" }} aria-hidden="true" /><span className="sr">{t("preview.correct")}</span></>)}
                    </li>
                  ))}
                </ul>
              )}
              {q.type === "short" && q.acceptedAnswers && <p className="keyline"><b>{t("preview.modelAnswer")}</b> {q.acceptedAnswers.join(" / ")}</p>}
              {q.type === "matching" && q.pairs && <ul className="optl">{q.pairs.map((p, k) => <li key={k}><span>{p.left}</span><span aria-hidden="true">→</span><span>{p.right}</span></li>)}</ul>}
              {q.explanation && <p className="keyline small">{q.explanation}</p>}
              <div className="acts">
                <Button size="sm" variant="secondary" aria-label={t("preview.quiz.editQ", { id: q.id })} onClick={() => { setDraft({ prompt: q.prompt, options: q.options ?? [], answers: (q.acceptedAnswers ?? []).join("; ") }); setEditing(i); }}>{t("common.edit")}</Button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------- game ----------------------------------- */

export function GamePreview({ resource }: { resource: ResourceView }) {
  const { t } = useI18n();
  const content = resource.content as GameContent;
  const pairs = useMemo(() => content.pairs.slice(0, 4), [content.pairs]);
  const [state, dispatch] = useReducer(matchReducer, pairs, (p) => initMatch(p, resource.id));
  const order = state.rightOrder[0] ?? [];
  const eq = useMemo(() => initEquation(content.equationTiles), [content.equationTiles]);
  const odd = content.oddOneOut?.find((r) => r.items.length === 4);

  return (
    <div className="doc" data-resource-id={resource.id}>
      <h3>{content.title}</h3>
      <p>{content.instructions}</p>
      <div className="dm"><span>{t("preview.game.meta", { n: content.pairs.length })}</span><span>{t("preview.game.try")}</span></div>
      {content.sortItems.length > 0 && <p className="small"><b>{t("preview.game.sort")}</b> {content.sortBaskets.yes} / {content.sortBaskets.no}: {content.sortItems.map((s) => s.label).join(", ")}</p>}
      {content.equationTiles.length > 0 && <p className="small"><b>{t("preview.game.equation")}</b> <bdi dir="ltr">{eq.model.parts.map((p) => (p.kind === "op" ? p.text : eq.model.terms[p.slot])).join(" ")}</bdi></p>}
      {odd && (
        <div className="small" role="group" aria-label={t("preview.game.odd")}>
          <b>{t("preview.game.odd")}</b>{" "}
          {odd.items.map((item, i) => (
            <span key={i} style={{ marginInlineEnd: 10, fontWeight: i === odd.oddIndex ? 800 : 500 }}>
              {i === odd.oddIndex && <Check className="ic" aria-hidden="true" />}
              {item}
              {i === odd.oddIndex && <> ({t("preview.game.oddMark")})</>}
            </span>
          ))}
          <span className="muted">{odd.explanation}</span>
        </div>
      )}
      {pairs.length > 0 && (
        <div className="mg">
          <div style={{ display: "grid", gap: 12 }} role="group" aria-label={t("preview.game.left")}>
            {state.rounds[0]?.map((i) => (
              <button key={i} type="button" className={state.matched.includes(i) ? "done" : state.selected === i ? "sel" : ""} aria-pressed={state.selected === i} disabled={state.matched.includes(i)} onClick={() => dispatch({ type: "selectLeft", index: i })}>{pairs[i].left}</button>
            ))}
          </div>
          <div style={{ display: "grid", gap: 12 }} role="group" aria-label={t("preview.game.right")}>
            {order.map((i) => (
              <button key={i} type="button" className={state.matched.includes(i) ? "done" : ""} disabled={state.matched.includes(i)} onClick={() => dispatch({ type: "selectRight", index: i })}>{pairs[i].right}</button>
            ))}
          </div>
        </div>
      )}
      <p role="status" aria-live="polite" className="muted">{matchMessageText(state.message)}</p>
      {content.statements?.length > 0 && <p className="small"><b>{t("preview.game.statements")}</b> {t("preview.game.statementsN", { n: content.statements.length })}</p>}
    </div>
  );
}
