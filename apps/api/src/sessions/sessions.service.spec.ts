import { Prisma } from "@prisma/client";
import { DemoAiProvider } from "../ai/demo.provider";
import { quizCache, qrCache } from "../common/content-cache";
import { mockPrisma } from "../testing/mock-prisma";
import { SessionsService, randomJoinCode, sessionGames } from "./sessions.service";

async function quiz() {
  return (await new DemoAiProvider().generateResource("QUIZ", { title: "Photosynthesis", grade: 6, band: "NAVIGATOR", locale: "en", language: "English", durationMin: 45, standard: null, objectives: [], sourceText: "" })).content;
}

const lessonRow = (over: Record<string, unknown> = {}) => ({
  id: "L1",
  classId: "C1",
  approvedAt: new Date(),
  resources: [{ kind: "QUIZ", status: "READY" }, { kind: "GAME", status: "READY" }],
  ...over,
});

const sessionRow = (over: object = {}) => ({
  id: "SE1", lessonId: "L1", classId: "C1", type: "LIVE_QUIZ", game: null, status: "LOBBY", joinCode: "123456", namesHidden: true, currentQuestion: 0, revealed: false, isOpen: true, ...over,
});

async function setup() {
  quizCache.clear();
  qrCache.clear();
  const db = mockPrisma();
  const q = (await quiz()) as unknown as { questions: { prompt: string; options: string[]; type: string }[] };
  // the lookup by (lesson, kind) is the light key; the lookup by id is the content (only on a cache miss)
  db.resource.findUnique.mockImplementation(async ({ where }: { where: { id?: string } }) => (where.id ? { contentEn: q, contentAr: null } : { id: "R1", updatedAt: new Date(1000), status: "READY" }));
  db.participant.findMany.mockResolvedValue([]);
  db.student.count.mockResolvedValue(24);
  db.answer.findMany.mockResolvedValue([]);
  db.activitySession.findFirst.mockResolvedValue(null);
  db.activitySession.create.mockImplementation(async ({ data }: { data: object }) => sessionRow(data));
  db.activitySession.update.mockImplementation(async ({ data }: { data: object }) => sessionRow(data));
  return { db, service: new SessionsService(db), q };
}

describe("SessionsService.create", () => {
  it("is blocked until the teacher approves the kit", async () => {
    const { db, service } = await setup();
    db.lesson.findFirst.mockResolvedValue(lessonRow({ approvedAt: null }));
    await expect(service.create("T1", { lessonId: "L1", type: "LIVE_QUIZ", namesHidden: true }, "en")).rejects.toMatchObject({ status: 409, detail: expect.stringContaining("Approve") });
    expect(db.activitySession.create).not.toHaveBeenCalled();
  });

  it("creates a lobby for an approved live quiz with a 6-digit code, scoped by teacher", async () => {
    const { db, service } = await setup();
    db.lesson.findFirst.mockResolvedValue(lessonRow());
    const view = await service.create("T1", { lessonId: "L1", type: "LIVE_QUIZ", namesHidden: true }, "en");
    expect(view).toMatchObject({ status: "LOBBY", questionCount: 10, classSize: 24 });
    expect(view.joinCode).toMatch(/^\d{6}$/);
    expect(db.lesson.findFirst.mock.calls[0][0].where).toEqual({ id: "L1", teacherId: "T1" });
  });

  it("games and assignments go live straight away and need their resource ready", async () => {
    const { db, service } = await setup();
    db.lesson.findFirst.mockResolvedValue(lessonRow());
    expect(await service.create("T1", { lessonId: "L1", type: "GAME", game: "MEMORY", namesHidden: true }, "en")).toMatchObject({ status: "LIVE", game: "MEMORY" });
    db.lesson.findFirst.mockResolvedValue(lessonRow({ resources: [{ kind: "QUIZ", status: "FAILED" }] }));
    await expect(service.create("T1", { lessonId: "L1", type: "LIVE_QUIZ", namesHidden: true }, "en")).rejects.toMatchObject({ status: 400 });
    await expect(service.create("T1", { lessonId: "L1", type: "GAME", namesHidden: true }, "en")).rejects.toMatchObject({ status: 400 });
    await expect(service.create("T1", { lessonId: "L1", type: "ASSIGNMENT", namesHidden: true }, "en")).rejects.toMatchObject({ status: 400 });
    db.lesson.findFirst.mockResolvedValue(null);
    await expect(service.create("T2", { lessonId: "L1", type: "GAME", namesHidden: true }, "en")).rejects.toMatchObject({ status: 404 });
  });

  it("retries a join code on collision among non-ended sessions", async () => {
    const { db, service } = await setup();
    const codes = ["111111", "222222", "333333"];
    db.activitySession.findFirst.mockResolvedValueOnce({ id: "x" }).mockResolvedValueOnce({ id: "y" }).mockResolvedValue(null);
    expect(await service.uniqueJoinCode(() => codes.shift() as string)).toBe("333333");
    expect(db.activitySession.findFirst.mock.calls[0][0].where).toEqual({ joinCode: "111111", status: { not: "ENDED" } });
    db.activitySession.findFirst.mockResolvedValue({ id: "always" });
    await expect(service.uniqueJoinCode(() => "000000")).rejects.toMatchObject({ status: 409 });
    expect(randomJoinCode()).toMatch(/^\d{6}$/);
  });
});

