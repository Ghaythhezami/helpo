import { createHmac, timingSafeEqual } from "node:crypto";

export const STUDENT_COOKIE = "helpo_student";
export const STUDENT_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 14;

export interface StudentToken {
  studentId: string;
  classId: string;
  exp: number; // unix seconds
}

function secret(): string {
  const s = process.env.STUDENT_COOKIE_SECRET;
  if (!s || s.length < 16) throw new Error("STUDENT_COOKIE_SECRET must be set (16+ characters).");
  return s;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

/** `base64url(json).signature` */
export function signStudentToken(token: StudentToken): string {
  const payload = Buffer.from(JSON.stringify(token)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Returns the token when the signature is valid and not expired, otherwise null. */
export function verifyStudentToken(value: string | undefined, nowSeconds = Math.floor(Date.now() / 1000)): StudentToken | null {
  if (!value) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const t = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<StudentToken>;
    if (typeof t.studentId !== "string" || typeof t.classId !== "string" || typeof t.exp !== "number") return null;
    if (t.exp <= nowSeconds) return null;
    return { studentId: t.studentId, classId: t.classId, exp: t.exp };
  } catch {
    return null;
  }
}

export function studentCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STUDENT_COOKIE_TTL_SECONDS * 1000,
  };
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
