"use client";
import { useState } from "react";
import { Volume2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { speak } from "@/lib/student-helpers";

/** Read-aloud button using the Web Speech API. Visible text comes first in the accessible name. */
export function ReadAloud({ text, compact }: { text: string; compact?: boolean }) {
  const { t, locale } = useI18n();
  const [on, setOn] = useState(false);
  return (
    <button
      type="button"
      className="ra"
      style={{ display: "inline-flex" }}
      aria-pressed={on}
      aria-label={`${t("student.readAloud")}: ${text}`}
      onClick={() => {
        speak(text, locale);
        setOn(true);
        setTimeout(() => setOn(false), 1400);
      }}
    >
      <Volume2 className="ic" aria-hidden="true" />
      {compact ? <span className="sr">{t("student.readAloud")}</span> : <span>{t("student.readAloud")}</span>}
    </button>
  );
}
