import { mockPrisma } from "../testing/mock-prisma";
import { JoinService } from "./join.service";

const session = (over: Record<string, unknown> = {}) => ({ id: "SE1", classId: "C1", type: "LIVE_QUIZ", game: null, status: "LOBBY", joinCode: "123456", ...over });

function setup() {
  const db = mockPrisma();
  db.participant.upsert.mockResolvedValue({ id: "P1" });
  return { db, service: new JoinService(db) };
}

describe("JoinService", () => {
  it("lists a school's classes with what is live", async () => {
    const { db, service } = setup();
    db.school.findUnique.mockResolvedValue({ id: "SC1" });
    db.classRoom.findMany.mockResolvedValue([
      { id: "C1", name: "6B", grade: 6, teacher: { name: "Alex Green" } },
      { id: "C2", name: "6A", grade: 6, teacher: { name: "Alex Green" } },
    ]);
    db.activitySession.findMany.mockResolvedValue([{ id: "SE1", classId: "C1", type: "LIVE_QUIZ", game: null, joinCode: "482913", lesson: { titleEn: "Photosynthesis", titleAr: "التمثيل الضوئي" } }]);
    const out = await service.classesFor("riverside", 6, "ar");
    expect(out[0]).toMatchObject({ classId: "C1", className: "6B", live: { sessionId: "SE1", lessonTitle: "التمثيل الضوئي", joinCode: "482913" } });
    expect(out[1].live).toBeNull();
    expect(db.classRoom.findMany.mock.calls[0][0].where).toEqual({ schoolId: "SC1", grade: 6 });
    db.school.findUnique.mockResolvedValue(null);
    await expect(service.classesFor("nope", undefined, "en")).rejects.toMatchObject({ status: 404 });
  });

  it("lists students as child-safe names only", async () => {
    const { db, service } = setup();
    db.classRoom.findUnique.mockResolvedValue({ id: "C1" });
    db.student.findMany.mockResolvedValue([{ id: "S1", displayName: "Sara A." }]);
    expect(await service.studentsOf("C1")).toEqual([{ id: "S1", displayName: "Sara A." }]);
    expect(db.student.findMany.mock.calls[0][0].select).toEqual({ id: true, displayName: true });
    db.classRoom.findUnique.mockResolvedValue(null);
    await expect(service.studentsOf("X")).rejects.toMatchObject({ status: 404 });
  });

  it("finds the class for a join code, accepting a formatted code", async () => {
    const { db, service } = setup();
    db.activitySession.findFirst.mockResolvedValue({ ...session({ joinCode: "482913" }), classRoom: { id: "C1", name: "6B", grade: 6, teacher: { name: "Alex Green" } }, lesson: { titleEn: "Photosynthesis", titleAr: null } });
    expect(await service.byCode("482 913", "en")).toMatchObject({ classId: "C1", live: { sessionId: "SE1", joinCode: "482913" } });
    expect(db.activitySession.findFirst.mock.calls[0][0].where).toEqual({ joinCode: "482913", status: { not: "ENDED" } });
    await expect(service.byCode("12", "en")).rejects.toMatchObject({ status: 404 });
    db.activitySession.findFirst.mockResolvedValue(null);
    await expect(service.byCode("111111", "en")).rejects.toMatchObject({ status: 404 });
  });

  it("joins by code + student: participant created, next = quiz", async () => {
    const { db, service } = setup();
    db.activitySession.findFirst.mockResolvedValue(session());
    db.student.findFirst.mockResolvedValue({ id: "S1", displayName: "Sara A.", fullName: "Sara Ahmed" });
    const out = await service.join({ code: "123456", studentId: "S1" });
    expect(out).toMatchObject({ studentId: "S1", classId: "C1", result: { participantId: "P1", sessionId: "SE1", next: "quiz", displayName: "Sara A." } });
    expect(db.student.findFirst.mock.calls[0][0].where).toEqual({ id: "S1", classId: "C1" });
  });

  it("joins by class: a game session means next = game, no session means home", async () => {
    const { db, service } = setup();
    db.student.findFirst.mockResolvedValue({ id: "S1", displayName: "Sara A.", fullName: "Sara Ahmed" });
    db.activitySession.findFirst.mockResolvedValue(session({ type: "GAME" }));
    expect((await service.join({ classId: "C1", studentId: "S1" })).result.next).toBe("game");
    db.activitySession.findFirst.mockResolvedValue(null);
    const home = await service.join({ classId: "C1", studentId: "S1" });
    expect(home.result).toMatchObject({ next: "home", sessionId: null, participantId: "S1" });
    expect(db.participant.upsert).toHaveBeenCalledTimes(1);
  });

  it("rejects missing class, missing name, other-class students and unknown codes", async () => {
    const { db, service } = setup();
    await expect(service.join({ studentId: "S1" })).rejects.toMatchObject({ status: 400 });
    await expect(service.join({ classId: "C1" })).rejects.toMatchObject({ status: 400 });
    db.student.findFirst.mockResolvedValue(null);
    await expect(service.join({ classId: "C1", studentId: "S9" })).rejects.toMatchObject({ status: 404 });
    db.activitySession.findFirst.mockResolvedValue(null);
    await expect(service.join({ code: "999999", studentId: "S1" })).rejects.toMatchObject({ status: 404 });
    await expect(service.join({ code: "abc", studentId: "S1" })).rejects.toMatchObject({ status: 404 });
  });

  it("share-by-code: matches a student by child-safe name", async () => {
    const { db, service } = setup();
    db.activitySession.findFirst.mockResolvedValue(session());
    db.student.findFirst.mockResolvedValue({ id: "S1", displayName: "Sara A." });
    const out = await service.joinWithName("123456", "  sara   ahmed ");
    expect(out.studentId).toBe("S1");
    expect(db.student.findFirst.mock.calls[0][0].where).toEqual({ classId: "C1", displayName: { equals: "sara A.", mode: "insensitive" } });
    expect(db.student.create).not.toHaveBeenCalled();
    expect(out.result).toMatchObject({ next: "quiz", sessionId: "SE1" });
  });

  it("share-by-code: creates a student when there is no match, strips markup, caps class size", async () => {
    const { db, service } = setup();
    db.activitySession.findFirst.mockResolvedValue(session({ type: "ASSIGNMENT" }));
    db.student.findFirst.mockResolvedValue(null);
    db.student.count.mockResolvedValue(10);
    db.student.create.mockResolvedValue({ id: "S2", displayName: "Zed Q." });
    const out = await service.joinWithName("123456", "<b>Zed Quinn</b>");
    expect(db.student.create.mock.calls[0][0].data).toMatchObject({ classId: "C1", fullName: "bZed Quinn/b", displayName: expect.stringMatching(/^bZed/) });
    expect(out.result.next).toBe("game");
    db.student.count.mockResolvedValue(100);
    await expect(service.joinWithName("123456", "Late Comer")).rejects.toMatchObject({ status: 409 });
  });

  it("share-by-code: rejects bad codes and names without letters", async () => {
    const { db, service } = setup();
    await expect(service.joinWithName("zz", "Sara")).rejects.toMatchObject({ status: 404 });
    db.activitySession.findFirst.mockResolvedValue(null);
    await expect(service.joinWithName("123456", "Sara")).rejects.toMatchObject({ status: 404 });
    db.activitySession.findFirst.mockResolvedValue(session());
    await expect(service.joinWithName("123456", "1234 !!")).rejects.toMatchObject({ status: 400 });
  });
});
