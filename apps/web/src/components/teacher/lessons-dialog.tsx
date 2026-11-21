"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { LessonSummary } from "@helpo/shared";
import { relativeDay } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useLessons } from "@/lib/queries";
import { Dialog } from "@/components/ui/dialog";
import { Pill } from "@/components/ui/pill";

export function LessonCard({ lesson, wide, onOpen }: { lesson: LessonSummary; wide?: boolean; onOpen?: () => void }) {
  const { t } = useI18n();
  const ready = lesson.status === "READY" || lesson.status === "PARTIAL";
  return (
    <li className={wide ? "lcard-wide" : "lcard-s"}>
      <Link href={`/app/lessons/${lesson.id}`} className="lcard-link" onClick={onOpen}>
        <span className="chip">{lesson.className}</span>
        <b>{lesson.title}</b>
        <small>{relativeDay(lesson.createdAt, t)}</small>
        <Pill tone={ready ? "ready" : "neu"} icon={false}>{t(`lstatus.${lesson.status}` as "lstatus.READY")}</Pill>
      </Link>
    </li>
  );
}

/** "My lessons": every lesson, newest first, with search. Used by the Create screen and the side menu. */
export function LessonsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const lessons = useLessons();
  const [query, setQuery] = useState("");
  const list = useMemo(() => [...(lessons.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [lessons.data]);
  const shown = list.filter((l) => l.title.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <Dialog title={t("create.previous")} onClose={onClose} wide>
      <label className="sr" htmlFor="lesson-search">{t("create.search")}</label>
      <input id="lesson-search" type="search" className="search" placeholder={t("create.search")} value={query} onChange={(e) => setQuery(e.target.value)} data-autofocus />
      <ul className="prev-list">
        {shown.map((l) => <LessonCard key={l.id} lesson={l} wide onOpen={onClose} />)}
        {shown.length === 0 && <li className="muted">{lessons.isPending ? t("common.loading") : t("create.search.none")}</li>}
      </ul>
    </Dialog>
  );
}