describe("SessionsService actions and view", () => {
  it("runs a live quiz: start, next, reveal, prev, end", async () => {
    const { db, service } = await setup();
    db.activitySession.findFirst.mockResolvedValue(sessionRow());
    expect((await service.action("T1", "SE1", "start", "en")).status).toBe("LIVE");
    db.activitySession.findFirst.mockResolvedValue(sessionRow({ status: "LIVE" }));
    expect((await service.action("T1", "SE1", "next", "en")).currentQuestion).toBe(1);
    expect((await service.action("T1", "SE1", "prev", "en")).currentQuestion).toBe(0);
    expect((await service.action("T1", "SE1", "reveal", "en")).revealed).toBe(true);
    expect((await service.action("T1", "SE1", "toggleNames", "en")).namesHidden).toBe(false);
    expect((await service.action("T1", "SE1", "end", "en")).status).toBe("ENDED");
    await expect(service.action("T1", "SE1", "start", "en")).rejects.toMatchObject({ status: 409 });
  });

  it("refuses out-of-order actions and quiz steps on games", async () => {
    const { db, service } = await setup();
    db.activitySession.findFirst.mockResolvedValue(sessionRow({ status: "LIVE" }));
    await expect(service.action("T1", "SE1", "start", "en")).rejects.toMatchObject({ status: 409 });
    db.activitySession.findFirst.mockResolvedValue(sessionRow());
    await expect(service.action("T1", "SE1", "next", "en")).rejects.toMatchObject({ status: 409 });
    await expect(service.action("T1", "SE1", "reveal", "en")).rejects.toMatchObject({ status: 409 });
    db.activitySession.findFirst.mockResolvedValue(sessionRow({ type: "GAME", status: "LIVE" }));
    await expect(service.action("T1", "SE1", "next", "en")).rejects.toMatchObject({ status: 400 });
    db.activitySession.findFirst.mockResolvedValue(null);
    await expect(service.get("T2", "SE1", "en")).rejects.toMatchObject({ status: 404 });
  });

  it("shows the question, who has not answered, and the distribution only after reveal", async () => {
    const { db, service } = await setup();
    db.activitySession.findFirst.mockResolvedValue(sessionRow({ status: "LIVE" }));
    db.participant.findMany.mockResolvedValue([
      { id: "P1", displayName: "Sara A.", student: { fullName: "Sara Ahmed" } },
      { id: "P2", displayName: "Omar K.", student: { fullName: "Omar Kacem" } },
    ]);
    db.answer.findMany.mockResolvedValue([{ participantId: "P1", optionIndex: 1 }]);
    const live = await service.get("T1", "SE1", "en");
    expect(live).toMatchObject({ joined: 2, answeredCurrent: 1, notAnswered: ["Omar Kacem"], distribution: null });
    expect(live.question?.prompt).toBeTruthy();
    expect(JSON.stringify(live)).not.toContain("answerIndex");
    db.activitySession.findFirst.mockResolvedValue(sessionRow({ status: "LIVE", revealed: true }));
    const revealed = await service.get("T1", "SE1", "en");
    expect(revealed.distribution?.[1]).toBe(1);
    db.activitySession.findFirst.mockResolvedValue(sessionRow());
    expect((await service.get("T1", "SE1", "en")).question).toBeNull();
  });
});

