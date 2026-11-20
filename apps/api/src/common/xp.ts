import type { PrismaClient } from "@prisma/client";
import { startOfIsoWeek } from "./time";

type Db = Pick<PrismaClient, "xpEvent">;

/** Weekly class goal progress = sum of XpEvent amounts in the current ISO week. */
export async function classWeekXp(db: Db, classId: string, now = new Date()): Promise<number> {
  const r = await db.xpEvent.aggregate({ where: { classId, createdAt: { gte: startOfIsoWeek(now) } }, _sum: { amount: true } });
  return r._sum.amount ?? 0;
}

export async function classesWeekXp(db: Db, classIds: string[], now = new Date()): Promise<Map<string, number>> {
  const rows = await db.xpEvent.groupBy({
    by: ["classId"],
    where: { classId: { in: classIds }, createdAt: { gte: startOfIsoWeek(now) } },
    _sum: { amount: true },
  });
  return new Map(rows.map((r) => [r.classId, r._sum.amount ?? 0]));
}
