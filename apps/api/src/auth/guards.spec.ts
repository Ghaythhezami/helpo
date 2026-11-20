import { signStudentToken } from "../common/student-cookie";
import { mockPrisma } from "../testing/mock-prisma";
import { StudentGuard } from "./student.guard";
import { TeacherGuard, toWebHeaders } from "./teacher.guard";

const ctxFor = (req: Record<string, unknown>) => ({ switchToHttp: () => ({ getRequest: () => req }) }) as never;

describe("TeacherGuard", () => {
  it("lets a Better Auth session through and exposes the teacher on the request", async () => {
    const auth = { api: { getSession: jest.fn().mockResolvedValue({ user: { id: "T1", name: "Alex", email: "a@x.test" } }) } };
    const req: Record<string, unknown> = { headers: { cookie: "better-auth.session_token=abc", "x-multi": ["a", "b"] } };
    expect(await new TeacherGuard(auth as never).canActivate(ctxFor(req))).toBe(true);
    expect(req.teacher).toEqual({ id: "T1", name: "Alex", email: "a@x.test" });
    const headers = auth.api.getSession.mock.calls[0][0].headers as Headers;
    expect(headers.get("cookie")).toBe("better-auth.session_token=abc");
  });

  it("no session is a 401", async () => {
    const auth = { api: { getSession: jest.fn().mockResolvedValue(null) } };
    await expect(new TeacherGuard(auth as never).canActivate(ctxFor({ headers: {} }))).rejects.toMatchObject({ status: 401 });
  });

  it("converts node headers (strings and arrays) to web headers", () => {
    const h = toWebHeaders({ a: "1", b: ["x", "y"], c: undefined });
    expect(h.get("a")).toBe("1");
    expect(h.get("b")).toBe("x, y");
    expect(h.has("c")).toBe(false);
  });
});

describe("StudentGuard", () => {
  beforeAll(() => {
    process.env.STUDENT_COOKIE_SECRET = "unit-test-secret-1234567890";
  });
  const cookie = (token: string) => ({ headers: { cookie: `helpo_student=${token}` } });
  const valid = () => signStudentToken({ studentId: "S1", classId: "C1", exp: Math.floor(Date.now() / 1000) + 60 });

  it("accepts a signed cookie for a student who still exists in that class", async () => {
    const db = mockPrisma();
    db.student.findFirst.mockResolvedValue({ id: "S1", classId: "C1" });
    const req: Record<string, unknown> = cookie(valid());
    expect(await new StudentGuard(db).canActivate(ctxFor(req))).toBe(true);
    expect(req.student).toEqual({ id: "S1", classId: "C1" });
    expect(db.student.findFirst).toHaveBeenCalledWith({ where: { id: "S1", classId: "C1" }, select: { id: true, classId: true } });
  });

  it("rejects a missing, forged or expired cookie, and a student that was removed", async () => {
    const db = mockPrisma();
    const guard = new StudentGuard(db);
    await expect(guard.canActivate(ctxFor({ headers: {} }))).rejects.toMatchObject({ status: 401 });
    await expect(guard.canActivate(ctxFor(cookie("forged.value")))).rejects.toMatchObject({ status: 401 });
    const expired = signStudentToken({ studentId: "S1", classId: "C1", exp: Math.floor(Date.now() / 1000) - 5 });
    await expect(guard.canActivate(ctxFor(cookie(expired)))).rejects.toMatchObject({ status: 401 });
    db.student.findFirst.mockResolvedValue(null);
    await expect(guard.canActivate(ctxFor(cookie(valid())))).rejects.toMatchObject({ status: 401 });
  });
});
