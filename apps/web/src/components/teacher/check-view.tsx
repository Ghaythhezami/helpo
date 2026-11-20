"use client";
import { useState } from "react";
import type { CheckView } from "@helpo/shared";
import { Check, FileText } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function Note({
  check,
  active,
  editing,
  file,
  onActivate,
  onResolve,
  onEdit,
  onCancelEdit,
  onUndo,
}: {
  check: CheckView;
  active: boolean;
  editing: boolean;
  file: string | null;
  onActivate: () => void;
  onResolve: (status: "ACCEPTED" | "EDITED" | "DISMISSED", text?: string) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onUndo: () => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState(check.suggestion ?? "");
  const resolved = check.status !== "OPEN";
  const resource = t(`resource.${check.resource}` as "resource.SLIDES");
  const item = `${resource} ${check.itemRef}`;

  return (
    <article className={`note ${active ? "active" : ""} ${resolved ? "done" : ""}`}>
      <header>
        <button type="button" onClick={onActivate} className="notehead" aria-expanded={active && !resolved}>
          <span className="nk">{item}</span>
          <strong>{t(`checkkind.${check.kind}` as "checkkind.FACT_CHECK")}</strong>
        </button>
      </header>
      {!resolved && active && (
        <div className="nb">
          <p>{check.message}</p>
          {check.suggestion && !editing && (
            <div className="ba">
              <div className="new"><small>{t("check.suggested")}</small>{check.suggestion}</div>
            </div>
          )}
          {check.sourcePage !== null && (
            <p className="src"><FileText className="ic" aria-hidden="true" />{file ? `${file}, ` : ""}{t("page.n", { n: check.sourcePage })}</p>
          )}
          {editing ? (
            <div className="edit on">
              <label className="sr" htmlFor={`edit-${check.id}`}>{t("check.editLabel", { item })}</label>
              <textarea id={`edit-${check.id}`} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
              <div className="acts">
                <Button size="sm" onClick={() => onResolve("EDITED", text)} disabled={!text.trim()}>{t("check.saveEdit")}</Button>
                <Button size="sm" variant="secondary" onClick={onCancelEdit}>{t("common.cancel")}</Button>
              </div>
            </div>
          ) : (
            <div className="acts main">
              <Button size="sm" aria-label={t("check.accept.aria", { item })} onClick={() => onResolve("ACCEPTED")}>{t("check.accept")}</Button>
              <Button size="sm" variant="secondary" aria-label={t("check.edit.aria", { item })} onClick={onEdit}>{t("common.edit")}</Button>
              <Button size="sm" variant="secondary" aria-label={t("check.dismiss.aria", { item })} onClick={() => onResolve("DISMISSED")}>{t("check.dismiss")}</Button>
            </div>
          )}
        </div>
      )}
      {resolved && (
        <p className="nr">
          <Check className="ic" aria-hidden="true" />
          <span><b>{t(`checkstatus.${check.status}` as "checkstatus.ACCEPTED")}</b>, {item}</span>{" "}
          <button type="button" className="lnk" aria-label={t("check.undo.aria", { item })} onClick={onUndo}>{t("common.undo")}</button>
        </p>
      )}
    </article>
  );
}

