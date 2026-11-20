"use client";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import QRCode from "qrcode";
import { formatJoinCode, playableTemplates, type GameContent, type LessonDetail, type ResourceKind, type SessionTeacherView, type GameKind } from "@helpo/shared";
import { Copy, Radio, Users } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useTeacherSession } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { InlineConfirm } from "@/components/ui/confirm";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { LiveBoard } from "./live-board";

type Mode = "LIVE_QUIZ" | "GAME" | "ASSIGNMENT";

/** Which resource is shared: the Game tab shares the game, every other tab shares the quiz. */
export function shareTarget(lesson: LessonDetail, tab: ResourceKind) {
  const kind: ResourceKind = tab === "GAME" ? "GAME" : "QUIZ";
  const resource = lesson.resources.find((r) => r.kind === kind && r.status === "READY");
  const game: GameKind | undefined =
    kind === "GAME" && resource?.content ? playableTemplates(resource.content as GameContent, lesson.band)[0] : undefined;
  return { kind, resource, game };
}

/** Step 1: two big choices. Step 2: the code, QR, link and switch. */
export function ShareDialogBody({ lesson, tab }: { lesson: LessonDetail; tab: ResourceKind }) {
  const { t } = useI18n();
  const toast = useToast();
  const target = shareTarget(lesson, tab);
  const [expiry, setExpiry] = useState(24);
  const [board, setBoard] = useState<"OFF" | "TEAMS" | "INDIVIDUAL">("TEAMS");
  const [confirm, setConfirm] = useState<Mode | null>(null);
  const [created, setSession] = useState<SessionTeacherView | null>(null);
  const polled = useTeacherSession(created?.id ?? null);
  const session = polled.data ?? created;
  const [running, setRunning] = useState(false);
  const [qr, setQr] = useState("");
  const open = lesson.checks.filter((c) => c.status === "OPEN").length;
  const individualOff = lesson.grade <= 5;

  const create = useMutation({
    mutationFn: (mode: Mode) =>
      api<SessionTeacherView>(`/resources/${target.resource?.id}/share`, {
        method: "POST",
        body: {
          mode: mode === "LIVE_QUIZ" && target.kind === "GAME" ? "GAME" : mode,
          game: target.game,
          dueAt: mode === "ASSIGNMENT" ? new Date(Date.now() + 7 * 86400000).toISOString() : undefined,
          expiresInHours: expiry,
          leaderboard: board,
          ...(open > 0 ? { approveAnyway: true } : {}),
        },
      }),
    onSuccess: (s) => {
      window.localStorage.setItem(`helpo:last-session:${lesson.id}`, s.id);
      setSession(s);
    },
  });

  const close = useMutation({
    mutationFn: (action: "open" | "close") => api<SessionTeacherView>(`/sessions/${session?.id}/action`, { method: "POST", body: { action } }),
    onSuccess: (s) => setSession(s),
  });

  const link = session?.link ?? "";
  useEffect(() => {
    if (!session || session.qrSvg || !link) return;
    let off = false;
    QRCode.toString(link, { type: "svg", margin: 0, color: { dark: "#24185F", light: "#FFFFFF" } })
      .then((svg) => !off && setQr(svg))
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [session, link]);

  const choose = (mode: Mode) => (open > 0 ? setConfirm(mode) : create.mutate(mode));

  if (running && session) return <LiveBoard lesson={lesson} session={session} onEnded={() => undefined} />;

  if (!session) {
    return (
      <div className="share-step">
        {!target.resource && <p className="callout" role="status">{t("share.notReady")}</p>}
        <div className="share-choices">
          <button type="button" className="share-choice" disabled={!target.resource || create.isPending} onClick={() => choose("LIVE_QUIZ")}>
            <Radio aria-hidden="true" />
            <b>{t("share.live")}</b>
            <span>{t("share.live.text")}</span>
          </button>
          <button type="button" className="share-choice" disabled={!target.resource || create.isPending} onClick={() => choose("ASSIGNMENT")}>
            <Users aria-hidden="true" />
            <b>{t("share.self")}</b>
            <span>{t("share.self.text")}</span>
          </button>
        </div>
        {confirm && (
          <InlineConfirm message={t("share.confirm", { n: open })} confirmLabel={t("share.confirm.yes")} cancelLabel={t("share.confirm.no")} onConfirm={() => create.mutate(confirm)} onCancel={() => setConfirm(null)} />
        )}
        {create.isError && <p className="err" role="alert">{errorMessage(create.error)}</p>}
        <details className="opt">
          <summary>{t("share.options")}</summary>
          <div className="field">
            <label htmlFor="expiry">{t("share.expiry")}</label>
            <select id="expiry" value={expiry} onChange={(e) => setExpiry(Number(e.target.value))} style={{ maxWidth: 260 }}>
              {[1, 4, 24, 72, 168].map((h) => <option key={h} value={h}>{t("share.hours", { n: h })}</option>)}
            </select>
          </div>
          <div className="field">
            <span className="lab" id="lb-label">{t("share.leaderboard")}</span>
            <div className="stk2" role="radiogroup" aria-labelledby="lb-label">
              {(["TEAMS", "INDIVIDUAL", "OFF"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={board === m} aria-disabled={m === "INDIVIDUAL" && individualOff ? true : undefined} onClick={() => !(m === "INDIVIDUAL" && individualOff) && setBoard(m)}>
                  {t(`share.lb.${m}` as "share.lb.TEAMS")}
                </button>
              ))}
            </div>
            {individualOff && <p className="hint">{t("share.lb.reason")}</p>}
          </div>
        </details>
      </div>
    );
  }

  const svg = session.qrSvg || qr;
  const live = session.status !== "ENDED" && session.isOpen !== false;
  return (
    <div className="share-step">
      <div className="share-code">
        <div>
          <p className="muted small">{t("share.code")}</p>
          <p className="code" aria-label={t("teach.codeLabel", { code: formatJoinCode(session.joinCode) })}><bdi dir="ltr">{formatJoinCode(session.joinCode)}</bdi></p>
        </div>
        <div className="qr">{svg ? <div role="img" aria-label={t("teach.qr")} dangerouslySetInnerHTML={{ __html: svg.replace("<svg", '<svg width="132" height="132" style="display:block"') }} /> : <div style={{ width: 132, height: 132 }} />}</div>
      </div>
      <div className="share-link">
        <input readOnly value={link} dir="ltr" aria-label={t("share.link")} onFocus={(e) => e.currentTarget.select()} />
        <Button onClick={() => void navigator.clipboard?.writeText(link).then(() => toast.show(t("share.copied")))}>
          <Copy className="ic" aria-hidden="true" />
          {t("share.copy")}
        </Button>
      </div>
      <p className="muted" role="status" aria-live="polite">{t("share.waiting", { n: session.joined })}</p>
      <div className="share-open">
        <Switch checked={live} labelledBy="open-label" disabled={session.status === "ENDED" || close.isPending} onChange={(next) => close.mutate(next ? "open" : "close")} />
        <span id="open-label">{live ? t("share.open") : t("share.closed")}</span>
        {session.expiresAt && <span className="muted small">{t("share.until", { date: new Date(session.expiresAt).toLocaleString() })}</span>}
      </div>
      {session.type === "LIVE_QUIZ" && live && <Button size="big" onClick={() => setRunning(true)}>{t("share.run")}</Button>}
      <button type="button" className="lnk" onClick={() => setSession(null)}>{t("share.change")}</button>
    </div>
  );
}
