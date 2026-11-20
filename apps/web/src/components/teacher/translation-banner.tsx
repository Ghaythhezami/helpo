"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LOCALE_LABELS, type LessonDetail, type Locale } from "@helpo/shared";
import { Languages } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { qk } from "@/lib/queries";
import { isFallback, shouldAutoTranslate, translationPhase, translationProgress } from "@/lib/translation";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Progress } from "@/components/ui/progress";

/** Starts a translation (POST /lessons/:id/translate) and refreshes the lesson so polling can follow it. */
export function useTranslateLesson(lessonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (to: Locale) => api(`/lessons/${lessonId}/translate`, { method: "POST", body: { to } }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: qk.lesson(lessonId) }),
  });
}

/** Calls translate once, automatically, when the lesson has no text in the viewer's language yet. */
export function useAutoTranslate(lesson: LessonDetail | undefined) {
  const { locale } = useI18n();
  const translate = useTranslateLesson(lesson?.id ?? "");
  const requested = useRef<string | null>(null);
  const key = lesson ? `${lesson.id}:${locale}` : null;
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!lesson || !key) return;
    if (!shouldAutoTranslate(lesson, locale, requested.current === key)) return;
    requested.current = key;
    translate.mutate(locale, { onError: () => setFailed(key) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one request per lesson and language
  }, [key, lesson?.translations[locale]]);

  return {
    failed: failed === key,
    retry: () => {
      setFailed(null);
      translate.mutate(locale, { onError: () => setFailed(key) });
    },
  };
}

export function TranslationBanner({ lesson, failed, onRetry }: { lesson: LessonDetail; failed?: boolean; onRetry?: () => void }) {
  const { t, locale } = useI18n();
  const phase = translationPhase(lesson, locale, failed);
  if (phase === "ready") return null;
  const language = LOCALE_LABELS[locale];
  return (
    <div className="trbanner" role="status" aria-live="polite">
      <Languages className="ic" aria-hidden="true" />
      <div>
        <b>{phase === "failed" ? t("tr.failed") : t("tr.working", { lang: language })}</b>
        <span className="muted small"> {t("tr.fallback", { lang: LOCALE_LABELS[lesson.contentLocale] })}</span>
        {phase !== "failed" && <Progress value={translationProgress(lesson, locale)} label={t("tr.progress")} />}
      </div>
      {phase === "failed" && onRetry && (
        <Button size="sm" onClick={onRetry}>
          {t("common.tryAgain")}
        </Button>
      )}
    </div>
  );
}

/** Small chip next to content that is still shown in the other language. */
export function ShownInChip({ contentLocale }: { contentLocale: Locale | null | undefined }) {
  const { t, locale } = useI18n();
  if (!isFallback(contentLocale, locale) || !contentLocale) return null;
  return <Pill tone="neu" icon={false}>{t("tr.shownIn", { lang: LOCALE_LABELS[contentLocale] })}</Pill>;
}
