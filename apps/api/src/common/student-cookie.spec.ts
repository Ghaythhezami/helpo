import { parseCookies, signStudentToken, studentCookieOptions, verifyStudentToken } from "./student-cookie";

describe("student cookie", () => {
  const OLD = process.env.STUDENT_COOKIE_SECRET;
  beforeAll(() => {
    process.env.STUDENT_COOKIE_SECRET = "unit-test-secret-1234567890";
  });
  afterAll(() => {
    process.env.STUDENT_COOKIE_SECRET = OLD;
  });

  const now = 1_800_000_000;
  const token = { studentId: "s1", classId: "c1", exp: now + 100 };

  it("round-trips a signed token", () => {
    expect(verifyStudentToken(signStudentToken(token), now)).toEqual(token);
  });

  it("rejects a tampered payload", () => {
    const [payload, sig] = signStudentToken(token).split(".");
    const forged = Buffer.from(JSON.stringify({ ...token, studentId: "someone-else" })).toString("base64url");
    expect(verifyStudentToken(`${forged}.${sig}`, now)).toBeNull();
    expect(verifyStudentToken(`${payload}.${sig}x`, now)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    const signed = signStudentToken(token);
    process.env.STUDENT_COOKIE_SECRET = "a-completely-different-secret";
    expect(verifyStudentToken(signed, now)).toBeNull();
    process.env.STUDENT_COOKIE_SECRET = "unit-test-secret-1234567890";
  });

  it("rejects expired, empty and malformed values", () => {
    expect(verifyStudentToken(signStudentToken({ ...token, exp: now - 1 }), now)).toBeNull();
    expect(verifyStudentToken(undefined, now)).toBeNull();
    expect(verifyStudentToken("garbage", now)).toBeNull();
    expect(verifyStudentToken("a.b.c", now)).toBeNull();
  });

  it("rejects a validly signed payload with the wrong shape", () => {
    const payload = Buffer.from(JSON.stringify({ hello: "world" })).toString("base64url");
    const { createHmac } = jest.requireActual<typeof import("node:crypto")>("node:crypto");
    const sig = createHmac("sha256", process.env.STUDENT_COOKIE_SECRET as string).update(payload).digest("base64url");
    expect(verifyStudentToken(`${payload}.${sig}`, now)).toBeNull();
  });

  it("needs a configured secret", () => {
    const keep = process.env.STUDENT_COOKIE_SECRET;
    delete process.env.STUDENT_COOKIE_SECRET;
    expect(() => signStudentToken(token)).toThrow();
    process.env.STUDENT_COOKIE_SECRET = keep;
  });

  it("is httpOnly, SameSite=Lax and Secure only in production", () => {
    expect(studentCookieOptions()).toMatchObject({ httpOnly: true, sameSite: "lax", secure: false });
    const env = process.env as Record<string, string | undefined>;
    const prev = env.NODE_ENV;
    env.NODE_ENV = "production";
    expect(studentCookieOptions().secure).toBe(true);
    env.NODE_ENV = prev;
  });

  it("parses a cookie header", () => {
    expect(parseCookies("a=1; helpo_student=x%20y; bad")).toEqual({ a: "1", helpo_student: "x y" });
    expect(parseCookies(undefined)).toEqual({});
  });
});
