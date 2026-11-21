"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GAME_KINDS, GAME_TEMPLATES, type GameKind, type GameResultView } from "@helpo/shared";
import { api, errorMessage } from "@/lib/api";
import { bandUi } from "@/lib/band";
import { useI18n } from "@/lib/i18n";
import { qk, useStudentGame, useStudentHome } from "@/lib/queries";
import { saveLastResult } from "@/lib/student-helpers";
import { Async } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { GameBar, PauseDialog, type GameProps } from "./game-bits";
import { EquationGame, MatchGame, MemoryGame, SortGame, TrueFalseGame } from "./games";

export function GamePlay({ lessonId, game }: { lessonId: string; game: string }) {
  const { t } = useI18n();
  const kind = game.toUpperCase() as GameKind;
  const valid = GAME_KINDS.includes(kind);
  const data = useStudentGame(lessonId, valid ? kind : "MATCH");
  if (!valid) return <p className="err" role="alert">{t("game.unknown")}</p>;
  return (
    <Async query={data} label={t("game.loading")} signInHref="/join" signInLabel={t("student.signin")}>
      {(g) => <GameScreen lessonId={lessonId} kind={kind} content={g.content} title={g.lessonTitle} />}
    </Async>
  );
}

function GameScreen({ lessonId, kind, content, title }: { lessonId: string; kind: GameKind; content: GameProps["content"]; title: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const home = useStudentHome();
  const band = home.data?.band ?? "NAVIGATOR";
  const ui = bandUi(band);
  const classSound = home.data?.settings.soundsEnabled ?? false;
  const [sound, setSound] = useState(false); // off by default; the class setting only allows it
  const [paused, setPaused] = useState(false);
  const [timer, setTimer] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const attempt = 0;

  useEffect(() => {
    if (!timer || paused) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [timer, paused]);

  const submit = useMutation({
    mutationFn: (r: { total: number; firstTryCorrect: number; retriedCorrect: number }) =>
      api<GameResultView>("/play/games/result", { method: "POST", body: { lessonId, game: kind, ...r } }),
    onSuccess: async (result) => {
      saveLastResult({ game: kind, lessonId, result });
      await queryClient.invalidateQueries({ queryKey: qk.playMe });
      await queryClient.invalidateQueries({ queryKey: qk.playGames });
      await queryClient.invalidateQueries({ queryKey: qk.playPractice });
      router.push("/play/win");
    },
  });

  const tpl = GAME_TEMPLATES[kind];
  const name = locale === "ar" ? tpl.nameAr : t(`game.${kind}` as "game.MATCH");
  const props: GameProps = { content, seed: `${lessonId}:${kind}:${attempt}`, explorer: ui.readAloud, sound, onFinish: (r) => submit.mutate(r), busy: submit.isPending };

  return (
    <>
      <GameBar
        title={name}
        sound={sound}
        onSound={() => {
          if (!sound && !classSound) toast.show(t("game.sound.classOff"));
          setSound((s) => !s);
        }}
        onPause={() => setPaused(true)}
        timer={timer}
        onTimer={() => { setTimer((v) => !v); setSeconds(0); }}
        seconds={seconds}
        studio={ui.timers}
      />
      <p className="sr" role="status">{title}</p>
      <div key={attempt}>
        {kind === "MATCH" && <MatchGame {...props} />}
        {kind === "MEMORY" && <MemoryGame {...props} />}
        {kind === "SORT" && <SortGame {...props} />}
        {kind === "EQUATION" && <EquationGame {...props} />}
        {kind === "TRUE_FALSE" && <TrueFalseGame {...props} timed={ui.timers || band === "NAVIGATOR"} />}
      </div>
      {submit.isError && (
        <p className="err" role="alert">
          {errorMessage(submit.error)}{" "}
          <button type="button" className="lnk" onClick={() => submit.reset()}>{t("common.tryAgain")}</button>
        </p>
      )}
      {paused && (
        <PauseDialog
          onResume={() => setPaused(false)}
          onStop={() => {
            setPaused(false);
            toast.show(t("game.stopped"));
            router.push("/play");
          }}
        />
      )}
    </>
  );
}
