"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import type { StudentQuizState } from "@helpo/shared";
import { api, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { qk, useStudentQuiz } from "@/lib/queries";
import { Button, ButtonLink } from "@/components/ui/button";
import { Illus } from "@/components/ui/illus";
import { Async } from "@/components/ui/states";
import { ReadAloud } from "./read-aloud";

export function QuizView({ sessionId }: { sessionId: string }) {
  const quiz = useStudentQuiz(sessionId);
  const { t } = useI18n();
  return (
    <Async query={quiz} label={t("quiz.loading")} signInHref="/join" signInLabel={t("student.signin")}>
      {(state) => <Quiz state={state} />}
    </Async>
  );
}

function Quiz({ state }: { state: StudentQuizState }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();
  const [text, setText] = useState("");
  const [pop, setPop] = useState<number | null>(null);
  const lastIndex = useRef(state.questionIndex);

  useEffect(() => {
    if (lastIndex.current !== state.questionIndex) {
      lastIndex.current = state.questionIndex;
       
      setText("");
    }
  }, [state.questionIndex]);

  const answer = useMutation({
    mutationFn: (body: { optionIndex?: number; text?: string }) =>
      api<StudentQuizState>(`/play/sessions/${state.sessionId}/answers`, { method: "POST", body: { questionIndex: state.questionIndex, ...body } }),
    onSuccess: (next) => {
      if (!state.myAnswer) setPop(10);
      queryClient.setQueryData(qk.playQuiz(state.sessionId), next);
    },
  });

  if (state.status === "ENDED") {
    return (
      <div className="quizw">
        <div className="qcard" role="status">
          <Illus name="star-buddy" size={110} className="mascot" />
          <h1>{t("quiz.ended")}</h1>
          <p className="muted">{t("quiz.ended.text")}</p>
          <ButtonLink href="/play">{t("student.back")}</ButtonLink>
        </div>
      </div>
    );
  }

  const q = state.question;
  if (state.status === "LOBBY" || !q) {
    return (
      <div className="quizw">
        <div className="qcard" role="status" aria-live="polite">
          <Illus name="sprout-sun" size={160} />
          <h1>{state.lessonTitle}</h1>
          <p className="qtext">{t("quiz.waiting")}</p>
        </div>
      </div>
    );
  }

  const locked = Boolean(state.revealed);
  const chosen = state.myAnswer?.optionIndex ?? null;
  const dots = Array.from({ length: state.questionCount }, (_, i) => i);

  return (
    <div className="quizw">
      <div className="qcard" style={{ position: "relative" }}>
        <div className="qmeta">
          <span className="st soft">{state.lessonTitle}</span>
          <span className="dots" role="img" aria-label={t("quiz.question.n", { n: state.questionIndex + 1, total: state.questionCount })}>
            {dots.map((i) => <i key={i} className={i <= state.questionIndex ? "on" : ""} />)}
          </span>
        </div>
        <h1>{t("quiz.question.n", { n: state.questionIndex + 1, total: state.questionCount })}</h1>
        <p className="qtext" id="q-text">{q.prompt}</p>
        <div><ReadAloud text={q.prompt} /></div>

        {q.type === "short" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim() && !locked) answer.mutate({ text: text.trim() });
            }}
            className="field"
          >
            <label htmlFor="short" className="sr">{t("quiz.short.label")}</label>
            <input id="short" value={text || state.myAnswer?.text || ""} disabled={locked} maxLength={1000} onChange={(e) => setText(e.target.value)} style={{ minHeight: 64, fontSize: 22 }} />
            <Button type="submit" size="big" disabled={locked || !text.trim() || answer.isPending}>{t("quiz.short.send")}</Button>
          </form>
        ) : (
          <div className={q.type === "true_false" ? "qtf" : "qopts"} role="group" aria-label={t("quiz.answers")}>
            {q.options.map((option, i) => {
              const isRight = state.revealed?.correctIndex === i;
              return (
                <div className="tw" key={i}>
                  <button type="button" className={`ans c-answer ${isRight ? "right-ans" : ""}`} style={q.type === "true_false" ? undefined : { minHeight: 72, width: "100%", borderRadius: 22, border: "3px solid", fontSize: 22, fontWeight: 900, padding: "8px 20px", textAlign: "start" }} aria-pressed={chosen === i} disabled={locked && !isRight && chosen !== i} onClick={() => !locked && answer.mutate({ optionIndex: i })}>
                    {option}
                    {isRight && <span className="sr"> ({t("preview.correct")})</span>}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p className="savednote" role="status" aria-live="polite">
          {answer.isError ? errorMessage(answer.error) : state.myAnswer ? t("quiz.saved") : ""}
        </p>
        {pop !== null && (
          <motion.span
            className="xp-pop"
            style={{ insetInlineStart: "50%", top: 72 }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.8 }}
            animate={reduce ? { opacity: 1 } : { opacity: [0, 1, 0], y: -40, scale: 1 }}
            transition={{ duration: 1.1 }}
            onAnimationComplete={() => setPop(null)}
          >
            +{pop} XP
          </motion.span>
        )}
        {state.revealed && (
          <div className="fb" role="status" aria-live="polite" style={{ flexDirection: "column", alignItems: "flex-start" }}>
            <b>{state.revealed.correct ? t("quiz.right") : t("quiz.notYet")}</b>{" "}
            {state.revealed.explanation && <span>{state.revealed.explanation}</span>}
          </div>
        )}
        <p className="muted small not-st">{t("quiz.every")}</p>
      </div>
      <p className="muted small" style={{ textAlign: "center" }}>{t("quiz.notRanked")}</p>
    </div>
  );
}
