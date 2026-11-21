"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Illus } from "@/components/ui/illus";

function safeNext(value: string | null): string {
  return value && value.startsWith("/app") ? value : "/app";
}

const ERR_ID = "auth-error";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [school, setSchool] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<"names" | "credentials" | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setProblem(null);
    if (signup && (!name.trim() || !school.trim())) {
      setError(t("auth.error.names"));
      setProblem("names");
      return;
    }
    setBusy(true);
    try {
      if (signup) {
        const res = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password });
        if (res.error) {
          const exists = /exist|already|used/i.test(`${res.error.code ?? ""} ${res.error.message ?? ""}`);
          throw new Error(exists ? t("auth.error.exists") : t("auth.error.signup"));
        }
        await api("/me/school", { method: "PUT", body: { name: school.trim() } });
      } else {
        const res = await authClient.signIn.email({ email: email.trim(), password });
        // Always our own, translated sentence: the server's text is English-only and says too much about which part was wrong.
        if (res.error) throw new Error(t("auth.error.login"));
      }
      router.replace(safeNext(params.get("next")));
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
      setProblem("credentials");
      setBusy(false);
    }
  }

  return (
    <div className="authwrap">
      <form className="panel authcard" onSubmit={onSubmit} noValidate>
        <Illus name={signup ? "magic-book" : "star-buddy"} size={96} className="authart" />
        <h1>{signup ? t("auth.signup.title") : t("auth.login.title")}</h1>
        <p className="muted">{signup ? t("auth.signup.sub") : t("auth.login.sub")}</p>

        {signup && (
          <>
            <div className="field">
              <label htmlFor="name">{t("auth.name")}</label>
              <input id="name" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required aria-invalid={problem === "names" && !name.trim() ? true : undefined} aria-describedby={problem === "names" ? ERR_ID : undefined} />
            </div>
            <div className="field">
              <label htmlFor="school">{t("auth.school")}</label>
              <input id="school" name="school" autoComplete="organization" value={school} onChange={(e) => setSchool(e.target.value)} required aria-invalid={problem === "names" && !school.trim() ? true : undefined} aria-describedby={problem === "names" ? ERR_ID : undefined} />
            </div>
          </>
        )}
        <div className="field">
          <label htmlFor="email">{t("auth.email")}</label>
          <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required aria-invalid={problem === "credentials" ? true : undefined} aria-describedby={problem === "credentials" ? ERR_ID : undefined} />
        </div>
        <div className="field">
          <label htmlFor="password">{t("auth.password")}</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            minLength={8}
            aria-invalid={problem === "credentials" ? true : undefined}
            aria-describedby={[signup ? "password-hint" : null, problem === "credentials" ? ERR_ID : null].filter(Boolean).join(" ") || undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {signup && <span className="hint" id="password-hint">{t("auth.password.hint")}</span>}
        </div>

        <div aria-live="polite">{error && <p className="err" role="alert" id={ERR_ID}>{error}</p>}</div>

        <Button type="submit" size="big" disabled={busy || !email || password.length < 8} className="authbtn">
          {busy ? t("auth.busy") : signup ? t("auth.submit.signup") : t("auth.submit.login")}
          <ArrowRight className="flip" aria-hidden="true" />
        </Button>
        <p className="muted small authalt">
          {signup ? (
            <>
              {t("auth.alt.signup")} <Link href="/login">{t("auth.alt.signup.link")}</Link>
            </>
          ) : (
            <>
              {t("auth.alt.login")} <Link href="/signup">{t("auth.alt.login.link")}</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
