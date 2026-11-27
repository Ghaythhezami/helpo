import { DemoAiProvider } from "../ai/demo.provider";
import { mockPrisma } from "../testing/mock-prisma";
import { ResourcesService } from "./resources.service";

const ctx = { title: "Photosynthesis: how plants make food", grade: 6, band: "NAVIGATOR" as const, locale: "en" as const, language: "English", durationMin: 45, standard: null, objectives: [], sourceText: "" };

async function setup(over: { kind?: string; lesson?: Record<string, unknown> } = {}) {
  const demo = new DemoAiProvider();
  const kind = (over.kind ?? "QUIZ") as "QUIZ" | "GAME";
  const content = (await demo.generateResource(kind, ctx)).content;
  const db = mockPrisma();
  const resource = {
    id: "R1",
    lessonId: "L1",
    kind,
    status: "READY",
    version: 1,
    contentEn: content,
    contentAr: null,
    error: null,
    progress: 100,
    promptVersion: "quiz.v1",
    model: "demo",
    tokensIn: 0,
    tokensOut: 0,
    updatedAt: new Date(),
    lesson: { id: "L1", approvedAt: null, status: "READY", contentLocale: "en", translationStatus: { en: "ready", ar: "missing" }, titleEn: "t", titleAr: null, classRoom: { name: "6B", grade: 6, band: "NAVIGATOR" }, ...over.lesson },
  };
  db.resource.findFirst.mockResolvedValue(resource);
  db.resource.update.mockImplementation(async ({ data }: { data: object }) => ({ ...resource, ...data }));
  const sessions = { create: jest.fn().mockResolvedValue({ id: "SE1", joinCode: "123456", link: "x", qrSvg: "<svg/>" }) };
  return { db, sessions, content, resource, service: new ResourcesService(db, demo, sessions as never) };
}

describe("ResourcesService versions", () => {
  it("an edit keeps the AI original as version 1 and saves the edit as a new version", async () => {
    const { db, content, service } = await setup();
    const edited = structuredClone(content) as { questions: { prompt: string }[] };
    edited.questions[0].prompt = "My own wording?";
    const view = await service.update("T1", "R1", edited, "en");
    expect(view.version).toBe(2);
    expect(db.resourceVersion.upsert.mock.calls[0][0].create).toMatchObject({ version: 1, source: "AI" });
    expect(db.resourceVersion.create.mock.calls[0][0].data).toMatchObject({ version: 2, source: "TEACHER" });
    expect(db.resource.update.mock.calls[0][0].data).toMatchObject({ version: 2, status: "READY" });
    expect(db.resource.findFirst.mock.calls[0][0].where).toEqual({ id: "R1", lesson: { teacherId: "T1" } });
  });

  it("invalid edits are rejected with per-field errors and nothing is written", async () => {
    const { db, service } = await setup();
    await expect(service.update("T1", "R1", { questions: [{ id: 1 }] }, "en")).rejects.toMatchObject({ status: 400 });
    expect(db.resourceVersion.create).not.toHaveBeenCalled();
  });

  it("revert restores an earlier version as a NEW version; unknown versions are 404", async () => {
    const { db, content, service } = await setup();
    db.resourceVersion.findUnique.mockResolvedValue({ contentEn: content, contentAr: null });
    const view = await service.revert("T1", "R1", 1, "en");
    expect(view.version).toBe(2);
    expect(db.resourceVersion.create.mock.calls[0][0].data).toMatchObject({ version: 2, source: "TEACHER" });
    db.resourceVersion.findUnique.mockResolvedValue(null);
    await expect(service.revert("T1", "R1", 9, "en")).rejects.toMatchObject({ status: 404 });
  });
});

