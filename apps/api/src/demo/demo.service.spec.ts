import { mockPrisma } from "../testing/mock-prisma";
import { DemoService, DEMO_ADMIN_EMAIL, DEMO_ASSIGNMENT_CODE, DEMO_TEACHER_EMAIL } from "./demo.service";

function setup(env: Record<string, string | undefined> = { DEMO_LOGIN: "true", DEMO_PASSWORD: "pw-from-env-only" }) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const db = mockPrisma();
  const cookies = ["better-auth.session_token=abc; Path=/; HttpOnly", "better-auth.session_data=def; Path=/"];
  const auth = { api: { signInEmail: jest.fn().mockResolvedValue({ ok: true, headers: { getSetCookie: () => cookies } }) } };
  const join = { join: jest.fn().mockResolvedValue({ studentId: "S9", classId: "C1", result: {} }) };
  db.activitySession.findFirst.mockResolvedValue({ id: "ASSIGN1" });
  db.student.findFirst.mockResolvedValue({ id: "S9" });
  return { db, auth, join, cookies, service: new DemoService(db, auth as never, join as never) };
}

afterEach(() => {
  delete process.env.DEMO_LOGIN;
  delete process.env.DEMO_PASSWORD;
});

describe("DemoService (off by default)", () => {
  it("every route answers 404 unless DEMO_LOGIN=true", async () => {
    const { service, auth } = setup({ DEMO_LOGIN: undefined });
    await expect(service.accounts()).rejects.toMatchObject({ status: 404 });
    await expect(service.login("teacher")).rejects.toMatchObject({ status: 404 });
    expect(() => service.assertEnabled({ DEMO_LOGIN: "false" } as unknown as NodeJS.ProcessEnv)).toThrow();
    expect(() => service.assertEnabled({ DEMO_LOGIN: "true" } as unknown as NodeJS.ProcessEnv)).not.toThrow();
    expect(auth.api.signInEmail).not.toHaveBeenCalled();
  });
});

describe("DemoService.accounts", () => {
  it("lists teacher, student and admin with EN/AR labels, emails (none for the student) and where to go next", async () => {
    const { service, db } = setup();
    const list = await service.accounts();
    expect(list.map((a) => a.key)).toEqual(["teacher", "student", "admin"]);
    expect(list.map((a) => a.email)).toEqual([DEMO_TEACHER_EMAIL, null, DEMO_ADMIN_EMAIL]);
    expect(list.map((a) => a.next)).toEqual(["/app", "/play", "/admin"]);
    for (const a of list) {
      expect([a.label, a.labelAr, a.description, a.descriptionAr].every((t) => t.length > 3)).toBe(true);
      expect(a.labelAr).toMatch(/[؀-ۿ]/);
    }
    expect(db.activitySession.findFirst).not.toHaveBeenCalled(); // the practice hub needs no assignment lookup
  });

  it("the student always lands on the practice hub, even without the seeded assignment", async () => {
    const { service, db } = setup();
    db.activitySession.findFirst.mockResolvedValue(null);
    expect((await service.accounts())[1].next).toBe("/play");
  });
});

describe("DemoService.login", () => {
  it("teacher and admin: signs in server-side with DEMO_PASSWORD and forwards the Set-Cookie headers", async () => {
    const { service, auth, cookies } = setup();
    const t = await service.login("teacher");
    expect(auth.api.signInEmail).toHaveBeenCalledWith({ body: { email: DEMO_TEACHER_EMAIL, password: "pw-from-env-only" }, asResponse: true });
    expect(t).toEqual({ result: { account: "teacher", next: "/app" }, setCookies: cookies, student: null });
    const a = await service.login("admin");
    expect(auth.api.signInEmail.mock.calls[1][0].body.email).toBe(DEMO_ADMIN_EMAIL);
    expect(a.result).toEqual({ account: "admin", next: "/admin" });
  });

  it("the password is never hardcoded: without DEMO_PASSWORD a password login is a 503 and nothing is sent", async () => {
    const { service, auth } = setup({ DEMO_LOGIN: "true", DEMO_PASSWORD: undefined });
    await expect(service.login("teacher")).rejects.toMatchObject({ status: 503, detail: expect.stringContaining("DEMO_PASSWORD") });
    expect(auth.api.signInEmail).not.toHaveBeenCalled();
    expect(JSON.stringify(Object.values(jest.requireActual("./demo.service")))).not.toMatch(/Nibras2020/);
  });

  it("a failed sign-in (account not seeded) is a 401, not a crash", async () => {
    const { service, auth } = setup();
    auth.api.signInEmail.mockResolvedValue({ ok: false, headers: { getSetCookie: () => [] } });
    await expect(service.login("teacher")).rejects.toMatchObject({ status: 401 });
  });

  it("student: joins Layla A. to the demo assignment through the join service and asks for the signed cookie", async () => {
    const { service, db, join, auth } = setup();
    const out = await service.login("student");
    expect(db.student.findFirst.mock.calls[0][0].where).toEqual({ displayName: "Layla A.", classRoom: { name: "6B", teacher: { email: DEMO_TEACHER_EMAIL } } });
    expect(join.join).toHaveBeenCalledWith({ code: DEMO_ASSIGNMENT_CODE, studentId: "S9" });
    expect(out).toEqual({ result: { account: "student", next: "/play" }, setCookies: [], student: { studentId: "S9", classId: "C1" } });
    expect(auth.api.signInEmail).not.toHaveBeenCalled(); // students have no password
  });

  it("student login without seed data is a 503 that says to run the seed", async () => {
    const { service, db } = setup();
    db.student.findFirst.mockResolvedValue(null);
    await expect(service.login("student")).rejects.toMatchObject({ status: 503, detail: expect.stringContaining("seed") });
  });

  it("logs the account only, never an IP", async () => {
    const { service } = setup();
    const log = jest.spyOn(service["logger"], "log").mockImplementation(() => undefined);
    await service.login("admin");
    expect(log).toHaveBeenCalledWith("Demo login: admin");
  });
});
