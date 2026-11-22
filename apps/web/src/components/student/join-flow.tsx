"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MAX_GRADE, MIN_GRADE, bandForGrade, normalizeJoinCode, type JoinOption, type JoinResult } from "@helpo/shared";
import { Check, Clock, Radio } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { bandAttr } from "@/lib/band";
import { useI18n, type TFunction } from "@/lib/i18n";
import { qk, useJoinClasses, useJoinStudents } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Illus } from "@/components/ui/illus";
import { Skeleton } from "@/components/ui/motion";
import { ReadAloud } from "./read-aloud";

type Live = JoinOption["live"];

/** What the one big button says, from what is live right now. */
export function joinLabel(live: Live, t: TFunction): string {
  if (!live) return t("join.button.none");
  return live.type === "LIVE_QUIZ" ? t("join.button.quiz") : live.type === "GAME" ? t("join.button.game") : t("join.button.homework");
}

/** Where a joined student goes: the live quiz, the shared game (assigned work first), or the practice hub when nothing is live. */
export async function resolvePath(result: JoinResult, code?: string | null): Promise<string> {
  if (result.next === "quiz" && result.sessionId) return `/play/quiz/${result.sessionId}`;
  if (result.next === "game" && result.sessionId) {
    // A self-paced (ASSIGNMENT) session has questions for this student; a live game session answers 409.
    const probe = await api(`/play/sessions/${result.sessionId}/questions`).then(() => true).catch(() => false);
    if (probe) return `/play/self/${result.sessionId}${code ? `?code=${code}` : ""}`;
  }
  if (result.next === "game") {
    const games = await api<{ lessonId: string; game: string; assigned: boolean }[]>("/play/games");
    const pick = games.find((g) => g.assigned) ?? games[0];
    return pick ? `/play/games/${pick.lessonId}/${pick.game}` : "/play";
  }
  // Nothing live: the practice hub, never a dead end.
  return "/play";
}

const GRADES = Array.from({ length: MAX_GRADE - MIN_GRADE + 1 }, (_, i) => MIN_GRADE + i);

