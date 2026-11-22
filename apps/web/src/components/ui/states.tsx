"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { ApiError, errorMessage } from "@/lib/api";
import { Button } from "./button";
import { Illus } from "./illus";
import { Skeleton } from "./motion";
import { useI18n } from "@/lib/i18n";

export function LoadingState({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="panel loading-state" role="status" aria-live="polite" aria-busy="true">
      <Skeleton block={{ h: 28, w: "46%", r: 10 }} lines={3} />
      <Skeleton block={{ h: 120, r: 18 }} />
      <span className="sr">{label ?? t("common.loading")}…</span>
    </div>
  );
}

export function EmptyState({ art = "sprout-sun", title, children, action }: { art?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Illus name={art} size={56} />
      <b>{title}</b>
      {children ? <p className="muted">{children}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, signInHref = "/login", signInLabel }: { error: unknown; onRetry?: () => void; signInHref?: string; signInLabel?: string }) {
  const { t } = useI18n();
  const unauthorized = error instanceof ApiError && error.isUnauthorized;
  return (
    <div className="panel error-state" role="alert">
      <div className="callout">
        <b>{unauthorized ? t("error.401") : t("state.error.title")}</b>
        <p>{unauthorized ? t("state.signin.text") : errorMessage(error)}</p>
        <div className="acts" style={{ marginTop: 12 }}>
          {unauthorized ? (
            <Link className="btn sm" href={signInHref}>
              {signInLabel ?? t("auth.submit.login")}
            </Link>
          ) : onRetry ? (
            <Button size="sm" onClick={onRetry}>
              {t("common.tryAgain")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Loading, error and data in one place so every data view has all three states. */
export function Async<T>({
  query,
  label,
  children,
  signInHref,
  signInLabel,
}: {
  query: { data: T | undefined; error: unknown; isPending: boolean; isError: boolean; refetch: () => unknown };
  label: string;
  children: (data: T) => ReactNode;
  signInHref?: string;
  signInLabel?: string;
}) {
  if (query.isPending) return <LoadingState label={label} />;
  if (query.isError || query.data === undefined) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} signInHref={signInHref} signInLabel={signInLabel} />;
  }
  return <>{children(query.data)}</>;
}
