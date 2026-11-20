import { translate } from "./messages";
import { DEFAULT_LOCALE, LOCALE_HEADER, isLocale, type Locale, type Problem } from "@helpo/shared";

let apiLocale: Locale | null = null;

/** Locale sent as x-helpo-locale on every API call. */
export function setApiLocale(locale: Locale): void {
  apiLocale = locale;
}

export function getApiLocale(): Locale {
  if (apiLocale) return apiLocale;
  if (typeof document !== "undefined" && isLocale(document.documentElement.lang)) return document.documentElement.lang;
  return DEFAULT_LOCALE;
}

/** Typed error thrown for every non-2xx response (RFC 9457 problem+json) and for network failures. */
export class ApiError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail?: string;
  readonly type: string;
  readonly fieldErrors: { path: string; message: string }[];
  /** Extra members of the problem body, such as existingLessonId on a duplicate upload. */
  readonly extra: Record<string, unknown>;

  constructor(problem: Partial<Problem> & { status: number; title: string }, extra: Record<string, unknown> = {}) {
    super(problem.detail || problem.title);
    this.name = "ApiError";
    this.status = problem.status;
    this.title = problem.title;
    this.detail = problem.detail;
    this.type = problem.type ?? "about:blank";
    this.fieldErrors = problem.errors ?? [];
    this.extra = extra;
  }

  get isUnauthorized() {
    return this.status === 401;
  }
  get isNotFound() {
    return this.status === 404;
  }
  get isNetwork() {
    return this.status === 0;
  }
}

export interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  form?: FormData;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
}

/** Plain-language message for any thrown value, safe to show to teachers and students. */
export function errorMessage(error: unknown): string {
  const t = (key: string) => translate(getApiLocale(), key);
  if (error instanceof ApiError) {
    if (error.isNetwork) return t("error.network");
    if (error.status >= 500) return t("error.server");
    if (error.detail) return error.detail;
    const known = [400, 401, 403, 404, 409, 413, 429];
    return known.includes(error.status) ? t(`error.${error.status}`) : error.title;
  }
  if (error instanceof Error) return error.message;
  return t("error.generic");
}

function withQuery(path: string, query?: ApiOptions["query"]): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function toProblem(res: Response): Promise<ApiError> {
  let body: Partial<Problem> | null = null;
  try {
    const text = await res.text();
    body = text ? (JSON.parse(text) as Partial<Problem>) : null;
  } catch {
    body = null;
  }
  return new ApiError(
    {
      type: body?.type,
      title: body?.title || res.statusText || "Request failed",
      status: body?.status ?? res.status,
      detail: body?.detail,
      errors: body?.errors,
    },
    (body as Record<string, unknown> | null) ?? {},
  );
}

/** Same-origin JSON fetch. `path` starts with "/" and is relative to /api. */
export async function api<T = void>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = options.body !== undefined || options.form ? "POST" : "GET", body, form, query, signal } = options;
  const headers: Record<string, string> = { Accept: "application/json, application/problem+json", [LOCALE_HEADER]: getApiLocale() };
  let payload: BodyInit | undefined;
  if (form) payload = form;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${withQuery(path, query)}`, { method, headers, body: payload, credentials: "same-origin", signal });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError({ status: 0, title: "Network error", detail: "We can't reach Nibras right now." });
  }
  if (!res.ok) throw await toProblem(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