describe("ResourcesService.share (sharing is the approval)", () => {
  const body = (over: object = {}) => ({ mode: "LIVE_QUIZ" as const, expiresInHours: 24, leaderboard: "TEAMS" as const, approveAnyway: false, ...over });

  it("approves and creates the session when there are no open checks", async () => {
    const { db, sessions, service } = await setup();
    db.aiCheck.count.mockResolvedValue(0);
    const out = await service.share("T1", "R1", body(), "en");
    expect(db.lesson.update.mock.calls[0][0].data.approvedAt).toBeInstanceOf(Date);
    expect(sessions.create).toHaveBeenCalledWith("T1", expect.objectContaining({ lessonId: "L1", type: "LIVE_QUIZ" }), "en", { expiresInHours: 24, leaderboard: "TEAMS" });
    expect(out).toMatchObject({ joinCode: "123456", qrSvg: "<svg/>" });
  });

  it("open checks give a 409 checks-open with the count and create nothing", async () => {
    const { db, sessions, service } = await setup();
    db.aiCheck.count.mockResolvedValue(3);
    await expect(service.share("T1", "R1", body(), "en")).rejects.toMatchObject({ status: 409, extensions: { type: "checks-open", openChecks: 3 } });
    expect(db.lesson.update).not.toHaveBeenCalled();
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it("approveAnyway shares despite open checks", async () => {
    const { db, sessions, service } = await setup();
    db.aiCheck.count.mockResolvedValue(3);
    await service.share("T1", "R1", body({ approveAnyway: true }), "en");
    expect(db.aiCheck.count).not.toHaveBeenCalled();
    expect(db.lesson.update.mock.calls[0][0].data.approvedAt).toBeInstanceOf(Date);
    expect(sessions.create).toHaveBeenCalled();
  });

  it("an already approved lesson shares without any check lookup", async () => {
    const { db, sessions, service } = await setup({ lesson: { approvedAt: new Date() } });
    await service.share("T1", "R1", body({ mode: "ASSIGNMENT" }), "en");
    expect(db.aiCheck.count).not.toHaveBeenCalled();
    expect(db.lesson.update).not.toHaveBeenCalled();
    expect(sessions.create).toHaveBeenCalled();
  });

  it("refuses unfinished kits and mismatched modes; other teachers get 404", async () => {
    const draft = await setup({ lesson: { status: "GENERATING" } });
    await expect(draft.service.share("T1", "R1", body(), "en")).rejects.toMatchObject({ status: 409 });
    const game = await setup({ kind: "GAME" });
    await expect(game.service.share("T1", "R1", body({ mode: "LIVE_QUIZ" }), "en")).rejects.toMatchObject({ status: 400 });
    game.db.aiCheck.count.mockResolvedValue(0);
    await game.service.share("T1", "R1", body({ mode: "GAME", game: "MEMORY" }), "en");
    expect(game.sessions.create.mock.calls[0][1]).toMatchObject({ type: "GAME", game: "MEMORY" });
    game.db.resource.findFirst.mockResolvedValue(null);
    await expect(game.service.share("T2", "R1", body({ mode: "GAME" }), "en")).rejects.toMatchObject({ status: 404 });
  });
});

describe("ResourcesService rewrite and change", () => {
  it("rewrites in the language being viewed and validates AI changes", async () => {
    const { service } = await setup();
    expect((await service.rewrite("T1", "R1", "Utilize it.", "simpler", "en")).text).not.toMatch(/utilize/i);
    const out = await service.change("T1", "R1", "make it easier", "en");
    expect(out.summary).toMatch(/simpler/);
    expect(out.resource.kind).toBe("QUIZ");
  });

  it("refuses to change a resource that is not ready", async () => {
    const { db, resource, service } = await setup();
    db.resource.findFirst.mockResolvedValue({ ...resource, status: "WORKING", contentEn: null });
    await expect(service.change("T1", "R1", "make it easier", "en")).rejects.toMatchObject({ status: 400 });
  });
});

describe("ResourcesService.share with published games", () => {
  const body = (over: object = {}) => ({ mode: "GAME" as const, expiresInHours: 24, leaderboard: "TEAMS" as const, approveAnyway: true, ...over });

  it("passes the teacher's games to the session, de-duplicated", async () => {
    const { db, sessions, service } = await setup({ kind: "GAME" });
    db.aiCheck.count.mockResolvedValue(0);
    await service.share("T1", "R1", body({ games: ["SORT", "ODD_ONE_OUT", "SORT"] }), "en");
    expect(sessions.create.mock.calls[0][3]).toMatchObject({ games: ["SORT", "ODD_ONE_OUT"], expiresInHours: 24 });
  });

  it("refuses a game the lesson's content cannot play, naming it", async () => {
    const { resource, sessions, service } = await setup({ kind: "GAME" });
    (resource.contentEn as { oddOneOut: unknown[] }).oddOneOut = []; // not enough rounds
    await expect(service.share("T1", "R1", body({ games: ["SORT", "ODD_ONE_OUT"] }), "en")).rejects.toMatchObject({ status: 400, detail: expect.stringContaining("ODD_ONE_OUT") });
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it("a quiz share ignores games, and a plain game share publishes none (every playable game)", async () => {
    const quiz = await setup();
    await quiz.service.share("T1", "R1", { mode: "LIVE_QUIZ", expiresInHours: 24, leaderboard: "TEAMS", approveAnyway: true, games: ["SORT"] }, "en");
    expect(quiz.sessions.create.mock.calls[0][3].games).toBeUndefined();
    const game = await setup({ kind: "GAME" });
    await game.service.share("T1", "R1", body({ game: "MEMORY" }), "en");
    expect(game.sessions.create.mock.calls[0][3].games).toBeUndefined();
  });
});
