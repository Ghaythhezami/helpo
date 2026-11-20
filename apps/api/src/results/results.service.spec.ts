import { DemoAiProvider } from "../ai/demo.provider";
import { correctIndex } from "../ai/content";
import { mockPrisma } from "../testing/mock-prisma";
import { ResultsService, averageTime, participantSeconds } from "./results.service";

const ctx = { title: "Photosynthesis: how plants make food", grade: 6, band: "NAVIGATOR" as const, locale: "en" as const, language: "English", durationMin: 45, standard: null, objectives: [], sourceText: "" };
const T0 = new Date("2026-11-20T10:00:00Z").getTime();
const at = (sec: number) => new Date(T0 + sec * 1000);

async function setup() {
  const demo = new DemoAiProvider();
  const quiz = (await demo.generateResource("QUIZ", ctx)).content as { questions: { id: string; objectiveCode: string; options: { correct: boolean; text: string }[] | null }[] };
  const db = mockPrisma();
  const lessons = { findOwned: jest.fn().mockResolvedValue({ id: "L1", classId: "C1", objectivesEn: [], objectivesAr: [], titleEn: "t", titleAr: null }) };
  db.resource.findUnique.mockResolvedValue({ contentEn: quiz, contentAr: null });
  db.student.findMany.mockResolvedValue([{ id: "S1", fullName: "Sara Ahmed" }, { id: "S2", fullName: "Omar Kacem" }, { id: "S3", fullName: "Lina Mansour" }]);
  db.gameResult.groupBy.mockResolvedValue([]);
  db.xpEvent.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
  db.classRoom.findUnique.mockResolvedValue({ weeklyGoalXp: 500 });
  db.activitySession.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id, lessonId: "L1" }));
  return { db, quiz, service: new ResultsService(db, lessons as never, demo) };
}

const sess = (id: string, type: string, day: number, participants: string[]) => ({ id, type, createdAt: new Date(`2026-11-${10 + day}T10:00:00Z`), answers: participants.map((participantId) => ({ participantId })) });

describe("ResultsService default session", () => {
  it("picks the newest session that has answers, not simply the newest one", async () => {
    const { db, service } = await setup();
    db.activitySession.findMany.mockResolvedValue([sess("EMPTY-LIVE", "LIVE_QUIZ", 3, []), sess("ASSIGN", "ASSIGNMENT", 2, ["P1", "P2"]), sess("OLD-LIVE", "LIVE_QUIZ", 1, ["P1"])]);
    db.answer.findMany.mockResolvedValue([]);
    db.participant.findMany.mockResolvedValue([]);
    const r = await service.get("T1", "L1", "en");
    expect(r.sessionId).toBe("ASSIGN");
    expect(r.sessions.map((s) => [s.id, s.type, s.answered])).toEqual([["EMPTY-LIVE", "LIVE_QUIZ", 0], ["ASSIGN", "ASSIGNMENT", 2], ["OLD-LIVE", "LIVE_QUIZ", 1]]);
    expect(r.sessions[0].createdAt).toMatch(/^2026-11-13/);
  });

  it("falls back to the newest session when none has answers, and to no session at all", async () => {
    const { db, service } = await setup();
    db.activitySession.findMany.mockResolvedValue([sess("A", "LIVE_QUIZ", 2, []), sess("B", "LIVE_QUIZ", 1, [])]);
    db.answer.findMany.mockResolvedValue([]);
    db.participant.findMany.mockResolvedValue([]);
    expect((await service.get("T1", "L1", "en")).sessionId).toBe("A");
    db.activitySession.findMany.mockResolvedValue([]);
    const none = await service.get("T1", "L1", "en");
    expect(none).toMatchObject({ sessionId: null, sessions: [], answered: 0, average: null });
    expect(none.notSubmitted).toHaveLength(3);
  });

  it("an explicit sessionId wins; an unknown one is 404", async () => {
    const { db, service } = await setup();
    db.activitySession.findMany.mockResolvedValue([sess("A", "LIVE_QUIZ", 2, ["P1"]), sess("B", "LIVE_QUIZ", 1, [])]);
    db.answer.findMany.mockResolvedValue([]);
    db.participant.findMany.mockResolvedValue([]);
    expect((await service.get("T1", "L1", "en", "B")).sessionId).toBe("B");
    await expect(service.get("T1", "L1", "en", "NOPE")).rejects.toMatchObject({ status: 404 });
  });
});

describe("ResultsService average time", () => {
  it("live quiz: join to last answer, only over students who answered", async () => {
    const { db, quiz, service } = await setup();
    db.activitySession.findMany.mockResolvedValue([sess("LIVE", "LIVE_QUIZ", 1, ["P1", "P2"])]);
    const right = (i: number) => correctIndex(quiz.questions[i] as never) as number;
    db.answer.findMany.mockResolvedValue([
      { participantId: "P1", questionIndex: 0, optionIndex: right(0), correct: true, partial: false, createdAt: at(60) },
      { participantId: "P1", questionIndex: 1, optionIndex: right(1), correct: true, partial: false, createdAt: at(120) },
      { participantId: "P2", questionIndex: 0, optionIndex: right(0), correct: true, partial: false, createdAt: at(200) },
    ]);
    db.participant.findMany.mockResolvedValue([
      { id: "P1", studentId: "S1", displayName: "Sara A.", durationSec: null, joinedAt: at(0), student: { fullName: "Sara Ahmed" } },
      { id: "P2", studentId: "S2", displayName: "Omar K.", durationSec: null, joinedAt: at(100), student: { fullName: "Omar Kacem" } },
      { id: "P3", studentId: "S3", displayName: "Lina M.", durationSec: null, joinedAt: at(0), student: { fullName: "Lina Mansour" } }, // never answered
    ]);
    const r = await service.get("T1", "L1", "en");
    expect(r.answered).toBe(2);
    expect(r.averageTimeSec).toBe(Math.round((120 + 100) / 2)); // 120 s and 100 s
    expect(r.notSubmitted.map((n) => n.name)).toEqual(["Lina Mansour"]);
    expect(r.ranking).toHaveLength(2);
  });

  it("helpers: submitted duration wins, no answers means null", () => {
    expect(participantSeconds({ durationSec: 95, joinedAt: at(0) }, [{ createdAt: at(500) }])).toBe(95);
    expect(participantSeconds({ durationSec: null, joinedAt: at(10) }, [{ createdAt: at(40) }, { createdAt: at(70) }])).toBe(60);
    expect(participantSeconds({ durationSec: null, joinedAt: at(10) }, [])).toBeNull();
    expect(participantSeconds({ durationSec: null, joinedAt: at(100) }, [{ createdAt: at(50) }])).toBe(0);
    expect(averageTime([null, 10, 20])).toBe(15);
    expect(averageTime([null])).toBeNull();
  });
});
