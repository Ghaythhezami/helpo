import request from "supertest";

const base = () => process.env.E2E_BASE_URL as string;
const ORIGIN = () => base();

interface Teacher {
  cookie: string;
}

async function signUp(name: string): Promise<Teacher> {
  const res = await request(base())
    .post("/api/auth/sign-up/email")
    .set("Origin", ORIGIN())
    .send({ name, email: `${name.toLowerCase().replace(/\s/g, ".")}.${Date.now()}@e2e.test`, password: "Passw0rd!e2e-test" });
  expect(res.status).toBe(200);
  const cookies = (res.headers["set-cookie"] as unknown as string[]).map((c) => c.split(";")[0]);
  return { cookie: cookies.join("; ") };
}

const as = (t: Teacher, locale = "en") => ({ Cookie: t.cookie, "x-helpo-locale": locale, Origin: ORIGIN() });

async function pollLesson(t: Teacher, id: string, until: (l: { status: string }) => boolean, ms = 40_000) {
  const end = Date.now() + ms;
  let last: { status: string; [k: string]: unknown } = { status: "" };
  while (Date.now() < end) {
    last = (await request(base()).get(`/api/lessons/${id}`).set(as(t))).body;
    if (until(last)) return last;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timed out waiting for the lesson, last status ${last.status}`);
}

describe("Nibras API (demo mode, real DB)", () => {
  let a: Teacher;
  let b: Teacher;
  let classId: string;
  let lessonId: string;

  beforeAll(async () => {
    a = await signUp("Teacher A");
    b = await signUp("Teacher B");
  });

  it("health, and 401 problem+json without a session", async () => {
    expect((await request(base()).get("/api/health")).body).toEqual({ status: "ok", db: "ok" });
    const res = await request(base()).get("/api/dashboard");
    expect(res.status).toBe(401);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body).toMatchObject({ status: 401, title: "Unauthorized" });
  });

  it("creates a class (band derived from grade) and shows it only to its teacher", async () => {
    const res = await request(base()).post("/api/classes").set(as(a)).send({ name: "6B", grade: 6 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "6B", grade: 6, band: "NAVIGATOR", studentCount: 0 });
    classId = res.body.id;
    expect((await request(base()).post("/api/classes").set(as(a)).send({ name: "6B", grade: 6 })).status).toBe(409);
    expect((await request(base()).get("/api/classes").set(as(b))).body).toEqual([]);
    expect((await request(base()).post("/api/classes").set(as(a)).send({ name: "", grade: 40 })).body.errors).toBeDefined();
  });

  it("refines a rough prompt without creating a lesson", async () => {
    const res = await request(base()).post("/api/lessons/refine-prompt").set(as(a)).send({ prompt: "photosynthesis for kids please", classId });
    expect(res.status).toBe(200);
    expect(res.body.prompt).toContain("Grade 6");
    expect(res.body.suggestions.length).toBeGreaterThanOrEqual(2);
    expect((await request(base()).get("/api/lessons").set(as(a))).body).toEqual([]);
  });

  it("one call from a prompt: analysis, then auto-generation to READY with checks and versions", async () => {
    const res = await request(base()).post("/api/lessons").set(as(a)).send({ classId, title: "Photosynthesis: how plants make food", prompt: "Teach photosynthesis to grade 6 students with a quiz." });
    expect(res.status).toBe(201);
    lessonId = res.body.lessonId;
    const ready = (await pollLesson(a, lessonId, (l) => l.status === "READY" || l.status === "FAILED" || l.status === "PARTIAL")) as Record<string, any>;
    expect(ready.status).toBe("READY");
    expect(ready.aiWritten).toBe(true);
    expect(ready.blueprint).toMatchObject({ gradeLevel: "Grade 6", language: "en" });
    expect(ready.resources.map((r: { status: string }) => r.status)).toEqual(Array(5).fill("READY"));
    expect(ready.resources[0]).toMatchObject({ version: 1, progress: 100, model: "demo" });
    expect(ready.checks).toHaveLength(3);
    expect(ready.quota).toMatchObject({ used: 1, limit: 100 });
    expect(ready.approvedAt).toBeNull();
  });

  it("teacher B gets 404 on teacher A's class, lesson, resources, sessions and results", async () => {
    const lesson = (await request(base()).get(`/api/lessons/${lessonId}`).set(as(a))).body;
    const quiz = lesson.resources.find((r: { kind: string }) => r.kind === "QUIZ");
    const check = lesson.checks[0];
    const probes = [
      request(base()).get(`/api/classes/${classId}`).set(as(b)),
      request(base()).get(`/api/lessons/${lessonId}`).set(as(b)),
      request(base()).delete(`/api/lessons/${lessonId}`).set(as(b)),
      request(base()).post(`/api/lessons/${lessonId}/generate`).set(as(b)).send({}),
      request(base()).post(`/api/lessons/${lessonId}/approve`).set(as(b)).send({}),
      request(base()).post(`/api/lessons/${lessonId}/translate`).set(as(b)).send({ to: "ar" }),
      request(base()).get(`/api/lessons/${lessonId}/results`).set(as(b)),
      request(base()).patch(`/api/resources/${quiz.id}`).set(as(b)).send({ content: {} }),
      request(base()).post(`/api/resources/${quiz.id}/share`).set(as(b)).send({ mode: "LIVE_QUIZ", approveAnyway: true }),
      request(base()).get(`/api/resources/${quiz.id}/export?format=docx`).set(as(b)),
      request(base()).patch(`/api/checks/${check.id}`).set(as(b)).send({ status: "DISMISSED" }),
      request(base()).post("/api/lessons").set(as(b)).send({ classId, prompt: "Teach photosynthesis to grade 6." }),
    ];
    for (const res of await Promise.all(probes)) expect(res.status).toBe(404);
    expect((await request(base()).get("/api/lessons").set(as(b))).body).toEqual([]);
  });

  it("sharing needs the approval: open checks give 409 checks-open, approveAnyway shares and returns link + QR", async () => {
    const lesson = (await request(base()).get(`/api/lessons/${lessonId}`).set(as(a))).body;
    const quiz = lesson.resources.find((r: { kind: string }) => r.kind === "QUIZ");
    const blocked = await request(base()).post(`/api/resources/${quiz.id}/share`).set(as(a)).send({ mode: "LIVE_QUIZ" });
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ type: "https://nibras.app/problems/checks-open", openChecks: 3 });
    const noSession = await request(base()).post("/api/sessions").set(as(a)).send({ lessonId, type: "LIVE_QUIZ" });
    expect(noSession.status).toBe(409);

    for (const c of lesson.checks) expect((await request(base()).patch(`/api/checks/${c.id}`).set(as(a)).send({ status: "DISMISSED" })).status).toBe(200);
    const shared = await request(base()).post(`/api/resources/${quiz.id}/share`).set(as(a)).send({ mode: "LIVE_QUIZ", leaderboard: "INDIVIDUAL" });
    expect(shared.status).toBe(201);
    expect(shared.body.joinCode).toMatch(/^\d{6}$/);
    expect(shared.body.link).toContain(`/join?code=${shared.body.joinCode}`);
    expect(shared.body.qrSvg).toMatch(/^<svg/);
    expect(shared.body).toMatchObject({ status: "LOBBY", isOpen: true, leaderboard: "INDIVIDUAL", questionCount: 10 });
    expect((await request(base()).get(`/api/lessons/${lessonId}`).set(as(a))).body.approvedAt).not.toBeNull();
  });

  it("runs a live quiz end to end: students join, answers are graded on the server, results are teacher-only", async () => {
    const students = (await request(base()).post(`/api/classes/${classId}/students`).set(as(a)).send({ names: ["Sara Ahmed", "Omar Kacem", "Lina Mansour"] })).body;
    expect(students.map((s: { displayName: string }) => s.displayName)).toEqual(["Sara A.", "Omar K.", "Lina M."]);
    const lesson = (await request(base()).get(`/api/lessons/${lessonId}`).set(as(a))).body;
    const quiz = lesson.resources.find((r: { kind: string }) => r.kind === "QUIZ");
    const session = (await request(base()).post(`/api/resources/${quiz.id}/share`).set(as(a)).send({ mode: "LIVE_QUIZ" })).body;

    const picker = await request(base()).get(`/api/join/classes/${classId}/students`);
    expect(picker.body.map((s: { displayName: string }) => s.displayName).sort()).toEqual(["Lina M.", "Omar K.", "Sara A."]);
    expect(JSON.stringify(picker.body)).not.toContain("Ahmed");
    expect((await request(base()).get(`/api/join/code/${session.joinCode}`)).body).toMatchObject({ classId, live: { sessionId: session.id, joinCode: session.joinCode } });

    const joined = await request(base()).post("/api/join").send({ code: session.joinCode, studentId: students[0].id });
    expect(joined.status).toBe(200);
    expect(joined.body).toMatchObject({ sessionId: session.id, next: "quiz", displayName: "Sara A." });
    const cookie = (joined.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("helpo_student="));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const student = { Cookie: (cookie as string).split(";")[0], "x-helpo-locale": "en" };
    expect((await request(base()).get("/api/play/me")).status).toBe(401);
    expect((await request(base()).get("/api/play/me").set({ Cookie: "helpo_student=forged.cookie" })).status).toBe(401);

    expect((await request(base()).post(`/api/sessions/${session.id}/action`).set(as(a)).send({ action: "start" })).body.status).toBe("LIVE");
    const state = await request(base()).get(`/api/play/sessions/${session.id}`).set(student);
    expect(state.body.question.prompt).toBeTruthy();
    expect(JSON.stringify(state.body)).not.toMatch(/"correct"|explanation/);
    expect(state.body.revealed).toBeNull();

    const answered = await request(base()).post(`/api/play/sessions/${session.id}/answers`).set(student).send({ questionIndex: 0, optionIndex: 0 });
    expect(answered.status).toBe(201);
    expect(answered.body.myAnswer).toMatchObject({ optionIndex: 0 });
    expect(answered.body.revealed).toBeNull(); // never before reveal
    const again = await request(base()).post(`/api/play/sessions/${session.id}/answers`).set(student).send({ questionIndex: 0, optionIndex: 0 });
    expect(again.status).toBe(201);
    expect((await request(base()).get("/api/play/me").set(student)).body.xp).toBeLessThanOrEqual(10);

    const live = (await request(base()).get(`/api/sessions/${session.id}`).set(as(a))).body;
    expect(live).toMatchObject({ joined: 1, answeredCurrent: 1, distribution: null });
    const revealed = (await request(base()).post(`/api/sessions/${session.id}/action`).set(as(a)).send({ action: "reveal" })).body;
    expect(revealed.distribution).toHaveLength(4);
    const after = await request(base()).get(`/api/play/sessions/${session.id}`).set(student);
    expect(after.body.revealed).toMatchObject({ explanation: expect.any(String) });
    expect((await request(base()).post(`/api/play/sessions/${session.id}/answers`).set(student).send({ questionIndex: 0, optionIndex: 1 })).status).toBe(409);

    await request(base()).post(`/api/sessions/${session.id}/action`).set(as(a)).send({ action: "end" });
    const results = await request(base()).get(`/api/lessons/${lessonId}/results`).set(as(a));
    expect(results.status).toBe(200);
    expect(results.body).toMatchObject({ answered: 1, classSize: 3, sessionId: session.id });
    expect(results.body.notSubmitted).toHaveLength(2);
    expect(results.body.ranking).toHaveLength(1);
    expect(typeof results.body.averageTimeSec).toBe("number"); // join to last answer, only over students who answered
    expect(results.body.sessions.find((s: { id: string }) => s.id === session.id)).toMatchObject({ type: "LIVE_QUIZ", answered: 1 });
    expect((await request(base()).get(`/api/lessons/${lessonId}/results`).set(student)).status).toBe(401);
  });

  it("share by code: a student types a name and is matched or created by first name + initial", async () => {
    const lesson = (await request(base()).get(`/api/lessons/${lessonId}`).set(as(a))).body;
    const quiz = lesson.resources.find((r: { kind: string }) => r.kind === "QUIZ");
    const session = (await request(base()).post(`/api/resources/${quiz.id}/share`).set(as(a)).send({ mode: "ASSIGNMENT" })).body;
    expect((await request(base()).get(`/api/play/code/${session.joinCode}`)).body.classId).toBe(classId);
    const joined = await request(base()).post(`/api/play/code/${session.joinCode}/join`).send({ name: "Noah Brown" });
    expect(joined.status).toBe(200);
    expect(joined.body.displayName).toBe("Noah B.");
    const cookie = ((joined.headers["set-cookie"] as unknown as string[])[0] as string).split(";")[0];
    const student = { Cookie: cookie, "x-helpo-locale": "en" };
    const qs = await request(base()).get(`/api/play/sessions/${session.id}/questions`).set(student);
    expect(qs.body.questions).toHaveLength(10);
    expect(qs.body.joinCode).toBe(session.joinCode);
    expect(JSON.stringify(qs.body)).not.toMatch(/"correct"|acceptedAnswers|explanation/);
    const submit = await request(base()).post(`/api/play/${session.joinCode}/submit`).set(student).send({ answers: [{ questionId: "Q1", optionIndex: 0 }], durationSec: 42 });
    expect(submit.status).toBe(200);
    expect(submit.body).toMatchObject({ total: 10, durationSec: 42, alreadySubmitted: false });
    expect((await request(base()).post(`/api/play/${session.joinCode}/submit`).set(student).send({ answers: [], durationSec: 1 })).body.alreadySubmitted).toBe(true);
    expect((await request(base()).post(`/api/play/sessions/${session.id}/submit`).set(student).send({ answers: [], durationSec: 1 })).body.alreadySubmitted).toBe(true);
    // the default results session is the newest one WITH answers (this assignment), not just the newest
    const results = (await request(base()).get(`/api/lessons/${lessonId}/results`).set(as(a))).body;
    expect(results.sessions.length).toBeGreaterThanOrEqual(3);
    expect(results.sessions.find((s: { id: string }) => s.id === results.sessionId).answered).toBeGreaterThan(0);
    const again = await request(base()).post(`/api/play/code/${session.joinCode}/join`).send({ name: "noah brown" });
    expect(again.body.participantId).toBe(joined.body.participantId);
    await request(base()).post(`/api/sessions/${session.id}/action`).set(as(a)).send({ action: "close" });
    expect((await request(base()).post(`/api/play/${session.joinCode}/submit`).set(student).send({ answers: [], durationSec: 1 })).status).toBe(409);
  });

  it("edits create versions and revert restores the AI original as a new version", async () => {
    const lesson = (await request(base()).get(`/api/lessons/${lessonId}`).set(as(a))).body;
    const cards = lesson.resources.find((r: { kind: string }) => r.kind === "CARDS");
    const edited = structuredClone(cards.content);
    edited.cards[0].front = "My edited card";
    const patched = await request(base()).patch(`/api/resources/${cards.id}`).set(as(a)).send({ content: edited });
    expect(patched.body).toMatchObject({ version: 2 });
    expect(patched.body.content.cards[0].front).toBe("My edited card");
    expect((await request(base()).patch(`/api/resources/${cards.id}`).set(as(a)).send({ content: { cards: [{}] } })).status).toBe(400);
    const reverted = await request(base()).post(`/api/resources/${cards.id}/revert`).set(as(a)).send({ version: 1 });
    expect(reverted.body.version).toBe(3);
    expect(reverted.body.content.cards[0].front).toBe(cards.content.cards[0].front);
  });

  it("Arabic: the same lesson read with x-helpo-locale ar falls back, then translates dynamically", async () => {
    const before = (await request(base()).get(`/api/lessons/${lessonId}`).set(as(a, "ar"))).body;
    expect(before).toMatchObject({ contentLocale: "en", translations: { en: "ready", ar: "missing" } });
    expect(before.resources[0].contentLocale).toBe("en"); // fallback language
    const started = await request(base()).post(`/api/lessons/${lessonId}/translate`).set(as(a)).send({ to: "ar" });
    expect(started.status).toBe(202);
    const done = (await pollLesson(a, lessonId, (l) => (l as { translations?: { ar: string } }).translations?.ar === "ready")) as Record<string, any>;
    const arLesson = (await request(base()).get(`/api/lessons/${lessonId}`).set(as(a, "ar"))).body;
    expect(done.translations).toEqual({ en: "ready", ar: "ready" });
    expect(arLesson.title).toMatch(/[؀-ۿ]/);
    expect(arLesson.resources.find((r: { kind: string }) => r.kind === "QUIZ").content.questions[0].prompt).toMatch(/[؀-ۿ]/);
    expect(arLesson.checks[0].message).toMatch(/[؀-ۿ]/);
    const enLesson = (await request(base()).get(`/api/lessons/${lessonId}`).set(as(a, "en"))).body;
    expect(enLesson.title).toMatch(/Photosynthesis/);
    const again = await request(base()).post(`/api/lessons/${lessonId}/translate`).set(as(a)).send({ to: "ar" });
    expect(again.status).toBe(202);
    expect((await request(base()).put("/api/me/locale").set(as(a)).send({ locale: "ar" })).body.locale).toBe("ar");
  });

  it("exports: PPTX, DOCX and PDF downloads; Arabic PDF is a clear 422", async () => {
    const lesson = (await request(base()).get(`/api/lessons/${lessonId}`).set(as(a))).body;
    const get = (kind: string) => lesson.resources.find((r: { kind: string }) => r.kind === kind).id;
    const pptx = await request(base()).get(`/api/resources/${get("SLIDES")}/export?format=pptx`).set(as(a)).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(pptx.status).toBe(200);
    expect(pptx.headers["content-disposition"]).toMatch(/attachment; filename="Nibras - .*\.pptx"/);
    expect((pptx.body as Buffer).subarray(0, 2).toString()).toBe("PK");
    expect((await request(base()).get(`/api/resources/${get("QUIZ")}/export?format=docx&key=false`).set(as(a))).status).toBe(200);
    expect((await request(base()).get(`/api/resources/${get("CARDS")}/export?format=pdf`).set(as(a))).headers["content-type"]).toBe("application/pdf");
    const arPdf = await request(base()).get(`/api/resources/${get("QUIZ")}/export?format=pdf`).set(as(a, "ar"));
    expect(arPdf.status).toBe(422);
    expect(arPdf.body.detail).toMatch(/DOCX/);
    expect((await request(base()).get(`/api/resources/${get("SLIDES")}/export?format=docx`).set(as(a))).status).toBe(400);
  });

  it("regenerating clears the approval; a double click starts one generation; cancel is accepted", async () => {
    const [x, y] = await Promise.all([
      request(base()).post(`/api/lessons/${lessonId}/generate`).set(as(a)).send({ quizCount: 8 }),
      request(base()).post(`/api/lessons/${lessonId}/generate`).set(as(a)).send({ quizCount: 8 }),
    ]);
    expect([x.status, y.status]).toEqual([202, 202]);
    const done = (await pollLesson(a, lessonId, (l) => l.status === "READY" || l.status === "PARTIAL" || l.status === "FAILED")) as Record<string, any>;
    if (done.status !== "READY") console.log("DIAG", JSON.stringify(done.resources.map((r: { kind: string; error: string | null; status: string }) => [r.kind, r.status, r.error])));
    expect({ status: done.status, errors: done.resources.map((r: { kind: string; error: string | null }) => [r.kind, r.error]) }).toMatchObject({ status: "READY" });
    expect(done.approvedAt).toBeNull();
    expect(done.resources.find((r: { kind: string }) => r.kind === "QUIZ").content.questions.length).toBe(8);
    expect(done.resources.every((r: { version: number }) => r.version === 1)).toBe(true);
    expect((await request(base()).post(`/api/lessons/${lessonId}/cancel`).set(as(a))).status).toBe(200);
  });

  it("a text file upload: magic bytes, extraction, language, then the cache by hash", async () => {
    const text = Buffer.from("Plants make their own food using sunlight, water and carbon dioxide. This process is called photosynthesis. Chlorophyll in the leaves captures light.");
    const created = await request(base()).post("/api/lessons").set(as(a)).field("classId", classId).field("autoGenerate", "false").attach("file", text, "notes.txt");
    expect(created.status).toBe(201);
    const analyzed = (await pollLesson(a, created.body.lessonId, (l) => l.status === "ANALYZED" || l.status === "FAILED")) as Record<string, any>;
    expect(analyzed).toMatchObject({ status: "ANALYZED", aiWritten: false, detectedLanguage: "en" });
    expect(analyzed.source).toMatchObject({ fileName: "notes.txt", type: "txt", detectedLocale: "en" });
    expect(analyzed.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(analyzed.resources).toHaveLength(0); // autoGenerate false

    const second = await request(base()).post("/api/lessons").set(as(a)).field("classId", classId).field("autoGenerate", "false").attach("file", text, "notes.txt");
    const cached = (await pollLesson(a, second.body.lessonId, (l) => l.status === "ANALYZED" || l.status === "FAILED")) as Record<string, any>;
    expect(cached.status).toBe("ANALYZED");

    const fake = await request(base()).post("/api/lessons").set(as(a)).field("classId", classId).attach("file", Buffer.from("not a pdf"), "report.pdf");
    expect(fake.status).toBe(400);
    expect((await request(base()).post("/api/lessons").set(as(a)).send({ classId })).status).toBe(400);
  });

  it("a prompt without a title gets a short clean title, then the blueprint's title", async () => {
    const res = await request(base()).post("/api/lessons").set(as(a)).send({ classId, prompt: "Lesson on: The water cycle for grade 6, 45 minutes, focus on vocabulary", autoGenerate: false });
    const first = (await request(base()).get(`/api/lessons/${res.body.lessonId}`).set(as(a))).body;
    expect(first.title.startsWith("Lesson on")).toBe(false);
    expect(first.title.length).toBeLessThanOrEqual(60);
    const done = (await pollLesson(a, res.body.lessonId, (l) => l.status === "ANALYZED")) as Record<string, any>;
    expect(done.title).toBe(done.blueprint.title.trim());
  });

  it("the legacy /source alias returns 409 with the existing lesson id for a duplicate file", async () => {
    const text = Buffer.from("A brand new lesson text about the water cycle: evaporation, condensation and precipitation.");
    const one = await request(base()).post("/api/lessons").set(as(a)).field("classId", classId).field("autoGenerate", "false").attach("file", text, "water.txt");
    await pollLesson(a, one.body.lessonId, (l) => l.status === "ANALYZED");
    const two = (await request(base()).post("/api/lessons").set(as(a)).send({ classId, prompt: "An empty lesson for the duplicate test.", autoGenerate: false })).body;
    const dup = await request(base()).post(`/api/lessons/${two.lessonId}/source`).set(as(a)).attach("file", text, "water.txt");
    expect(dup.status).toBe(409);
    expect(dup.body).toMatchObject({ existingLessonId: one.body.lessonId });
  });

  it("the realtime token endpoint works for a teacher session and a student cookie", async () => {
    const t = await request(base()).get("/api/realtime/token").set(as(a));
    expect(t.status).toBe(200);
    expect(t.body.token).toMatch(/\./);
    expect((await request(base()).get("/api/realtime/token")).status).toBe(401);
  });
});
