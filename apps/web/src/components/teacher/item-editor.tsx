"use client";
import { useState } from "react";
import { migrateSlides, type CardsContent, type QuizContent, type ResourceView, type SlidesContent, type WorksheetContent } from "@helpo/shared";
import { buildSlidePatch, slideDraft, updateSlide, updateQuestion, type SlideDraft } from "@/lib/content-edit";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

type Save = (content: ResourceView["content"]) => void;
type Slide = SlidesContent["slides"][number];

/** Right-margin fields for the selected item: slide fields, a question, a card, or a worksheet section. */
export function ItemEditor({ resource, index, onSave }: { resource: ResourceView; index: number; onSave: Save }) {
  // Re-mount when the item or the saved version changes so the fields always show what is stored.
  return <Fields key={`${resource.id}:${resource.version}:${resource.kind}:${index}`} resource={resource} index={index} onSave={onSave} />;
}

function Fields({ resource, index, onSave }: { resource: ResourceView; index: number; onSave: Save }) {
  if (resource.kind === "SLIDES") {
    const deck = migrateSlides(resource.content as SlidesContent | null);
    const slide = deck?.slides[index];
    return slide ? <SlideFields deck={deck} slide={slide} index={index} onSave={onSave} /> : null;
  }
  return <OtherFields resource={resource} index={index} onSave={onSave} />;
}

const letterKey = (i: number) => `slide.letter.${Math.min(i, 5)}` as "slide.letter.0";

function SlideFields({ deck, slide, index, onSave }: { deck: SlidesContent; slide: Slide; index: number; onSave: Save }) {
  const { t } = useI18n();
  const [d, setD] = useState<SlideDraft>(() => slideDraft(slide));
  const set = (patch: Partial<SlideDraft>) => setD((prev) => ({ ...prev, ...patch }));
  const layout = slide.layout;
  const optionLines = d.options.split("\n").map((l) => l.trim()).filter(Boolean);

  const field = (id: string, label: string, value: string, onChange: (v: string) => void, rows = 0) => (
    <>
      <label htmlFor={id}>{label}</label>
      {rows ? <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} /> : <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />}
    </>
  );

  return (
    <form className="item-editor" onSubmit={(e) => { e.preventDefault(); onSave(updateSlide(deck, index, buildSlidePatch(slide, d))); }}>
      <p className="muted small">{t("slide.edit.layout", { name: t(`slide.layout.${layout}` as "slide.layout.title") })}</p>
      {field("edit-a", t("edit.slide.title"), d.title, (v) => set({ title: v }))}
      {layout === "title" && (
        <>
          {field("edit-subtitle", t("slide.edit.subtitle"), d.subtitle, (v) => set({ subtitle: v }))}
          {field("edit-hook", t("slide.edit.hook"), d.question, (v) => set({ question: v }), 2)}
        </>
      )}
      {(layout === "bullets" || layout === "twoColumn") && field("edit-key", t("slide.edit.keyIdea"), d.keyIdea, (v) => set({ keyIdea: v }), 2)}
      {layout === "bullets" && field("edit-b", t("edit.slide.text"), d.bullets, (v) => set({ bullets: v }), 4)}
      {layout === "twoColumn" && [0, 1].map((k) => (
        <div key={k}>
          {field(`edit-col-h-${k}`, t("slide.edit.colHeading", { n: k + 1 }), d.columns[k].heading, (v) => set({ columns: d.columns.map((c, j) => (j === k ? { ...c, heading: v } : c)) }))}
          {field(`edit-col-p-${k}`, t("slide.edit.colPoints", { n: k + 1 }), d.columns[k].points, (v) => set({ columns: d.columns.map((c, j) => (j === k ? { ...c, points: v } : c)) }), 3)}
        </div>
      ))}
      {layout === "definition" && (
        <>
          {field("edit-term", t("slide.edit.term"), d.term, (v) => set({ term: v }))}
          {field("edit-def", t("slide.edit.definition"), d.definition, (v) => set({ definition: v }), 2)}
          {field("edit-example", t("slide.edit.example"), d.example, (v) => set({ example: v }), 2)}
        </>
      )}
      {layout === "process" && field("edit-steps", t("slide.edit.steps"), d.steps, (v) => set({ steps: v }), 5)}
      {layout === "quizBreak" && (
        <>
          {field("edit-question", t("slide.edit.question"), d.question, (v) => set({ question: v }), 2)}
          {field("edit-options", t("slide.edit.options"), d.options, (v) => set({ options: v }), 4)}
          {optionLines.length > 0 && (
            <fieldset className="opt-row">
              <legend>{t("slide.edit.correct")}</legend>
              {optionLines.map((line, k) => (
                <label key={k} className="correct">
                  <input type="radio" name="edit-correct" checked={d.answerIndex === k} onChange={() => set({ answerIndex: k })} />
                  {t(letterKey(k))}. {line}
                </label>
              ))}
            </fieldset>
          )}
          {field("edit-key", t("slide.edit.keyIdea"), d.keyIdea, (v) => set({ keyIdea: v }), 2)}
        </>
      )}
      {layout === "summary" && (
        <>
          {field("edit-take", t("slide.edit.takeaways"), d.takeaways, (v) => set({ takeaways: v }), 3)}
          {field("edit-exit", t("slide.edit.exitQuestion"), d.question, (v) => set({ question: v }), 2)}
        </>
      )}
      {field("edit-notes", t("slide.edit.notes"), d.speakerNotes, (v) => set({ speakerNotes: v }), 3)}
      <Button type="submit" size="sm">{t("edit.save")}</Button>
    </form>
  );
}

