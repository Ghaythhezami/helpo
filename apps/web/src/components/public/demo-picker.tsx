"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { DemoAccount, DemoAccountKey, DemoLoginResult } from "@helpo/shared";
import { GraduationCap, Loader2, ShieldCheck, Smile } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const ICONS: Record<DemoAccountKey, typeof GraduationCap> = { teacher: GraduationCap, student: Smile, admin: ShieldCheck };

/** Demo accounts for testers: one click signs in, no typing. Renders nothing when the API says demo login is off (404). */
export function DemoPicker() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState<DemoAccountKey | null>(null);
  const accounts = useQuery({ queryKey: ["demo", "accounts"], queryFn: () => api<DemoAccount[]>("/demo/accounts"), retry: false, staleTime: Infinity, refetchOnWindowFocus: false });

  const login = useMutation({
    mutationFn: (account: DemoAccountKey) => api<DemoLoginResult>("/demo/login", { method: "POST", body: { account } }),
    onMutate: (account) => setBusy(account),
    onSuccess: (res) => {
      router.replace(res.next);
      router.refresh();
    },
    onSettled: (_d, error) => {
      if (error) setBusy(null);
    },
  });

  if (!accounts.data || accounts.data.length === 0) return null;
  const emails = accounts.data.filter((a) => a.email);

  return (
    <section className="demo" aria-labelledby="demo-h">
      <h2 id="demo-h">{t("demo.title")}</h2>
      <ul className="demo-cards">
        {accounts.data.map((a) => {
          const Icon = ICONS[a.key];
          const label = locale === "ar" ? a.labelAr : a.label;
          const text = locale === "ar" ? a.descriptionAr : a.description;
          const loading = busy === a.key;
          return (
            <li key={a.key}>
              <button type="button" className={`demo-card ${a.key}`} aria-busy={loading} aria-disabled={busy !== null ? true : undefined} onClick={() => busy === null && login.mutate(a.key)}>
                <span className="demo-ic">{loading ? <Loader2 className="ic spin" aria-hidden="true" /> : <Icon className="ic" aria-hidden="true" />}</span>
                <b>{label}</b>
                <span className="demo-text">{text}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {login.isError && <p className="err" role="alert">{t("demo.error")} {errorMessage(login.error)}</p>}
      <p className="demo-hint muted small">
        {t("demo.hint")} <bdi dir="ltr"><code>{t("demo.password")}</code></bdi>
        {emails.length > 0 && (
          <>
            {" · "}
            {emails.map((a, i) => (
              <span key={a.key}>
                {i > 0 ? ", " : ""}
                <bdi dir="ltr">{a.email}</bdi>
              </span>
            ))}
          </>
        )}
      </p>
    </section>
  );
}
