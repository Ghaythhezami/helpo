"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { submitSelfPaced, type SelfPacedAnswer } from "@/lib/self-paced";
import { Button, ButtonLink } from "@/components/ui/button";
import { Illus } from "@/components/ui/illus";
import { Progress } from "@/components/ui/progress";
import { Async } from "@/components/ui/states";
import { ReadAloud } from "./read-aloud";

export interface SelfQuestion {
  id: string;
  type: "mcq" | "tf" | "short" | "matching";
  prompt: string;
  options: string[] | null;
  matching: { lefts: string[]; rights: string[] } | null;
}
interface QuestionsResponse {
  sessionId: string;
  lessonTitle: string;
  questions: SelfQuestion[];
}
interface SubmitResult {
  score: number;
  correct: number;
  total: number;
  xp: number;
  durationSec: number;
  review: { questionId: string; correct: boolean; correctIndex: number | null; explanation: string }[];
}

/** Self-paced quiz: one question at a time, then everything is sent at once and the server scores it. */
export function SelfPacedQuiz({ sessionId, code: initialCode }: { sessionId: string; code?: string }) {
  const { t } = useI18n();
  const query = useQuery({ queryKey: ["play", "questions", sessionId], queryFn: () => api<QuestionsResponse>(`/play/sessions/${sessionId}/questions`), retry: false, refetchOnWindowFocus: false, staleTime: Infinity });
  return (
    <Async query={query} label={t("quiz.loading")} signInHref="/join" signInLabel={t("student.signin")}>
      {(data) => <Runner data={data} initialCode={initialCode} />}
    </Async>
  );
}

function Runner({ data, initialCode }: { data: QuestionsResponse; initialCode?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [startedAt] = useState(() => Date.now());
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, SelfPacedAnswer>>({});
  const [code, setCode] = useState(initialCode ?? "");
  const [result, setResult] = useState<SubmitResult | null>(null);
  const q = data.questions[index];
  const current = q ? answers[q.id] : undefined;
  const last = index === data.questions.length - 1;
  const answered = Boolean(current && (current.optionIndex !== undefined || current.text || (current.pairs && current.pairs.length === (q?.matching?.lefts.length ?? 0))));

  const submit = useMutation({
    mutationFn: () => submitSelfPaced(code.replace(/\D/g, ""), Object.values(answers), startedAt) as Promise<SubmitResult>,
    onSuccess: (r) => setResult(r),
  });

  if (result) {
    return (
      <div className="quizw">
        <div className="qcard" role="status">
          <Illus name="star-buddy" size={110} className="mascot" />
          <h1>{t("self.done")}</h1>
          <p className="qtext">{t("self.score", { correct: result.correct, total: result.total })}</p>
          <p className="muted">{t("self.xp", { xp: result.xp })}</p>
          <ul className="optl" aria-label={t("self.review")}>
            {result.review.map((r) => (
              <li key={r.questionId} style={{ padding: "4px 0" }}><b>{r.questionId}</b>{" "}{r.correct ? t("self.right") : t("game.notYet")}{r.explanation ? ` ${r.explanation}` : ""}</li>
            ))}
          </ul>
          <ButtonLink size="big" href="/join">{t("student.back")}</ButtonLink>
        </div>
      </div>
    );
  }
  if (!q) return <p className="muted">{t("self.empty")}</p>;

  const set = (a: Partial<SelfPacedAnswer>) => setAnswers((m) => ({ ...m, [q.id]: { ...m[q.id], ...a, questionId: q.id } }));

  return (
    <div className="quizw">
      <div className="qcard">
        <div className="qmeta">
          <span className="st soft">{data.lessonTitle}</span>
          <Progress value={index + 1} max={data.questions.length} label={t("quiz.question.n", { n: index + 1, total: data.questions.length })} />
        </div>
        <h1>{t("quiz.question.n", { n: index + 1, total: data.questions.length })}</h1>
        <p className="qtext" id="sp-q">{q.prompt}</p>
        <div><ReadAloud text={q.prompt} /></div>

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

        {last && !initialCode && (
          <div className="field">
            <label htmlFor="sp-code">{t("self.code")}</label>
            <input id="sp-code" dir="ltr" inputMode="numeric" value={code} maxLength={7} onChange={(e) => setCode(e.target.value)} placeholder="482 913" />
          </div>
        )}
        {submit.isError && <p className="err" role="alert">{errorMessage(submit.error)}</p>}
        <div className="toolrow">
          {index > 0 && <Button variant="secondary" onClick={() => setIndex(index - 1)}>{t("self.back")}</Button>}
          {!last ? (
            <Button size="big" disabled={!answered} onClick={() => setIndex(index + 1)}>{t("game.tf.next")}</Button>
          ) : (
            <Button size="big" disabled={!answered || submit.isPending || code.replace(/\D/g, "").length !== 6} onClick={() => submit.mutate()}>{submit.isPending ? t("common.loading") : t("self.submit")}</Button>
          )}
        </div>
        <button type="button" className="lnk" onClick={() => router.push("/join")}>{t("game.stop")}</button>
      </div>
    </div>
  );
}
