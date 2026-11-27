"use client";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { formatJoinCode, type LessonDetail, type QuizContent, type SessionTeacherView } from "@helpo/shared";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Square } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { qk } from "@/lib/queries";
import { Button, ButtonLink } from "@/components/ui/button";
import { Hero } from "@/components/ui/card";
import { InlineConfirm } from "@/components/ui/confirm";
import { Pill } from "@/components/ui/pill";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { gameName } from "@/components/student/practice-hub";

/* ------------------------------- projector board ------------------------------- */

export function LiveBoard({ lesson, session, onEnded }: { lesson: LessonDetail; session: SessionTeacherView; onEnded: () => void }) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [origin, setOrigin] = useState("");
  const [qr, setQr] = useState("");
  const isQuiz = session.type === "LIVE_QUIZ";
  const joinUrl = `${origin}/join?code=${session.joinCode}`;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- origin is only known in the browser
    setOrigin(window.location.origin);
  }, []);
  useEffect(() => {
    if (!origin) return;
    let cancelled = false;
    QRCode.toString(joinUrl, { type: "svg", margin: 0, color: { dark: "#24185F", light: "#FFFFFF" } })
      .then((svg) => !cancelled && setQr(svg))
      .catch(() => !cancelled && setQr(""));
    return () => {
      cancelled = true;
    };
  }, [origin, joinUrl]);

  const act = useMutation({
    mutationFn: (action: "start" | "next" | "prev" | "reveal" | "end" | "toggleNames") =>
      api<SessionTeacherView>(`/sessions/${session.id}/action`, { method: "POST", body: { action } }),
    onSuccess: (data) => {
      queryClient.setQueryData(qk.session(session.id), data);
      if (data.status === "ENDED") {
        setConfirmEnd(false);
        onEnded();
      }
    },
  });

  const quiz = lesson.resources.find((r) => r.kind === "QUIZ")?.content as QuizContent | undefined;
  const correctIndex = (() => { const i = quiz?.questions[session.currentQuestion]?.options?.findIndex((o) => o.correct); return i === undefined || i < 0 ? null : i; })();
  const lobby = session.status === "LOBBY";
  const lastQuestion = session.currentQuestion >= session.questionCount - 1;
  const heading = isQuiz ? t("teach.live.quiz", { title: lesson.title }) : t("teach.live.game", { game: session.game ? t(`game.${session.game}` as "game.MATCH") : "" });
  const code = formatJoinCode(session.joinCode);

  return (
    <>
      <Hero>
        <div className="copy">
          <h1>{heading}</h1>
          <p className="muted">
            {t("teach.joined", { n: session.joined, total: session.classSize, name: lesson.className })}
            {session.namesHidden ? ` · ${t("teach.namesHiddenNote")}` : ""}
          </p>
          {session.games && session.games.length > 0 && (
            <ul className="board-games" aria-label={t("board.games")}>
              {session.games.map((g) => (
                <li key={g.game} className="chip">{gameName(g.game, locale, t)} <b><bdi dir="ltr">{t("share.games.pts", { n: g.points })}</bdi></b></li>
              ))}
            </ul>
          )}
        </div>
        <div className="hide-names">
          <Switch checked={session.namesHidden} labelledBy="names-hidden-label" onChange={() => act.mutate("toggleNames")} />
          <span id="names-hidden-label">{t("teach.namesHidden")}</span>
          {session.namesHidden ? <EyeOff className="ic" aria-hidden="true" /> : <Eye className="ic" aria-hidden="true" />}
        </div>
      </Hero>

      <div className="board">
        <section className="join" aria-labelledby="join-h">
          <h2 id="join-h" style={{ font: "600 22px var(--font-fredoka), var(--font-nunito), sans-serif" }}>
            {t("teach.joinAt")} <bdi dir="ltr">{origin ? origin.replace(/^https?:\/\//, "") : "helpo"}</bdi>
          </h2>
          <p className="code" aria-label={t("teach.codeLabel", { code })}><bdi dir="ltr">{code}</bdi></p>
          <div className="qr">
            {(session.qrSvg || qr) ? <div role="img" aria-label={t("teach.qr")} dangerouslySetInnerHTML={{ __html: (session.qrSvg || qr).replace("<svg", '<svg width="150" height="150" style="display:block"') }} /> : <div style={{ width: 150, height: 150 }} />}
          </div>
          <p style={{ fontWeight: 800 }}>{isQuiz ? t("teach.joinedShort", { n: session.joined, total: session.classSize }) : t("teach.playing", { n: session.joined, total: session.classSize })}</p>
          <Progress value={session.joined} max={Math.max(1, session.classSize)} label={t("teach.joinedBar")} />
        </section>

        <div>
          {isQuiz ? (
            <section className="qcard" aria-labelledby="q-h" aria-live="polite">
              {lobby || !session.question ? (
                <>
                  <h2 id="q-h">{t("teach.lobby.title")}</h2>
                  <p className="muted">{t("teach.lobby.text", { n: session.joined })}</p>
                </>
              ) : (
                <>
                  <p className="meta" style={{ fontWeight: 800 }}>{t("teach.question.n", { n: session.currentQuestion + 1, total: session.questionCount })}</p>
                  <h2 id="q-h">{session.question.prompt}</h2>
                  <div className="ans">
                    {session.question.options.map((option, i) => {
                      const right = session.revealed && correctIndex === i;
                      return (
                        <div key={i} className={right ? "right" : undefined}>
                          <span>{String.fromCharCode(65 + i)}</span>
                          <span>{option}</span>
                          {right && <><span className="sr">{t("preview.correct")}</span></>}
                          {session.distribution && <span className="cnt">{session.distribution[i] ?? 0}</span>}
                        </div>
                      );
                    })}
                  </div>
                  <p className="muted" role="status">
                    {session.revealed ? t("teach.revealed") : t("teach.hiddenUntil", { n: session.answeredCurrent, total: session.joined })}
                  </p>
                  {!session.namesHidden && session.notAnswered.length > 0 && (
                    <p className="small muted">{t("teach.waitingOn", { names: session.notAnswered.join(", ") })}</p>
                  )}
                </>
              )}
            </section>
          ) : (
            <section className="qcard" aria-labelledby="g-h">
              <h2 id="g-h">{t("teach.gamePlaying", { n: session.joined, total: session.classSize })}</h2>
              <Progress large value={session.answeredCurrent} max={Math.max(1, session.joined)} label={t("teach.classProgress")} />
              <p className="hint">
                <EyeOff className="ic" aria-hidden="true" />
                <span>{t("teach.gameNote", { code })}</span>
              </p>
            </section>
          )}

          <div className="dock" role="group" aria-label={t("teach.controls")}>
            {isQuiz && !lobby && (
              <>
                <Button size="sm" variant="secondary" disabled={session.currentQuestion === 0 || act.isPending} onClick={() => act.mutate("prev")}>
                  <ArrowLeft className="ic flip" aria-hidden="true" />
                  {t("teach.prev")}
                </Button>
                <Button size="sm" variant="secondary" disabled={session.revealed || act.isPending} onClick={() => act.mutate("reveal")}>
                  <Eye className="ic" aria-hidden="true" />
                  {t("teach.reveal")}
                </Button>
              </>
            )}
            <Button size="sm" variant="secondary" onClick={() => setConfirmEnd(true)}>
              <Square className="ic" aria-hidden="true" />
              {isQuiz ? t("teach.end") : t("teach.endGame")}
            </Button>
            <span className="sp" />
            {isQuiz && lobby && (
              <Button size="sm" disabled={act.isPending} onClick={() => act.mutate("start")}>
                {t("teach.begin")}
                <ArrowRight className="ic flip" aria-hidden="true" />
              </Button>
            )}
            {isQuiz && !lobby && (
              <Button size="sm" disabled={lastQuestion || act.isPending} onClick={() => act.mutate("next")}>
                {t("teach.next")}
                <ArrowRight className="ic flip" aria-hidden="true" />
              </Button>
            )}
          </div>
          {confirmEnd && (
            <InlineConfirm
              message={t("teach.endConfirm", { n: session.joined })}
              confirmLabel={isQuiz ? t("teach.end") : t("teach.endGame")}
              cancelLabel={t("teach.keepGoing")}
              busy={act.isPending}
              onConfirm={() => act.mutate("end")}
              onCancel={() => setConfirmEnd(false)}
            />
          )}
          {act.isError && <p className="err" role="alert">{errorMessage(act.error)}</p>}
          {session.status === "ENDED" && (
            <p className="ok" role="status">
              <Pill tone="ready">{t("teach.ended")}</Pill> <ButtonLink size="sm" variant="ghost" href={`/app/lessons/${lesson.id}/results`}>{t("teach.seeResults")}</ButtonLink>
            </p>
          )}
        </div>
      </div>
    </>
  );
}
