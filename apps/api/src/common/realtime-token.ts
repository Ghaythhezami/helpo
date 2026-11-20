import { createHmac, timingSafeEqual } from "node:crypto";

export const REALTIME_TOKEN_TTL_SECONDS = 300;

export interface RealtimeIdentity {
  kind: "teacher" | "student";
  id: string;
  /** Students: the class they belong to. */
  classId?: string;
  exp: number;
}

function secret(): string {
  const s = process.env.STUDENT_COOKIE_SECRET;
  if (!s || s.length < 16) throw new Error("STUDENT_COOKIE_SECRET must be set (16+ characters).");
  return `${s}:realtime`;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

/**
 * A short-lived (5 min) HMAC token for the socket handshake: a cross-site cookie does not reach the API from the
 * web domain, so the web app fetches this token through its same-origin /api rewrite and sends it as `auth.token`.
 */
export function signRealtimeToken(identity: Omit<RealtimeIdentity, "exp">, now = Math.floor(Date.now() / 1000)): string {
  const payload = Buffer.from(JSON.stringify({ ...identity, exp: now + REALTIME_TOKEN_TTL_SECONDS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyRealtimeToken(token: string | undefined, now = Math.floor(Date.now() / 1000)): RealtimeIdentity | null {
  if (!token) return null;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const a = Buffer.from(sign(payload));
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const t = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<RealtimeIdentity>;
    if ((t.kind !== "teacher" && t.kind !== "student") || typeof t.id !== "string" || typeof t.exp !== "number" || t.exp <= now) return null;
    return { kind: t.kind, id: t.id, classId: t.classId, exp: t.exp };
  } catch {
    return null;
  }
}
