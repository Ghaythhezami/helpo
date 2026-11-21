"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { QuizOutcome } from "@/lib/practice";
import type { SelfPacedAnswer } from "@/lib/self-paced";
import { Button } from "@/components/ui/button";
import { Illus } from "@/components/ui/illus";
import { Progress } from "@/components/ui/progress";
import { QuestionBody, isAnswered, type SelfQuestion } from "./question-body";
import { ReadAloud } from "./read-aloud";

/**
 * One question at a time, then everything is sent at once. Used by the practice quiz (the server grades) and by the
 * teacher's "Preview as student" (graded in the browser). The same cards as the self-paced quiz.
 */
export function QuizRunner({
  title,
  questions,
  submit,
  footer,
  exitHref,
  exitLabel,
  note,
}: {
  title: string;
  questions: SelfQuestion[];
  submit: (answers: SelfPacedAnswer[], startedAt: number) => Promise<QuizOutcome>;
  /** Buttons under the review. */
  footer: (outcome: QuizOutcome) => ReactNode;
  exitHref?: string;
  exitLabel?: string;
  note?: string;
}) {
  const { t } = useI18n();
  const [startedAt] = useState(() => Date.now());
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, SelfPacedAnswer>>({});
  const [outcome, setOutcome] = useState<QuizOutcome | null>(null);
  const q = questions[index];
  const current = q ? answers[q.id] : undefined;
  const last = index === questions.length - 1;
  const answered = isAnswered(q, current);

  const send = useMutation({
    mutationFn: () => submit(questions.flatMap((x) => (answers[x.id] ? [answers[x.id]] : [])), startedAt),
    onSuccess: (r) => setOutcome(r),
  });

  if (outcome) {
    const promptOf = new Map(questions.map((x) => [x.id, x.prompt]));
    return (
      <div className="quizw rvw">
        <div className="qcard" role="status">
          <Illus name="star-buddy" size={90} className="mascot" />
          <h1>{t("self.done")}</h1>
          <p className="qtext">{t("self.score", { correct: outcome.correct, total: outcome.total })}</p>
          {outcome.xp !== null && <p className="muted">{t("practice.xp", { xp: outcome.xp })}</p>}
          <ul className="rvl" aria-label={t("practice.review")}>
            {outcome.review.map((r) => (
              <li key={r.questionId} className={r.correct ? "ok" : "no"}>
                <b>{promptOf.get(r.questionId) ?? r.questionId}</b>
                <span>
                  {r.correct ? t("quiz.right") : t("quiz.notYet")}
                  {!r.correct && r.correctAnswer ? ` ${t("practice.correctAnswer", { answer: r.correctAnswer })}` : ""}
                  {r.explanation ? ` ${r.explanation}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <div className="toolrow">{footer(outcome)}</div>
        </div>
      </div>
    );
  }
  if (!q) return <p className="muted" role="status">{t("practice.quiz.empty")}</p>;

  const set = (a: Partial<SelfPacedAnswer>) => setAnswers((m) => ({ ...m, [q.id]: { ...m[q.id], ...a, questionId: q.id } }));

  return (
    <div className="quizw">
      <div className="qcard">
        <div className="qmeta">
          <span className="st soft">{title}</span>
          <Progress value={index + 1} max={questions.length} label={t("quiz.question.n", { n: index + 1, total: questions.length })} />
        </div>
        <h1>{t("quiz.question.n", { n: index + 1, total: questions.length })}</h1>
        <p className="qtext" id="sp-q">{q.prompt}</p>
        <div><ReadAloud text={q.prompt} /></div>

        <QuestionBody key={q.id} q={q} current={current} set={set} />

        {send.isError && <p className="err" role="alert">{errorMessage(send.error)}</p>}
        <div className="toolrow">
          {index > 0 && <Button variant="secondary" onClick={() => setIndex(index - 1)}>{t("self.back")}</Button>}
          {!last ? (
            <Button size="big" disabled={!answered} onClick={() => setIndex(index + 1)}>{t("game.tf.next")}</Button>
          ) : (
            <Button size="big" disabled={!answered || send.isPending} onClick={() => send.mutate()}>{send.isPending ? t("common.loading") : t("self.submit")}</Button>
          )}
        </div>
        {exitHref && <Link className="lnk" href={exitHref}>{exitLabel}</Link>}
        {note && <p className="muted small">{note}</p>}
      </div>
    </div>
  );
}
