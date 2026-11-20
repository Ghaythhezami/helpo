"use client";
import { useState } from "react";
import type { CardsContent, QuizContent, ResourceView, SlidesContent, WorksheetContent } from "@helpo/shared";
import { toLines, updateQuestion, updateSlide } from "@/lib/content-edit";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

type Save = (content: ResourceView["content"]) => void;

/** Right-margin fields for the selected item: slide title and text, a question, a card, or a worksheet section. */
export function ItemEditor({ resource, index, onSave }: { resource: ResourceView; index: number; onSave: Save }) {
  // Re-mount when the item or the saved version changes so the fields always show what is stored.
  return <Fields key={`${resource.id}:${resource.version}:${resource.kind}:${index}`} resource={resource} index={index} onSave={onSave} />;
}

function Fields({ resource, index, onSave }: { resource: ResourceView; index: number; onSave: Save }) {
  const { t } = useI18n();
  const c = resource.content;
  const slide = resource.kind === "SLIDES" ? (c as SlidesContent).slides[index] : undefined;
  const q = resource.kind === "QUIZ" ? (c as QuizContent).questions[index] : undefined;
  const card = resource.kind === "CARDS" ? (c as CardsContent).cards[index] : undefined;
  const section = resource.kind === "WORKSHEET" ? (c as WorksheetContent).sections[index] : undefined;

  const [a, setA] = useState(slide?.title ?? q?.prompt ?? card?.front ?? section?.heading ?? "");
  const [b, setB] = useState(slide ? slide.bullets.join("\n") : (card?.back ?? (section ? section.items.map((i) => i.prompt).join("\n") : "")));
  const [options, setOptions] = useState(q?.options ?? []);

  if (!slide && !q && !card && !section) return null;
  const labels = slide
    ? [t("edit.slide.title"), t("edit.slide.text")]
    : q
      ? [t("edit.q.prompt"), ""]
      : card
        ? [t("edit.card.front"), t("edit.card.back")]
        : [t("edit.section.heading"), t("edit.section.items")];

  const save = () => {
    if (!c) return;
    if (slide) onSave(updateSlide(c as SlidesContent, index, { title: a.trim() || slide.title, bullets: toLines(b) }));
    else if (q) onSave(updateQuestion(c as QuizContent, index, { prompt: a, ...(q.options ? { options } : {}) }));
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