function OtherFields({ resource, index, onSave }: { resource: ResourceView; index: number; onSave: Save }) {
  const { t } = useI18n();
  const c = resource.content;
  const q = resource.kind === "QUIZ" ? (c as QuizContent).questions[index] : undefined;
  const card = resource.kind === "CARDS" ? (c as CardsContent).cards[index] : undefined;
  const section = resource.kind === "WORKSHEET" ? (c as WorksheetContent).sections[index] : undefined;

  const [a, setA] = useState(q?.prompt ?? card?.front ?? section?.heading ?? "");
  const [b, setB] = useState(card?.back ?? (section ? section.items.map((i) => i.prompt).join("\n") : ""));
  const [options, setOptions] = useState(q?.options ?? []);

  if (!q && !card && !section) return null;
  const labels = q
    ? [t("edit.q.prompt"), ""]
    : card
      ? [t("edit.card.front"), t("edit.card.back")]
      : [t("edit.section.heading"), t("edit.section.items")];

  const save = () => {
    if (!c) return;
    if (q) onSave(updateQuestion(c as QuizContent, index, { prompt: a, ...(q.options ? { options } : {}) }));
    else if (card) onSave({ cards: (c as CardsContent).cards.map((x, i) => (i === index ? { ...x, front: a, back: b } : x)) });
    else if (section) {
      const lines = b.split("\n");
      onSave({ ...(c as WorksheetContent), sections: (c as WorksheetContent).sections.map((s, i) => (i === index ? { ...s, heading: a, items: s.items.map((it, k) => ({ ...it, prompt: lines[k] ?? it.prompt })) } : s)) });
    }
  };

  return (
    <form className="item-editor" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <label htmlFor="edit-a">{labels[0]}</label>
      {q ? <textarea id="edit-a" value={a} onChange={(e) => setA(e.target.value)} rows={3} /> : <input id="edit-a" value={a} onChange={(e) => setA(e.target.value)} />}
      {labels[1] && (
        <>
          <label htmlFor="edit-b">{labels[1]}</label>
          <textarea id="edit-b" value={b} onChange={(e) => setB(e.target.value)} rows={4} />
        </>
      )}
      {q && options.map((o, k) => (
        <div key={k} className="opt-row">
          <label className="sr" htmlFor={`edit-o-${k}`}>{t("preview.quiz.option", { n: k + 1 })}</label>
          <input id={`edit-o-${k}`} value={o.text} onChange={(e) => setOptions(options.map((x, j) => (j === k ? { ...x, text: e.target.value } : x)))} />
          <label className="correct"><input type="radio" name="edit-correct" checked={o.correct} onChange={() => setOptions(options.map((x, j) => ({ ...x, correct: j === k })))} />{t("preview.quiz.correct")}</label>
        </div>
      ))}
      <Button type="submit" size="sm">{t("edit.save")}</Button>
    </form>
  );
}
