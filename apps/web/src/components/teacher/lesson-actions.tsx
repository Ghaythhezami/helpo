"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Blueprint, ResourceView } from "@helpo/shared";
import { History, ShieldCheck } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { qk } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Panel, PillHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

export function exportHref(resourceId: string, format: string, key?: boolean): string {
  return `/api/resources/${resourceId}/export?format=${format}${key === undefined ? "" : `&key=${key}`}`;
}

/** Downloads (same-origin GET with the session cookie) and the version history of one resource. */
export function ExportBar({ resource, lessonId }: { resource: ResourceView; lessonId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const revert = useMutation({
    mutationFn: (version: number) => api(`/resources/${resource.id}/revert`, { method: "POST", body: { version } }),
    onSuccess: () => {
      toast.show(t("versions.restored"));
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: qk.lesson(lessonId) });
    },
    onError: (e) => toast.show(errorMessage(e)),
  });
  return (
    <div className="exportbar" role="group" aria-label={t("export.label")}>
      <div className="versions">
        <button type="button" className="btn sm sec" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <History className="ic" aria-hidden="true" />
          {t("versions.menu", { n: resource.version })}
        </button>
        {open && (
          <div className="avpop" style={{ insetInlineStart: 0, insetInlineEnd: "auto" }}>
            <p className="muted small">{t("versions.current", { n: resource.version })}</p>
            <Button size="sm" disabled={resource.version <= 1 || revert.isPending} onClick={() => revert.mutate(1)}>{t("versions.original")}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** "What Nibras understood": the blueprint, so the teacher can sanity-check before generating. */
export function BlueprintPanel({ blueprint }: { blueprint: Blueprint }) {
  const { t } = useI18n();
  return (
    <Panel aria-labelledby="bp-h" className="blueprint">
      <PillHeader id="bp-h" icon={<ShieldCheck aria-hidden="true" />}>{t("bp.title")}</PillHeader>
      <p style={{ marginTop: 12 }}>{blueprint.summary}</p>
      <div className="bp-grid">
        <section>
          <h3>{t("bp.objectives")}</h3>
          <ul className="objs">{blueprint.objectives.map((o) => <li key={o.code}><span className="chip">{o.code}</span><span className="tx">{o.text}</span></li>)}</ul>
        </section>
        <section>
          <h3>{t("bp.concepts")}</h3>
          <ul className="bp-list">{blueprint.keyConcepts.slice(0, 8).map((c) => <li key={c.name}><b>{c.name}</b>: {c.definition}</li>)}</ul>
        </section>
        <section>
          <h3>{t("bp.vocabulary")}</h3>
          <p className="chips">{blueprint.vocabulary.slice(0, 12).map((v) => <span className="chip" key={v.term} title={v.meaning}>{v.term}</span>)}</p>
        </section>
        {blueprint.commonMisconceptions.length > 0 && (
          <section>
            <h3>{t("bp.misconceptions")}</h3>
            <ul className="bp-list">{blueprint.commonMisconceptions.map((m, i) => <li key={i}>{m}</li>)}</ul>
          </section>
        )}
      </div>
      <p className="muted small">{t("bp.difficulty", { level: t(`difficulty.${blueprint.difficulty}` as "difficulty.easy") })}</p>
    </Panel>
  );
}