describe("SessionsService realtime and games", () => {
  it("emits session.state on start, next, prev, reveal, end, open and close (flags only, no answers)", async () => {
    const { db, q } = await setup();
    void q;
    const events = { emit: jest.fn() };
    const service = new SessionsService(db, events as never);
    db.activitySession.findFirst.mockResolvedValue(sessionRow());
    await service.action("T1", "SE1", "start", "en");
    db.activitySession.findFirst.mockResolvedValue(sessionRow({ status: "LIVE", isOpen: true }));
    for (const a of ["next", "prev", "reveal", "close", "open", "end"] as const) await service.action("T1", "SE1", a, "en");
    const states = events.emit.mock.calls.filter((c) => c[1] === "session.state");
    expect(states).toHaveLength(7);
    expect(states[0]).toEqual(["session:SE1", "session.state", { sessionId: "SE1", status: "LIVE", currentQuestion: 0, revealed: false, isOpen: true }]);
    expect(states[1][2]).toMatchObject({ currentQuestion: 1, revealed: false });
    expect(states[3][2]).toMatchObject({ revealed: true });
    expect(states[4][2]).toMatchObject({ isOpen: false });
    expect(states[6][2]).toMatchObject({ status: "ENDED" });
    expect(JSON.stringify(states)).not.toMatch(/answer|correct|option/i);
    expect(events.emit.mock.calls.filter((c) => c[1] === "session.question")).toHaveLength(3); // start, next, prev
  });

  it("stores the published games and shows the 100 points split among them", async () => {
    const { db, service } = await setup();
    db.lesson.findFirst.mockResolvedValue(lessonRow());
    const view = await service.create("T1", { lessonId: "L1", type: "GAME", namesHidden: true }, "en", { games: ["SORT", "ODD_ONE_OUT", "SORT"] });
    const data = db.activitySession.create.mock.calls[0][0].data;
    expect(data.games).toEqual(["SORT", "ODD_ONE_OUT"]);
    expect(data.game).toBe("SORT");
    expect(view.games).toEqual([{ game: "SORT", points: 50 }, { game: "ODD_ONE_OUT", points: 50 }]);
    // a live quiz publishes no games; a single `game` still counts as a one-game list worth 100
    await service.create("T1", { lessonId: "L1", type: "LIVE_QUIZ", namesHidden: true }, "en", { games: ["SORT"] });
    expect(db.activitySession.create.mock.calls[1][0].data.games).toBe(Prisma.DbNull);
    const single = await service.create("T1", { lessonId: "L1", type: "GAME", game: "MEMORY", namesHidden: true }, "en");
    expect(single.games).toEqual([{ game: "MEMORY", points: 100 }]);
    expect(sessionGames({ games: ["bogus"], game: null })).toBeNull();
    expect(sessionGames({ games: [], game: "SORT" })).toEqual(["SORT"]);
  });

  it("the teacher's session view reloads no quiz content and makes the QR once", async () => {
    const { db, service } = await setup();
    db.activitySession.findFirst.mockResolvedValue(sessionRow({ status: "LIVE" }));
    await service.get("T1", "SE1", "en");
    await service.get("T1", "SE1", "en");
    await service.get("T1", "SE1", "en");
    const contentLoads = db.resource.findUnique.mock.calls.filter((c: { where: { id?: string } }[]) => c[0].where.id);
    expect(contentLoads).toHaveLength(1);
  });
});

describe("SessionsService share settings", () => {
  it("leaderboard band rule: Explorer classes are held to TEAMS, older classes may use INDIVIDUAL", async () => {
    const { db, service } = await setup();
    db.lesson.findFirst.mockResolvedValue(lessonRow({ classRoom: { band: "EXPLORER" } }));
    await service.create("T1", { lessonId: "L1", type: "LIVE_QUIZ", namesHidden: true }, "en", { leaderboard: "INDIVIDUAL" });
    expect(db.activitySession.create.mock.calls[0][0].data.leaderboard).toBe("TEAMS");
    db.lesson.findFirst.mockResolvedValue(lessonRow({ classRoom: { band: "STUDIO" } }));
    const view = await service.create("T1", { lessonId: "L1", type: "LIVE_QUIZ", namesHidden: true }, "en", { leaderboard: "INDIVIDUAL" });
    expect(db.activitySession.create.mock.calls[1][0].data.leaderboard).toBe("INDIVIDUAL");
    expect(view.leaderboard).toBe("INDIVIDUAL");
    await service.create("T1", { lessonId: "L1", type: "LIVE_QUIZ", namesHidden: true }, "en", { leaderboard: "OFF" });
    expect(db.activitySession.create.mock.calls[2][0].data.leaderboard).toBe("OFF");
    await service.create("T1", { lessonId: "L1", type: "LIVE_QUIZ", namesHidden: true }, "en");
    expect(db.activitySession.create.mock.calls[3][0].data.leaderboard).toBe("TEAMS");
  });

  it("sessions expire (24 h by default, or the chosen hours) and carry a join link and QR", async () => {
    process.env.WEB_URL = "https://nibras.example";
    const { db, service } = await setup();
    db.lesson.findFirst.mockResolvedValue(lessonRow());
    const view = await service.create("T1", { lessonId: "L1", type: "ASSIGNMENT", namesHidden: true }, "en", { expiresInHours: 2 });
    const expires = db.activitySession.create.mock.calls[0][0].data.expiresAt as Date;
    expect(expires.getTime() - Date.now()).toBeGreaterThan(1.9 * 3_600_000);
    expect(expires.getTime() - Date.now()).toBeLessThan(2.1 * 3_600_000);
    expect(view.link).toBe(`https://nibras.example/join?code=${view.joinCode}`);
    expect(view.qrSvg).toMatch(/^<svg/);
    expect(view.isOpen).toBe(true);
    delete process.env.WEB_URL;
  });

  it("the teacher can close and reopen the link; an expired session reads as closed", async () => {
    const { db, service } = await setup();
    db.activitySession.findFirst.mockResolvedValue(sessionRow({ status: "LIVE", isOpen: true }));
    expect((await service.action("T1", "SE1", "close", "en")).isOpen).toBe(false);
    expect((await service.action("T1", "SE1", "open", "en")).isOpen).toBe(true);
    db.activitySession.findFirst.mockResolvedValue(sessionRow({ status: "LIVE", isOpen: true, expiresAt: new Date(Date.now() - 1000) }));
    expect((await service.get("T1", "SE1", "en")).isOpen).toBe(false);
  });
});
