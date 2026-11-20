"use client";
import { useMemo, useReducer, useState, type ReactNode } from "react";
import type { CardsContent, CheckView, GameContent, QuizContent, ResourceView, SlidesContent, WorksheetContent } from "@helpo/shared";
import { Check } from "lucide-react";
import { toLines, updateQuestion, updateSlide } from "@/lib/content-edit";
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

/** One fixed template per layout; the AI picks the layout, never positions. */
function SlideBody({ slide }: { slide: SlidesContent["slides"][number] }) {
  const { t } = useI18n();
  const emoji = slide.emoji ? <span className="slide-emoji" aria-hidden="true">{slide.emoji}</span> : null;
  switch (slide.layout) {
    case "title":
      return (
        <div className="slide-title">
          {emoji}
          <h4>{slide.title}</h4>
          {slide.bullets[0] && <p>{slide.bullets[0]}</p>}
        </div>
      );
    case "twoColumn": {
      const half = Math.ceil(slide.bullets.length / 2);
      return (
        <>
          <h4>{slide.title}</h4>
          <div className="slide-cols">
            <ul>{slide.bullets.slice(0, half).map((b, i) => <li key={i}>{b}</li>)}</ul>
            <ul>{slide.bullets.slice(half).map((b, i) => <li key={i}>{b}</li>)}</ul>
          </div>
        </>
      );
    }
    case "definition":
      return (
        <>
          <h4>{emoji} {slide.title}</h4>
          <p className="slide-def">{slide.bullets[0]}</p>
          {slide.bullets.slice(1).map((b, i) => <p key={i}>{b}</p>)}
        </>
      );
    case "process":
      return (
        <>
          <h4>{slide.title}</h4>
          <ol className="slide-steps">{slide.bullets.map((b, i) => <li key={i}><span className="n">{i + 1}</span>{b}</li>)}</ol>
        </>
      );
    case "quizBreak":
      return (
        <div className="slide-title">
          {emoji}
          <h4>{slide.title}</h4>
          <p className="chip">{t("preview.slide.quizBreak")}</p>
        </div>
      );
    case "summary":
      return (
        <>
          <h4>{emoji} {slide.title}</h4>
          <ul className="slide-check">{slide.bullets.map((b, i) => <li key={i}><Check className="ic" aria-hidden="true" />{b}</li>)}</ul>
        </>
      );
    default:
      return (
        <>
          <h4>{emoji} {slide.title}</h4>
          {slide.bullets.map((b, i) => <p key={i}>{b}</p>)}
        </>
      );
  }
}

export function SlidesPreview({ resource, checks, onSave, onOpenCheck, activeIndex, onIndex }: { resource: ResourceView; checks: CheckView[]; onSave: Save; onOpenCheck: (c: CheckView) => void; activeIndex?: number; onIndex?: (i: number) => void }) {
  const { t } = useI18n();
  const content = resource.content as SlidesContent;
  const [localIndex, setLocalIndex] = useState(0);
  const index = activeIndex ?? localIndex;
  const setIndex = (i: number) => (onIndex ? onIndex(i) : setLocalIndex(i));
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [bullets, setBullets] = useState("");
  const slide = content.slides[Math.min(index, content.slides.length - 1)];
  if (!slide) return <p className="muted">{t("preview.empty")}</p>;
  const ref = `S${index + 1}`;
  const flagged = checks.some((c) => c.itemRef === ref && c.status === "OPEN");

  return (
    <div>
      <p className="muted small">{content.deckTitle}</p>
      <div className="sl" data-resource-id={resource.id} data-layout={slide.layout}>
        {editing ? (
          <div className="edit on" style={{ position: "relative", zIndex: 1 }}>
            <label className="sr" htmlFor="slide-title">{t("preview.slide.title")}</label>
            <input id="slide-title" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
            <label className="sr" htmlFor="slide-bullets">{t("preview.slide.bullets")}</label>
            <textarea id="slide-bullets" value={bullets} onChange={(e) => setBullets(e.target.value)} />
            <div className="acts">
              <Button size="sm" onClick={() => { onSave(updateSlide(content, index, { title: title.trim() || slide.title, bullets: toLines(bullets) })); setEditing(false); }}>{t("common.save")}</Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>{t("common.cancel")}</Button>
            </div>
          </div>
        ) : flagged ? (
          <Flag checks={checks} itemRef={ref} onOpen={onOpenCheck}><SlideBody slide={slide} /></Flag>
        ) : (
          <SlideBody slide={slide} />
        )}
      </div>
      <div className="thumbs" style={{ marginTop: 12 }} role="group" aria-label={t("resource.SLIDES")}>
        {content.slides.map((s, i) => (
          <button key={i} type="button" className="thumb" aria-pressed={i === index} onClick={() => { setIndex(i); setEditing(false); }}>
            S{i + 1} {s.title.length > 18 ? `${s.title.slice(0, 18)}…` : s.title}
          </button>
        ))}
      </div>
      {slide.speakerNotes && <p className="keyline small" style={{ marginTop: 12 }}><b>{t("preview.speakerNote")}</b> {slide.speakerNotes}</p>}
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

  return (
    <div className="doc" data-resource-id={resource.id}>
      <h3>{content.title}</h3>
      <p>{content.instructions}</p>
      <div className="dm"><span>{t("preview.game.meta", { n: content.pairs.length })}</span><span>{t("preview.game.try")}</span></div>
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
      {content.sortItems.length > 0 && <p className="small"><b>{t("preview.game.sort")}</b> {content.sortBaskets.yes} / {content.sortBaskets.no}: {content.sortItems.map((s) => s.label).join(", ")}</p>}
      {content.equationTiles.length > 0 && <p className="small"><b>{t("preview.game.equation")}</b> <bdi dir="ltr">{eq.model.parts.map((p) => (p.kind === "op" ? p.text : eq.model.terms[p.slot])).join(" ")}</bdi></p>}
      {content.statements?.length > 0 && <p className="small"><b>{t("preview.game.statements")}</b> {t("preview.game.statementsN", { n: content.statements.length })}</p>}
    </div>
  );
}

/* ----------------------------------- cards ----------------------------------- */

export function CardsPreview({ resource }: { resource: ResourceView }) {
  const { t } = useI18n();
  const content = resource.content as CardsContent;
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  return (
    <div className="doc" data-resource-id={resource.id}>
      <h3>{t("resource.CARDS")}</h3>
      <div className="dm"><span>{t("preview.cards.meta", { n: content.cards.length })}</span></div>
      <div className="cards3">
        {content.cards.map((c, i) => (
          <button key={i} id={`item-cards-${i}`} type="button" className="fc" aria-pressed={Boolean(flipped[i])} onClick={() => setFlipped({ ...flipped, [i]: !flipped[i] })}>
            <small>{t(flipped[i] ? "preview.cards.back" : "preview.cards.front", { n: i + 1 })} · {t(`tag.${c.tag}` as "tag.concept")}</small>
            <b>{c.emoji ? <span aria-hidden="true">{c.emoji} </span> : null}{flipped[i] ? c.back : c.front}</b>
          </button>
        ))}
      </div>
    </div>
  );
}
