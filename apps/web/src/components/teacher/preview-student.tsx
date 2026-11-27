"use client";
import Link from "next/link";
import { useState } from "react";
import type { GameContent, GameKind, LessonDetail, QuizContent } from "@helpo/shared";
import { ArrowLeft, Eye, NotebookPen } from "lucide-react";
import { bandAttr, bandUi } from "@/lib/band";
import { resourceOf } from "@/lib/checks";
import { useI18n } from "@/lib/i18n";
import { gradeLocally, previewGames, previewQuestions } from "@/lib/practice";
import { useLesson } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Async, EmptyState } from "@/components/ui/states";
import type { GameProps } from "@/components/student/game-bits";
import { EquationGame, MatchGame, MemoryGame, OddOneOutGame, SortGame, TrueFalseGame } from "@/components/student/games";
import { GAME_ICONS, gameName } from "@/components/student/practice-hub";
import { QuizRunner } from "@/components/student/quiz-runner";

type Mode = "QUIZ" | GameKind;

/**
 * "Preview as student": the teacher plays the student quiz and each game template with this lesson's own content,
 * without a session. Answers are checked in the browser and nothing is saved or sent to the play endpoints.
 */
export function PreviewAsStudent({ id }: { id: string }) {
  const { t } = useI18n();
  const lesson = useLesson(id);
  return (
    <Async query={lesson} label={t("common.loading")}>
      {(l) => <PreviewBody lesson={l} />}
    </Async>
  );
}

function PreviewBody({ lesson }: { lesson: LessonDetail }) {
  const { t, locale } = useI18n();
  const quizRes = resourceOf(lesson.resources, "QUIZ");
  const quiz = quizRes?.status === "READY" ? (quizRes.content as QuizContent | null) : null;
  const gameRes = resourceOf(lesson.resources, "GAME");
  const game = gameRes?.status === "READY" ? (gameRes.content as GameContent | null) : null;
  const hasQuiz = Boolean(quiz && quiz.questions.length > 0);
  const kinds = previewGames(game);
  const modes: Mode[] = [...(hasQuiz ? (["QUIZ"] as const) : []), ...kinds];
  const [picked, setPicked] = useState<Mode | null>(null);
  const mode = picked && modes.includes(picked) ? picked : (modes[0] ?? null);
  const [attempt, setAttempt] = useState(0);
  const [finished, setFinished] = useState<{ total: number; firstTryCorrect: number } | null>(null);
  const ui = bandUi(lesson.band);

  const choose = (m: Mode) => {
    setPicked(m);
    setAttempt((a) => a + 1);
    setFinished(null);
  };
  const again = () => {
    setAttempt((a) => a + 1);
    setFinished(null);
  };

  const props: GameProps = {
    content: game as GameContent,
    seed: `${lesson.id}:${mode}:${attempt}`,
    explorer: ui.readAloud,
    sound: false,
    onFinish: (r) => setFinished({ total: r.total, firstTryCorrect: r.firstTryCorrect }),
  };

  return (
    <div className="pvw">
      <header className="pvh">
        <Link href={`/app/lessons/${lesson.id}`} className="btn sm sec pvback" aria-label={t("preview.student.back")}>
          <ArrowLeft className="ic flip" aria-hidden="true" />
          <span className="lbl">{t("preview.student.back")}</span>
        </Link>
        <h1 title={lesson.title}>{lesson.title}</h1>
        <p className="pvbanner" role="status"><Eye className="ic" aria-hidden="true" />{t("preview.student.banner")}</p>
      </header>

      {modes.length > 1 && (
        <div className="pvsw" role="group" aria-label={t("preview.student.template")}>
          {modes.map((m) => {
            const Icon = m === "QUIZ" ? NotebookPen : GAME_ICONS[m];
            const name = m === "QUIZ" ? t("preview.student.quiz") : gameName(m, locale, t);
            return (
              <button key={m} type="button" className="btn sm sec" aria-pressed={m === mode} aria-label={name} title={name} onClick={() => choose(m)}>
                <Icon className="ic" aria-hidden="true" />
                <span className="lbl">{name}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="sapp pvstage" data-band={bandAttr(lesson.band)}>
        {mode === null ? (
          <EmptyState art="magic-book" title={t("preview.student.noContent")}>{[t("preview.student.noQuiz"), t("preview.student.noGame")].join(" ")}</EmptyState>
        ) : mode === "QUIZ" ? (
          <QuizRunner
            key={attempt}
            title={lesson.title}
            questions={previewQuestions(quiz as QuizContent)}
            submit={async (answers) => gradeLocally(quiz as QuizContent, answers)}
            footer={() => <Button size="big" onClick={again}>{t("win.again")}</Button>}
          />
        ) : finished ? (
          <div className="quizw">
            <div className="qcard" role="status">
              <h1>{t("self.done")}</h1>
              <p className="qtext">{t("preview.student.finished", { first: finished.firstTryCorrect, total: finished.total })}</p>
              <div className="toolrow"><Button size="big" onClick={again}>{t("win.again")}</Button></div>
            </div>
          </div>
        ) : (
          <div key={`${mode}-${attempt}`} className="pvgame">
            {mode === "MATCH" && <MatchGame {...props} />}
            {mode === "MEMORY" && <MemoryGame {...props} />}
            {mode === "SORT" && <SortGame {...props} />}
            {mode === "EQUATION" && <EquationGame {...props} />}
            {mode === "ODD_ONE_OUT" && <OddOneOutGame {...props} />}
            {mode === "TRUE_FALSE" && <TrueFalseGame {...props} timed={ui.timers || lesson.band === "NAVIGATOR"} />}
          </div>
        )}
      </div>
    </div>
  );
}
