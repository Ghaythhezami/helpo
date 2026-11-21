"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { DemoPicker } from "./demo-picker";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Illus } from "@/components/ui/illus";

function safeNext(value: string | null): string {
  return value && value.startsWith("/app") ? value : "/app";
}

const ERR_ID = "auth-error";
type Field = "name" | "school" | "email" | "password";

/** Light client-side email check in linear time (no backtracking regex); the server validates for real. */
export function looksLikeEmail(raw: string): boolean {
  const email = raw.trim();
  if (!email || /\s/.test(email)) return false;
  const at = email.indexOf("@");
  if (at < 1 || at !== email.lastIndexOf("@")) return false;
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  return dot > 0 && dot < domain.length - 1;
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [values, setValues] = useState<Record<Field, string>>({ name: "", school: "", email: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState(false);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const signup = mode === "signup";
  const set = (field: Field) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [field]: e.target.value }));

  /** Inline validation on submit: the button is never silently disabled. */
  function validate(): Partial<Record<Field, string>> {
    const out: Partial<Record<Field, string>> = {};
    if (signup && !values.name.trim()) out.name = t("auth.err.name");
    if (signup && !values.school.trim()) out.school = t("auth.err.school");
    if (!looksLikeEmail(values.email)) out.email = t("auth.err.email");
    if (values.password.length < 8) out.password = t("auth.err.password");
    return out;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setCredentials(false);
    const problems = validate();
    setFieldErrors(problems);
    const first = (["name", "school", "email", "password"] as Field[]).find((f) => problems[f]);
    if (first) {
      setError(t("auth.error.fix"));
      form.current?.querySelector<HTMLElement>(`#${first}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      if (signup) {
        const res = await authClient.signUp.email({ name: values.name.trim(), email: values.email.trim(), password: values.password });
        if (res.error) {
          const exists = /exist|already|used/i.test(`${res.error.code ?? ""} ${res.error.message ?? ""}`);
          throw new Error(exists ? t("auth.error.exists") : t("auth.error.signup"));
        }
        await api("/me/school", { method: "PUT", body: { name: values.school.trim() } });
      } else {
        const res = await authClient.signIn.email({ email: values.email.trim(), password: values.password });
        // Always our own, translated sentence: the server's text is English-only and says too much about which part was wrong.
        if (res.error) throw new Error(t("auth.error.login"));
      }
      router.replace(safeNext(params.get("next")));
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
      setCredentials(true);
      setBusy(false);
    }
  }

  const describe = (field: Field, extra?: string) => [fieldErrors[field] ? `${field}-err` : null, credentials && (field === "email" || field === "password") ? ERR_ID : null, extra ?? null].filter(Boolean).join(" ") || undefined;
  const label = (field: Field, text: string) => (
    <label htmlFor={field}>
      {text} <span className="req">{t("auth.required")}</span>
    </label>
  );
  const fieldError = (field: Field) => (fieldErrors[field] ? <span className="field-err" id={`${field}-err`}>{fieldErrors[field]}</span> : null);

  return (
    <div className="authwrap">
      {mode === "login" && <DemoPicker />}
      <form ref={form} className="panel authcard" onSubmit={onSubmit} noValidate>
        <Illus name={signup ? "magic-book" : "star-buddy"} size={96} className="authart" />
        <h1>{signup ? t("auth.signup.title") : t("auth.login.title")}</h1>
        <p className="muted">{signup ? t("auth.signup.sub") : t("auth.login.sub")}</p>

        {signup && (
          <>
            <div className="field">
              {label("name", t("auth.name"))}
              <input id="name" name="name" autoComplete="name" value={values.name} onChange={set("name")} required aria-required="true" aria-invalid={fieldErrors.name ? true : undefined} aria-describedby={describe("name")} />
              {fieldError("name")}
            </div>
            <div className="field">
              {label("school", t("auth.school"))}
              <input id="school" name="school" autoComplete="organization" value={values.school} onChange={set("school")} required aria-required="true" aria-invalid={fieldErrors.school ? true : undefined} aria-describedby={describe("school")} />
              {fieldError("school")}
            </div>
          </>
        )}
        <div className="field">
          {label("email", t("auth.email"))}
          <input id="email" name="email" type="email" inputMode="email" autoComplete={signup ? "email" : "username"} value={values.email} onChange={set("email")} required aria-required="true" aria-invalid={fieldErrors.email || credentials ? true : undefined} aria-describedby={describe("email")} />
          {fieldError("email")}
        </div>
        <div className="field">
          {label("password", t("auth.password"))}
          <div className="pw-wrap">
            <input
              id="password"
              name="password"
              type={show ? "text" : "password"}
              autoComplete={signup ? "new-password" : "current-password"}
              minLength={8}
              required
              aria-required="true"
              aria-invalid={fieldErrors.password || credentials ? true : undefined}
              aria-describedby={describe("password", signup ? "password-hint" : undefined)}
              value={values.password}
              onChange={set("password")}
            />
            <button type="button" className="pw-toggle" aria-pressed={show} aria-label={show ? t("auth.hide") : t("auth.show")} onClick={() => setShow((v) => !v)}>
              {show ? <EyeOff className="ic" aria-hidden="true" /> : <Eye className="ic" aria-hidden="true" />}
            </button>
          </div>
          {fieldError("password")}
          {signup && <span className="hint" id="password-hint">{t("auth.password.hint")}</span>}
        </div>

        <div aria-live="polite">{error && <p className="err" role="alert" id={ERR_ID}>{error}</p>}</div>

        <Button type="submit" size="big" disabled={busy} className="authbtn">
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
