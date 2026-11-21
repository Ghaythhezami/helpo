"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PracticeQuiz, PracticeResult } from "@helpo/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { outcomeFromPractice, practiceQuestions, type QuizOutcome } from "@/lib/practice";
import { qk, usePractice, usePracticeQuiz } from "@/lib/queries";
import { buildSubmitBody, type SelfPacedAnswer } from "@/lib/self-paced";
import { ButtonLink } from "@/components/ui/button";
import { Async } from "@/components/ui/states";
import { QuizRunner } from "./quiz-runner";

/** Practice quiz for one lesson: no session, no class results. The server grades and returns a small XP. */
export function PracticeQuizView({ lessonId }: { lessonId: string }) {
  const { t } = useI18n();
  const quiz = usePracticeQuiz(lessonId);
  return (
    <Async query={quiz} label={t("quiz.loading")} signInHref="/join" signInLabel={t("student.signin")}>
      {(data) => <PracticeRunner lessonId={lessonId} data={data} />}
    </Async>
  );
}

function PracticeRunner({ lessonId, data }: { lessonId: string; data: PracticeQuiz }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const practice = usePractice();
  const firstGame = practice.data?.lessons.find((l) => l.lessonId === lessonId)?.games[0];
  const submit = useMutation({
    mutationFn: (v: { answers: SelfPacedAnswer[]; startedAt: number }) =>
      api<PracticeResult>(`/play/practice/${lessonId}/quiz`, { method: "POST", body: buildSubmitBody(v.answers, v.startedAt) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.playMe });
    },
  });
  const run = async (answers: SelfPacedAnswer[], startedAt: number): Promise<QuizOutcome> => outcomeFromPractice(await submit.mutateAsync({ answers, startedAt }));

  return (
    <QuizRunner
      title={data.lessonTitle}
      questions={practiceQuestions(data)}
      submit={run}
      exitHref="/play"
      exitLabel={t("practice.backToPractice")}
      note={t("practice.noSave")}
      footer={() => (
        <>
          <ButtonLink size="big" href={firstGame ? `/play/games/${lessonId}/${firstGame}` : "/play"}>{t("practice.playGame")}</ButtonLink>
          <ButtonLink size="big" variant="secondary" href="/play">{t("practice.backToPractice")}</ButtonLink>
        </>
      )}
    />
  );
}
