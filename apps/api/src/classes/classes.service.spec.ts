import { Prisma } from "@prisma/client";
import { mockPrisma } from "../testing/mock-prisma";
import { ClassesService } from "./classes.service";

const classRow = (over: Record<string, unknown> = {}) => ({
  id: "C1",
  name: "6B",
  grade: 6,
  band: "NAVIGATOR",
  subjectEn: "Science",
  subjectAr: "العلوم",
  pointsEnabled: true,
  teamsEnabled: false,
  soundsEnabled: false,
  celebrationsEnabled: true,
  weeklyGoalXp: 500,
  _count: { students: 24 },
  ...over,
});

function setup() {
  const db = mockPrisma();
  const lessons = { summaries: jest.fn().mockResolvedValue([{ id: "L1", title: "Photosynthesis" }]) };
  return { db, lessons, service: new ClassesService(db, lessons as never) };
}

describe("ClassesService", () => {
  it("lists only the teacher's classes, localized, ordered by grade then name", async () => {
    const { db, service } = setup();
    db.classRoom.findMany.mockResolvedValue([classRow(), classRow({ id: "C2", name: "7C", grade: 7, subjectAr: null, _count: { students: 21 } })]);
    const out = await service.list("T1", "ar");
    expect(db.classRoom.findMany.mock.calls[0][0]).toMatchObject({ where: { teacherId: "T1" }, orderBy: [{ grade: "asc" }, { name: "asc" }] });
    expect(out.map((c) => [c.name, c.subject, c.studentCount])).toEqual([["6B", "العلوم", 24], ["7C", "Science", 21]]); // Arabic falls back to English
  });

  it("creates a class with the band derived from the grade, attached to the teacher's school", async () => {
    const { db, service } = setup();
    db.user.findUnique.mockResolvedValue({ schoolId: "SC1" });
    db.classRoom.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => classRow({ ...data, id: "C9", subjectEn: data.subjectEn ?? "Science", _count: { students: 0 } }));
    const small = await service.create("T1", { name: "3A", grade: 3, subject: "Science" }, "en");
    expect(small).toMatchObject({ name: "3A", band: "EXPLORER", studentCount: 0 });
    expect(db.classRoom.create.mock.calls[0][0].data).toMatchObject({ teacherId: "T1", schoolId: "SC1", band: "EXPLORER", subjectEn: "Science", subjectAr: "العلوم" });
    await service.create("T1", { name: "11S", grade: 11, subject: "Physics" }, "en");
    expect(db.classRoom.create.mock.calls[1][0].data).toMatchObject({ band: "STUDIO", subjectEn: "Physics" });
    expect(db.classRoom.create.mock.calls[1][0].data.subjectAr).toBeUndefined();
    await service.create("T1", { name: "6A", grade: 6, subject: "الأحياء" }, "ar");
    expect(db.classRoom.create.mock.calls[2][0].data).toMatchObject({ band: "NAVIGATOR", subjectAr: "الأحياء" });
    expect(db.classRoom.create.mock.calls[2][0].data.subjectEn).toBeUndefined();
  });

  it("a duplicate class name is a 409; other errors pass through", async () => {
    const { db, service } = setup();
    db.user.findUnique.mockResolvedValue(null);
    db.classRoom.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    await expect(service.create("T1", { name: "6B", grade: 6, subject: "Science" }, "en")).rejects.toMatchObject({ status: 409, detail: expect.stringContaining("6B") });
    expect(db.classRoom.create.mock.calls[0][0].data.schoolId).toBeNull();
    db.classRoom.create.mockRejectedValue(new Error("db down"));
    await expect(service.create("T1", { name: "6B", grade: 6, subject: "Science" }, "en")).rejects.toThrow("db down");
  });

  it("detail: students with badges, the weekly XP and lessons, all scoped to the teacher", async () => {
    const { db, lessons, service } = setup();
    db.classRoom.findFirst.mockResolvedValue(classRow());
    db.student.findMany.mockResolvedValue([{ id: "S1", fullName: "Sara Ahmed", displayName: "Sara A.", xp: 3340, streakDays: 4, badges: [{ badge: "PLANT_SCOUT" }, { badge: "NOT_A_BADGE" }] }]);
    db.lesson.findMany.mockResolvedValue([{ id: "L1" }]);
    db.xpEvent.aggregate.mockResolvedValue({ _sum: { amount: 380 } });
    const d = await service.detail("T1", "C1", "en");
    expect(db.classRoom.findFirst.mock.calls[0][0].where).toEqual({ id: "C1", teacherId: "T1" });
    expect(db.lesson.findMany.mock.calls[0][0].where).toEqual({ classId: "C1", teacherId: "T1" });
    expect(d).toMatchObject({ id: "C1", weekXp: 380, settings: { weeklyGoalXp: 500, pointsEnabled: true } });
    expect(d.students[0]).toMatchObject({ displayName: "Sara A.", fullName: "Sara Ahmed", level: 7, badges: ["PLANT_SCOUT"] });
    expect(d.lessons).toHaveLength(1);
    expect(lessons.summaries).toHaveBeenCalledWith([{ id: "L1" }], "en");
  });

  it("another teacher's class is a 404 everywhere", async () => {
    const { db, service } = setup();
    db.classRoom.findFirst.mockResolvedValue(null);
    await expect(service.detail("T2", "C1", "en")).rejects.toMatchObject({ status: 404 });
    await expect(service.updateSettings("T2", "C1", { weeklyGoalXp: 100 })).rejects.toMatchObject({ status: 404 });
    await expect(service.addStudents("T2", "C1", { names: ["Sara Ahmed"] })).rejects.toMatchObject({ status: 404 });
    expect(db.classRoom.update).not.toHaveBeenCalled();
    expect(db.student.create).not.toHaveBeenCalled();
    db.student.findFirst.mockResolvedValue(null);
    await expect(service.removeStudent("T2", "C1", "S1")).rejects.toMatchObject({ status: 404 });
    expect(db.student.findFirst.mock.calls[0][0].where).toEqual({ id: "S1", classId: "C1", classRoom: { teacherId: "T2" } });
    expect(db.student.delete).not.toHaveBeenCalled();
  });

  it("updates settings and returns only the settings", async () => {
    const { db, service } = setup();
    db.classRoom.findFirst.mockResolvedValue(classRow());
    db.classRoom.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => classRow(data));
    const out = await service.updateSettings("T1", "C1", { teamsEnabled: true, weeklyGoalXp: 800 });
    expect(db.classRoom.update).toHaveBeenCalledWith({ where: { id: "C1" }, data: { teamsEnabled: true, weeklyGoalXp: 800 } });
    expect(out).toEqual({ pointsEnabled: true, teamsEnabled: true, soundsEnabled: false, celebrationsEnabled: true, weeklyGoalXp: 800 });
  });

  it("adds students with a child-safe display name (first name + initial) and removes one", async () => {
    const { db, service } = setup();
    db.classRoom.findFirst.mockResolvedValue(classRow());
    db.student.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: `S-${data.fullName}`, xp: 0, streakDays: 0, badges: [], ...data }));
    const added = await service.addStudents("T1", "C1", { names: ["Sara Ahmed", "ali ben salah", "Noah"] });
    expect(added.map((s) => s.displayName)).toEqual(["Sara A.", "ali S.", "Noah"]);
    expect(added.map((s) => s.fullName)).toEqual(["Sara Ahmed", "ali ben salah", "Noah"]);
    expect(db.student.create.mock.calls.every((c: unknown[]) => (c[0] as { data: { classId: string } }).data.classId === "C1")).toBe(true);
    db.student.findFirst.mockResolvedValue({ id: "S1" });
    await service.removeStudent("T1", "C1", "S1");
    expect(db.student.delete).toHaveBeenCalledWith({ where: { id: "S1" } });
  });
});