export function JoinFlow({ initialCode, school = "riverside", onBand }: { initialCode?: string; school?: string; onBand?: (band: ReturnType<typeof bandForGrade>) => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [grade, setGrade] = useState<number | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [code, setCode] = useState(initialCode ?? "");
  const [name, setName] = useState("");
  const [joined, setJoined] = useState<{ name: string; result: JoinResult } | null>(null);

  const digits = normalizeJoinCode(code);
  const classes = useJoinClasses(school, grade);
  const students = useJoinStudents(classId);
  const byCode = useQuery({ queryKey: qk.joinCode(digits ?? ""), queryFn: () => api<JoinOption>(`/play/code/${digits}`), enabled: Boolean(digits), retry: false });

  useEffect(() => {
    if (grade) onBand?.(bandForGrade(grade));
  }, [grade, onBand]);

  const option = classes.data?.find((c) => c.classId === classId) ?? null;
  const usingCode = Boolean(digits) && !byCode.isError;
  const confirmed = usingCode && byCode.isSuccess && !changing;
  const live: Live = usingCode ? (byCode.data?.live ?? null) : (option?.live ?? null);

  const join = useMutation({
    mutationFn: async () => {
      if (usingCode) return api<JoinResult>(`/play/code/${digits}/join`, { method: "POST", body: { name: name.trim() } });
      return api<JoinResult>("/join", { method: "POST", body: { classId: classId ?? undefined, studentId: studentId ?? undefined } });
    },
    onSuccess: async (result) => {
      const picked = students.data?.find((s) => s.id === studentId)?.displayName ?? name.trim();
      setJoined({ name: picked, result });
      const path = await resolvePath(result, usingCode ? digits : null).catch(() => "/play");
      router.push(path);
    },
  });

  const ready = usingCode ? name.trim().length > 0 && byCode.isSuccess : Boolean(classId && studentId);
  const bandName = grade ? bandAttr(bandForGrade(grade)) : "navigator";

  if (joined) {
    return (
      <div className="joinw" data-band-hint={bandName}>
        <div className="panel inbox" role="status">
          <Illus name="star-buddy" size={130} className="mascot" />
          <h1 id="in-h" tabIndex={-1} style={{ fontSize: "clamp(26px,4vw,36px)", fontWeight: 900 }}>{t("join.in", { name: joined.name })}</h1>
          <p className="muted" style={{ fontSize: 19 }}>{joined.result.sessionId ? t("join.in.live") : t("join.in.wait")}</p>
          <Button size="big" onClick={async () => { router.push(await resolvePath(joined.result, usingCode ? digits : null).catch(() => "/play")); }}>{joined.result.next === "quiz" ? t("join.open.quiz") : joined.result.next === "game" ? t("join.open.game") : t("join.open.practice")}</Button>
          <button type="button" className="lnk" onClick={() => setJoined(null)}>{t("join.different")}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="joinw compact">
      <div className="panel" id="join-form">
        <h1 style={{ fontSize: "clamp(26px,4vw,38px)", fontWeight: 900, marginBottom: 4 }}>{t("join.title")}</h1>
        <p className="muted join-sub">{t("join.subtitle")}</p>

        {confirmed ? (
          <p className="code-chip" role="status">
            <span>{t("join.code.confirmed")} <bdi dir="ltr">{digits}</bdi></span>
            <Check className="ic" aria-hidden="true" />
            <button type="button" className="lnk" onClick={() => { setChanging(true); setTimeout(() => document.getElementById("join-code")?.focus(), 0); }}>{t("join.code.change")}</button>
          </p>
        ) : (
          <div className="codef">
            <label htmlFor="join-code">{t("join.code.enter")}</label>
            <input id="join-code" dir="ltr" inputMode="numeric" autoComplete="off" value={code} maxLength={7} onChange={(e) => { setCode(e.target.value); setChanging(false); }} placeholder="482 913" aria-invalid={digits && byCode.isError ? true : undefined} aria-describedby="join-status" />
          </div>
        )}

        {!usingCode ? (
          <>
            <p className="or-line">{t("join.or")}</p>
            <section className="jstep" aria-labelledby="j1">
              <div className="sth"><span className="num" aria-hidden="true">1</span><h2 id="j1">{t("join.grade")}</h2><ReadAloud text={t("join.grade")} compact /></div>
              <div className="gchips" role="group" aria-labelledby="j1">
                {GRADES.map((g) => (
                  <button key={g} type="button" aria-pressed={g === grade} onClick={() => { setGrade(g); setClassId(null); setStudentId(null); }}>
                    {g}
                    <span className="sr"> {t("join.gradeWord")}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="jstep" aria-labelledby="j2">
              <div className="sth"><span className="num" aria-hidden="true">2</span><h2 id="j2">{t("join.class")}</h2><ReadAloud text={t("join.class")} compact /></div>
              {grade === null ? (
                <p className="muted small">{t("join.class.first")}</p>
              ) : classes.isPending ? (
                <div role="status" aria-busy="true"><Skeleton block={{ h: 64, r: 18 }} /><span className="sr">{t("common.loading")}</span></div>
              ) : classes.isError ? (
                <p className="err" role="alert">{errorMessage(classes.error)}</p>
              ) : classes.data.length === 0 ? (
                <p className="muted">{t("join.class.none")}</p>
              ) : (
                <div className="ctiles" role="group" aria-labelledby="j2">
                  {classes.data.map((c) => (
                    <button key={c.classId} type="button" aria-pressed={c.classId === classId} onClick={() => { setClassId(c.classId); setStudentId(null); }}>
                      <b>{c.className}</b>
                      <span>{c.teacherName}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="jstep" aria-labelledby="j3">
              <div className="sth"><span className="num" aria-hidden="true">3</span><h2 id="j3">{t("join.name")}</h2><ReadAloud text={t("join.name")} compact /></div>
              {!classId ? (
                <p className="muted small">{t("join.name.first")}</p>
              ) : students.isPending ? (
                <div role="status" aria-busy="true"><Skeleton block={{ h: 64, r: 18 }} /><span className="sr">{t("common.loading")}</span></div>
              ) : (
                <div className="ntiles" role="group" aria-labelledby="j3">
                  {students.data?.map((s) => (
                    <button key={s.id} type="button" aria-pressed={s.id === studentId} onClick={() => setStudentId(s.id)}>{s.displayName}</button>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="jstep">
            <div className="field">
              <label htmlFor="join-name" style={{ fontFamily: "var(--font-fredoka)", fontSize: 24 }}>{t("join.code.name")}</label>
              <input id="join-name" value={name} autoComplete="given-name" maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={t("join.code.name.placeholder")} style={{ minHeight: 64, fontSize: 22 }} />
              <p className="hint">{t("join.code.name.hint")}</p>
            </div>
          </section>
        )}

        <div id="join-status" className={`livebox ${live ? "" : "off"}`} role="status" aria-live="polite">
          {live ? (
            <>
              <span className="live-ic" aria-hidden="true"><Radio className="ic" /></span>
              <span>{live.type === "LIVE_QUIZ" ? t("join.live.quiz", { title: live.lessonTitle }) : t("join.live.game", { title: live.lessonTitle })}</span>
            </>
          ) : (
            <>
              <Clock className="ic" aria-hidden="true" />
              <span>{digits && byCode.isError ? t("join.code.bad") : t("join.live.none")}</span>
            </>
          )}
        </div>

        <Button size="big" className="joinbtn" id="join-btn" disabled={!ready || join.isPending} onClick={() => join.mutate()}>
          {join.isPending ? t("common.loading") : joinLabel(live, t)}
        </Button>
        {join.isError && <p className="err" role="alert">{errorMessage(join.error)}</p>}
        {!ready && <p className="hint" style={{ justifyContent: "center", marginTop: 6 }}>{usingCode ? t("join.why.code") : t("join.why.pick")}</p>}

        <p className="muted small join-safe">{t("join.safe")}</p>
      </div>
    </div>
  );
}
