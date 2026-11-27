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
  /** Seconds from the Retry-After header (429), when the server sends it. */
  retryAfter: number | null = null;

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

/** "pageRange" or "items.0.name" becomes "page range" / "name" for a sentence. */
function fieldName(path: string): string {
  const last = path.split(".").filter((p) => !/^\d+$/.test(p)).pop() ?? path;
  return last.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

/** Plain-language, actionable message for any thrown value, safe to show to teachers and students. */
export function errorMessage(error: unknown): string {
  const t = (key: string, vars?: Record<string, string | number>) => translate(getApiLocale(), key, vars);
  if (error instanceof ApiError) {
    if (error.isNetwork) return typeof navigator !== "undefined" && navigator.onLine === false ? t("error.offline") : t("error.network");
    if (error.status >= 500) return t("error.server");
    if (error.status === 400 && error.fieldErrors.length > 0) {
      const fields = [...new Set(error.fieldErrors.map((f) => fieldName(f.path)))].join(", ");
      return t("error.400.fields", { fields });
    }
    if (error.status === 429) return error.retryAfter ? t("error.429.after", { n: error.retryAfter }) : t("error.429");
    if (error.detail) return error.detail;
    const known = [400, 401, 403, 404, 409, 413, 422, 429];
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
  const header = res.headers?.get?.("Retry-After");
  const seconds = header && /^\d+$/.test(header) ? Number(header) : null;
  const error = new ApiError(
    {
      type: body?.type,
      title: body?.title || res.statusText || "Request failed",
      status: body?.status ?? res.status,
      detail: body?.detail,
      errors: body?.errors,
    },
    (body as Record<string, unknown> | null) ?? {},
  );
  error.retryAfter = seconds;
  return error;
}

/* ----------------------------- dev request counter ----------------------------- */

export interface RequestStats {
  total: number;
  byPath: Record<string, number>;
  log: { t: number; method: string; path: string }[];
  reset(): void;
}

declare global {
  interface Window {
    __nibrasRequests?: RequestStats;
  }
}

/** Counts every api() call when NEXT_PUBLIC_DEBUG_REQUESTS=1 (and always under jest). A single boolean when off. */
const COUNT_REQUESTS = process.env.NEXT_PUBLIC_DEBUG_REQUESTS === "1" || process.env.NODE_ENV === "test";
const stats: RequestStats = {
  total: 0,
  byPath: {},
  log: [],
  reset() {
    stats.total = 0;
    stats.byPath = {};
    stats.log = [];
  },
};

export const getRequestStats = (): RequestStats => stats;
export const resetRequestStats = (): void => stats.reset();

function countRequest(method: string, path: string) {
  if (typeof window !== "undefined") window.__nibrasRequests = stats;
  stats.total += 1;
  stats.byPath[path] = (stats.byPath[path] ?? 0) + 1;
  stats.log.push({ t: Date.now(), method, path });
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
  if (COUNT_REQUESTS) countRequest(method, path);
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
