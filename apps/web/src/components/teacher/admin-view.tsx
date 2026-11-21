"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { AdminOverview } from "@helpo/shared";
import { Activity, Cpu, ExternalLink, ListTree } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useAdminOverview, useMe } from "@/lib/queries";
import { relativeDay } from "@/lib/format";
import { Pill } from "@/components/ui/pill";
import { Async, LoadingState } from "@/components/ui/states";

export function queuesUrl(overview: AdminOverview, base = process.env.NEXT_PUBLIC_API_WS_URL ?? ""): string | null {
  return overview.runtime.queueDriver === "bullmq" && base ? `${base.replace(/\/$/, "")}/admin/queues` : null;
}

const TOTALS: (keyof AdminOverview["totals"])[] = ["schools", "teachers", "classes", "students", "lessons", "sessions", "answers"];

/** Platform overview for admins. Fits the viewport; the two recent lists scroll inside their own panels. */
export function AdminView() {
  const me = useMe();
  const router = useRouter();
  const { t } = useI18n();
  const isAdmin = me.data?.role === "ADMIN";
  const overview = useAdminOverview(isAdmin);

  useEffect(() => {
    if (me.data && me.data.role !== "ADMIN") router.replace("/app");
  }, [me.data, router]);

  if (me.isPending || !isAdmin) return <LoadingState label={t("admin.title")} />;
  return (
    <Async query={overview} label={t("admin.title")}>
      {(data) => <Dashboard data={data} />}
    </Async>
  );
}

function Dashboard({ data }: { data: AdminOverview }) {
  const { t } = useI18n();
  const queues = queuesUrl(data);
  const statuses = Object.entries(data.lessonsByStatus);
  const maxStatus = Math.max(1, ...statuses.map(([, n]) => n));
  const nf = (n: number) => n.toLocaleString();

  return (
    <div className="admin">
      <header className="admin-head">
        <h1>{t("admin.title")}</h1>
        <ul className="admin-badges" aria-label={t("admin.runtime")}>
          <li><Pill tone="soft" icon={false}><Cpu className="ic" aria-hidden="true" />{t("admin.ai")}: {data.runtime.aiMode === "claude" ? t("admin.ai.claude") : t("admin.ai.demo")}</Pill></li>
          <li><Pill tone="soft" icon={false}><ListTree className="ic" aria-hidden="true" />{t("admin.queue")}: {data.runtime.queueDriver}</Pill></li>
          <li><Pill tone="soft" icon={false}><Activity className="ic" aria-hidden="true" />{t("admin.realtime")}: {data.runtime.realtime}</Pill></li>
          <li><Pill tone={data.runtime.demoLogin ? "chk" : "neu"} icon={false}>{t("admin.demoLogin")}: {data.runtime.demoLogin ? t("common.on") : t("common.off")}</Pill></li>
          {queues && (
            <li>
              <a className="btn sm sec" href={queues} target="_blank" rel="noreferrer">
                <ExternalLink className="ic" aria-hidden="true" />
                {t("admin.queues")}
              </a>
            </li>
          )}
        </ul>
      </header>

      <ul className="admin-tiles" aria-label={t("admin.totals")}>
        {TOTALS.map((k) => (
          <li key={k} className="tile">
            <span className="muted small">{t(`admin.total.${k}` as "admin.total.schools")}</span>
            <b>{nf(data.totals[k])}</b>
          </li>
        ))}
      </ul>

      <div className="admin-grid">
        <section className="panel" aria-labelledby="ad-status">
          <h2 id="ad-status">{t("admin.byStatus")}</h2>
          <ul className="admin-bars">
            {statuses.length === 0 && <li className="muted">{t("admin.none")}</li>}
            {statuses.map(([status, n]) => (
              <li key={status}>
                <span>{t(`lstatus.${status}` as "lstatus.READY")}</span>
                <span className="bar" role="progressbar" aria-label={`${status}: ${n}`} aria-valuenow={n} aria-valuemin={0} aria-valuemax={maxStatus}><i style={{ width: "100%", transform: `scaleX(${n / maxStatus})`, transformOrigin: "var(--origin-start)" }} /></span>
                <b>{nf(n)}</b>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel" aria-labelledby="ad-ai">
          <h2 id="ad-ai">{t("admin.aiUsage")}</h2>
          <p className="muted small">{t("admin.aiUsage.sum", { resources: nf(data.ai.resources), tin: nf(data.ai.tokensIn), tout: nf(data.ai.tokensOut) })}</p>
          <div className="admin-scroll">
            <table className="dt">
              <caption className="sr">{t("admin.aiUsage")}</caption>
              <thead><tr><th scope="col">{t("admin.model")}</th><th scope="col">{t("admin.resources")}</th><th scope="col">{t("admin.tokensIn")}</th><th scope="col">{t("admin.tokensOut")}</th></tr></thead>
              <tbody>
                {data.ai.byModel.length === 0 && <tr><td colSpan={4}>{t("admin.none")}</td></tr>}
                {data.ai.byModel.map((m) => (
                  <tr key={m.model}><td><bdi dir="ltr">{m.model}</bdi></td><td>{nf(m.resources)}</td><td>{nf(m.tokensIn)}</td><td>{nf(m.tokensOut)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel" aria-labelledby="ad-lessons">
          <h2 id="ad-lessons">{t("admin.recentLessons")}</h2>
          <ul className="admin-scroll admin-list">
            {data.recentLessons.length === 0 && <li className="muted">{t("admin.none")}</li>}
            {data.recentLessons.map((l) => (
              <li key={l.id}>
                <span className="t"><b>{l.title}</b><small>{l.teacherName} · {relativeDay(l.createdAt, t)}</small></span>
                <Pill tone={l.status === "READY" ? "ready" : "neu"} icon={false}>{t(`lstatus.${l.status}` as "lstatus.READY")}</Pill>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel" aria-labelledby="ad-sessions">
          <h2 id="ad-sessions">{t("admin.recentSessions")}</h2>
          <ul className="admin-scroll admin-list">
            {data.recentSessions.length === 0 && <li className="muted">{t("admin.none")}</li>}
            {data.recentSessions.map((s) => (
              <li key={s.id}>
                <span className="t"><b><bdi dir="ltr">{s.joinCode}</bdi></b><small>{s.type} · {t("admin.joined", { n: s.joined })} · {relativeDay(s.createdAt, t)}</small></span>
                <Pill tone={s.status === "ENDED" ? "neu" : "ready"} icon={false}>{s.status}</Pill>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
