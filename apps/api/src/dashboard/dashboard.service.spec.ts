import { mockPrisma } from "../testing/mock-prisma";
import { DashboardService } from "./dashboard.service";

const cls = (id: string, name: string, goal = 500) => ({ id, name, grade: 6, band: "NAVIGATOR", subjectEn: "Science", subjectAr: null, weeklyGoalXp: goal, _count: { students: 24 } });
const lesson = (id: string, day: number, over: Record<string, unknown> = {}) => ({ id, createdAt: new Date(`2026-11-${10 + day}T09:00:00Z`), sessions: [], checks: [], ...over });

function setup() {
  const db = mockPrisma();
  const summary = (id: string) => ({ id, title: `Lesson ${id}`, status: "READY" });
  const lessons = {
    summaries: jest.fn(async (rows: { id: string }[]) => rows.map((r) => summary(r.id))),
    summary: jest.fn(async (row: { id: string }) => summary(row.id)),
  };
  db.user.findUnique.mockResolvedValue({ school: { name: "Riverside Middle School" } });
  db.classRoom.findMany.mockResolvedValue([]);
  db.lesson.findMany.mockResolvedValue([]);
  db.lesson.count.mockResolvedValue(0);
  db.activitySession.count.mockResolvedValue(0);
  db.xpEvent.aggregate.mockResolvedValue({ _sum: { amount: null } });
  db.xpEvent.groupBy.mockResolvedValue([]);
  return { db, lessons, service: new DashboardService(db, lessons as never) };
}

const teacher = { id: "T1", name: "Alex Green" };

describe("DashboardService", () => {
  it("empty state: no classes, no lessons, no quest, zero recap", async () => {
    const { service } = setup();
    const d = await service.get(teacher, "en");
    expect(d).toMatchObject({
      teacherName: "Alex Green",
      schoolName: "Riverside Middle School",
      nextLesson: null,
      classes: [],
      recentLessons: [],
      classQuest: null,
      kitCheckStreak: 0,
      weekRecap: { kitsMade: 0, liveQuizzes: 0, xpEarned: 0 },
    });
    expect(d.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("a teacher without a school shows schoolName null", async () => {
    const { db, service } = setup();
    db.user.findUnique.mockResolvedValue({ school: null });
    expect((await service.get(teacher, "en")).schoolName).toBeNull();
    db.user.findUnique.mockResolvedValue(null);
    expect((await service.get(teacher, "en")).schoolName).toBeNull();
  });

  it("class quest is the class with the most XP this week; the recap counts this week's kits, quizzes and XP", async () => {
    const { db, service } = setup();
    db.classRoom.findMany.mockResolvedValue([cls("C1", "6A"), cls("C2", "6B", 600), cls("C3", "7C")]);
    db.xpEvent.groupBy.mockResolvedValue([{ classId: "C1", _sum: { amount: 120 } }, { classId: "C2", _sum: { amount: 380 } }]);
    db.lesson.count.mockResolvedValue(2);
    db.activitySession.count.mockResolvedValue(3);
    db.xpEvent.aggregate.mockResolvedValue({ _sum: { amount: 500 } });
    const d = await service.get(teacher, "en");
    expect(d.classQuest).toEqual({ classId: "C2", className: "6B", goalXp: 600, earnedXp: 380 });
    expect(d.weekRecap).toEqual({ kitsMade: 2, liveQuizzes: 3, xpEarned: 500 });
    expect(d.classes.map((c) => c.name)).toEqual(["6A", "6B", "7C"]);
    expect(db.classRoom.findMany.mock.calls[0][0].where).toEqual({ teacherId: "T1" });
    expect(db.lesson.count.mock.calls[0][0].where).toMatchObject({ teacherId: "T1", status: { in: ["READY", "PARTIAL"] } });
    expect(db.activitySession.count.mock.calls[0][0].where).toMatchObject({ lesson: { teacherId: "T1" }, type: "LIVE_QUIZ" });
  });

  it("no XP this week means no class quest", async () => {
    const { db, service } = setup();
    db.classRoom.findMany.mockResolvedValue([cls("C1", "6A")]);
    expect((await service.get(teacher, "en")).classQuest).toBeNull();
  });

  it("next lesson: the oldest ready lesson nobody has taught, otherwise the newest ready one", async () => {
    const { db, lessons, service } = setup();
    const recent = [lesson("L3", 3), lesson("L2", 2)];
    db.lesson.findMany.mockImplementation(async (a: { include?: { sessions?: unknown } }) =>
      a.include?.sessions ? [lesson("L3", 3, { sessions: [{ id: "s" }] }), lesson("L2", 2), lesson("L1", 1)] : recent,
    );
    const d = await service.get(teacher, "ar");
    expect(d.nextLesson?.id).toBe("L1"); // oldest untaught, not in the recent six
    expect(lessons.summary).not.toHaveBeenCalled(); // no second 3-query summary call: ONE summaries() covers both
    expect(lessons.summaries).toHaveBeenCalledTimes(1);
    expect(lessons.summaries).toHaveBeenCalledWith([...recent, expect.objectContaining({ id: "L1" })], "ar");
    expect(d.recentLessons.map((l) => l.id)).toEqual(["L3", "L2"]);

    db.lesson.findMany.mockImplementation(async (a: { include?: { sessions?: unknown } }) => (a.include?.sessions ? [lesson("L3", 3, { sessions: [{ id: "s" }] }), lesson("L2", 2, { sessions: [{ id: "s" }] })] : recent));
    expect((await service.get(teacher, "en")).nextLesson?.id).toBe("L3"); // everything taught: the newest, found in the recent list
  });

  it("kit-check streak counts reviewed kits in a row and skips kits still under review", async () => {
    const { db, service } = setup();
    const kits = (open: boolean[]) => open.map((o) => ({ checks: [{ status: o ? "OPEN" : "ACCEPTED" }] }));
    const run = async (rows: { checks: { status: string }[] }[]) => {
      db.lesson.findMany.mockImplementation(async (a: { select?: unknown }) => (a.select ? rows : []));
      return (await service.get(teacher, "en")).kitCheckStreak;
    };
    expect(await run(kits([true, false, false, false]))).toBe(3); // newest still under review: skipped
    expect(await run(kits([false, false, true, false]))).toBe(2); // an open kit later breaks the streak
    expect(await run(kits([true, true]))).toBe(0);
    expect(await run([{ checks: [] }, { checks: [] }])).toBe(2); // kits without checks count as clean
  });
});
