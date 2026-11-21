import { mockPrisma } from "../testing/mock-prisma";
import { MeService } from "./me.service";

const user = (over: Record<string, unknown> = {}) => ({ id: "T1", name: "Alex Green", email: "alex@x.test", locale: "en", school: null, ...over });

function setup() {
  const db = mockPrisma();
  return { db, service: new MeService(db) };
}

describe("MeService", () => {
  it("returns the signed-in teacher with the school and a valid locale", async () => {
    const { db, service } = setup();
    db.user.findUnique.mockResolvedValue(user({ locale: "ar", school: { id: "SC1", name: "Riverside Middle School", slug: "riverside-middle-school", createdAt: new Date() } }));
    expect(await service.get("T1")).toEqual({
      id: "T1",
      name: "Alex Green",
      email: "alex@x.test",
      locale: "ar",
      role: "TEACHER",
      school: { id: "SC1", name: "Riverside Middle School", slug: "riverside-middle-school" },
    });
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { id: "T1" }, include: { school: true } });
  });

  it("a teacher without a school has school null; an unknown stored locale falls back to English", async () => {
    const { db, service } = setup();
    db.user.findUnique.mockResolvedValue(user({ locale: "fr" }));
    expect(await service.get("T1")).toMatchObject({ school: null, locale: "en" });
  });

  it("exposes the role: ADMIN for admins, TEACHER for everyone else (including unknown stored values)", async () => {
    const { db, service } = setup();
    db.user.findUnique.mockResolvedValue(user({ role: "ADMIN" }));
    expect((await service.get("T1")).role).toBe("ADMIN");
    db.user.findUnique.mockResolvedValue(user({ role: "SUPERUSER" }));
    expect((await service.get("T1")).role).toBe("TEACHER");
    db.user.findUnique.mockResolvedValue(user());
    expect((await service.get("T1")).role).toBe("TEACHER");
  });

  it("an account that no longer exists is a 404", async () => {
    const { db, service } = setup();
    db.user.findUnique.mockResolvedValue(null);
    await expect(service.get("T1")).rejects.toMatchObject({ status: 404 });
  });

  it("setSchool creates the school by slug, or joins the existing one, then links the teacher", async () => {
    const { db, service } = setup();
    db.school.upsert.mockResolvedValue({ id: "SC1" });
    db.user.findUnique.mockResolvedValue(user({ school: { id: "SC1", name: "Riverside Middle School", slug: "riverside-middle-school" } }));
    const me = await service.setSchool("T1", "Riverside Middle School");
    expect(db.school.upsert).toHaveBeenCalledWith({
      where: { slug: "riverside-middle-school" },
      create: { name: "Riverside Middle School", slug: "riverside-middle-school" },
      update: {}, // joining keeps the existing school untouched
    });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "T1" }, data: { schoolId: "SC1" } });
    expect(me.school).toMatchObject({ slug: "riverside-middle-school" });
    await service.setSchool("T2", "  RIVERSIDE   middle school!! ");
    expect(db.school.upsert.mock.calls[1][0].where).toEqual({ slug: "riverside-middle-school" });
  });

  it("setLocale stores the preferred language and returns the updated profile", async () => {
    const { db, service } = setup();
    db.user.findUnique.mockResolvedValue(user({ locale: "ar" }));
    const me = await service.setLocale("T1", "ar");
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "T1" }, data: { locale: "ar" } });
    expect(me.locale).toBe("ar");
  });
});
