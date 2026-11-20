import { mockPrisma } from "../testing/mock-prisma";
import { StudentsService } from "./students.service";

function setup() {
  const db = mockPrisma();
  db.student.findFirst.mockResolvedValue({ id: "S1" });
  return { db, service: new StudentsService(db) };
}

describe("StudentsService badges", () => {
  it("awards a teacher badge idempotently and only for the teacher's own students", async () => {
    const { db, service } = setup();
    expect(await service.award("T1", "S1", "KIND_HELPER")).toEqual({ badge: "KIND_HELPER" });
    expect(db.student.findFirst).toHaveBeenCalledWith({ where: { id: "S1", classRoom: { teacherId: "T1" } }, select: { id: true } });
    expect(db.studentBadge.upsert).toHaveBeenCalledWith({
      where: { studentId_badge: { studentId: "S1", badge: "KIND_HELPER" } },
      create: { studentId: "S1", badge: "KIND_HELPER", awardedBy: "T1" },
      update: {},
    });
  });

  it("another teacher's student is a 404 and nothing is written", async () => {
    const { db, service } = setup();
    db.student.findFirst.mockResolvedValue(null);
    await expect(service.award("T2", "S1", "KIND_HELPER")).rejects.toMatchObject({ status: 404 });
    await expect(service.revoke("T2", "S1", "KIND_HELPER")).rejects.toMatchObject({ status: 404 });
    expect(db.studentBadge.upsert).not.toHaveBeenCalled();
    expect(db.studentBadge.deleteMany).not.toHaveBeenCalled();
  });

  it("revoking removes a teacher-awarded badge but never a badge the system earned", async () => {
    const { db, service } = setup();
    await service.revoke("T1", "S1", "NEVER_GIVES_UP");
    expect(db.studentBadge.deleteMany).toHaveBeenCalledWith({ where: { studentId: "S1", badge: "NEVER_GIVES_UP" } });
    await expect(service.revoke("T1", "S1", "PLANT_SCOUT")).rejects.toMatchObject({ status: 400 });
    expect(db.studentBadge.deleteMany).toHaveBeenCalledTimes(1);
  });
});
