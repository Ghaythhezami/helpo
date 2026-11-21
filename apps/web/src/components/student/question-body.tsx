"use client";
import { useI18n } from "@/lib/i18n";
import type { SelfPacedAnswer } from "@/lib/self-paced";

export interface SelfQuestion {
  id: string;
  type: "mcq" | "tf" | "short" | "matching";
  prompt: string;
  options: string[] | null;
  matching: { lefts: string[]; rights: string[] } | null;
}

/** True once the student gave a usable answer (an option, some text, or every matching pair). */
export function isAnswered(q: SelfQuestion | undefined, current: SelfPacedAnswer | undefined): boolean {
  return Boolean(q && current && (current.optionIndex !== undefined || current.text || (current.pairs && current.pairs.length === (q.matching?.lefts.length ?? 0))));
}

/** The answer controls of one question (options, true/false, short text, matching), shared by self-paced, practice and the teacher preview. */
export function QuestionBody({ q, current, set }: { q: SelfQuestion; current: SelfPacedAnswer | undefined; set: (a: Partial<SelfPacedAnswer>) => void }) {
  const { t } = useI18n();
  return (
    <>
    {(q.type === "mcq" || q.type === "tf") && q.options && (
      <div className={q.type === "tf" ? "qtf" : "qopts"} role="group" aria-labelledby="sp-q">
        {q.options.map((o, i) => (
          <div className="tw" key={i}>
            <button type="button" className="ans c-answer" style={q.type === "tf" ? undefined : { minHeight: 72, width: "100%", borderRadius: 22, border: "3px solid", fontSize: 22, fontWeight: 900, padding: "8px 20px", textAlign: "start" }} aria-pressed={current?.optionIndex === i} onClick={() => set({ optionIndex: i })}>{o}</button>
          </div>
        ))}
      </div>
    )}
    {q.type === "short" && (
      <div className="field">
        <label className="sr" htmlFor="sp-short">{t("quiz.short.label")}</label>
        <input id="sp-short" value={current?.text ?? ""} maxLength={1000} onChange={(e) => set({ text: e.target.value })} style={{ minHeight: 64, fontSize: 22 }} />
      </div>
    )}
    {q.type === "matching" && q.matching && (
      <div className="match-self">
        {q.matching.lefts.map((left, i) => (
          <div key={left} className="opt-row">
            <label htmlFor={`sp-m-${i}`}>{left}</label>
            <select
              id={`sp-m-${i}`}
              value={current?.pairs?.find((p) => p.left === left)?.right ?? ""}
              onChange={(e) => {
                const rest = (current?.pairs ?? []).filter((p) => p.left !== left);
                set({ pairs: e.target.value ? [...rest, { left, right: e.target.value }] : rest });
              }}
            >
              <option value="">{t("self.pick")}</option>
              {q.matching!.rights.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        ))}
      </div>
    )}
    </>
  );
}
