"use client";
import { useState } from "react";
import { BAND_LABELS } from "@helpo/shared";
import { useI18n } from "@/lib/i18n";
import { useClassDetail, useClasses } from "@/lib/queries";
import { Async } from "@/components/ui/states";
import { CreateClass, GamificationSettings, Roster } from "./classes";
import { useSelectedClassId } from "./shell";

/** Class management in one dialog: pick a class, paste students, change class settings, or create a class. */
export function ClassManager() {
  const { t } = useI18n();
  const classes = useClasses();
  const { classId, setClassId } = useSelectedClassId();
  const [adding, setAdding] = useState(false);
  const list = classes.data ?? [];
  const active = adding ? null : (list.find((c) => c.id === classId)?.id ?? list[0]?.id ?? null);

  return (
    <div className="class-manager">
      <div className="cm-tabs" role="tablist" aria-label={t("classes.list")}>
        {list.map((c) => (
          <button key={c.id} type="button" role="tab" className="thumb" aria-selected={active === c.id} onClick={() => { setAdding(false); setClassId(c.id); }}>
            {c.name} · {t(`band.${c.band}` as "band.EXPLORER")}
          </button>
        ))}
        <button type="button" className="thumb" aria-pressed={adding || list.length === 0} onClick={() => setAdding(true)}>+ {t("classes.create")}</button>
      </div>
      {adding || list.length === 0 ? (
        <CreateClass onCreated={(c) => { setClassId(c.id); setAdding(false); }} />
      ) : (
        active && <ClassPanels id={active} />
      )}
      <span className="sr">{BAND_LABELS.EXPLORER}</span>
    </div>
  );
}

function ClassPanels({ id }: { id: string }) {
  const detail = useClassDetail(id);
  const { t } = useI18n();
  return (
    <Async query={detail} label={t("hub.loading")}>
      {(cls) => (
        <div className="cm-grid">
          <Roster cls={cls} />
          <GamificationSettings cls={cls} />
        </div>
      )}
    </Async>
  );
}
