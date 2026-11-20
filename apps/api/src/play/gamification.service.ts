import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { BADGES, nextStreak, type BadgeKey } from "@helpo/shared";
import { schoolDay } from "../common/time";

export type Tx = Prisma.TransactionClient;

/** All XP, streak and badge writes. They run inside the caller's transaction so student.xp and XpEvent never drift. */
@Injectable()
export class GamificationService {
  async awardXp(tx: Tx, student: { id: string; classId: string }, amount: number, reason: string): Promise<void> {
    if (amount <= 0) return;
    await tx.xpEvent.create({ data: { studentId: student.id, classId: student.classId, amount, reason } });
    await tx.student.update({ where: { id: student.id }, data: { xp: { increment: amount } } });
  }

  /** Counts today as an active day; forgiving rules live in nextStreak(). */
  async touchStreak(tx: Tx, studentId: string, now = new Date()): Promise<void> {
    const s = await tx.student.findUnique({ where: { id: studentId }, select: { streakDays: true, streakSavers: true, lastActiveDay: true } });
    if (!s) return;
    const next = nextStreak({ days: s.streakDays, saversLeft: s.streakSavers, lastActiveDay: s.lastActiveDay }, schoolDay(now));
    if (next.days === s.streakDays && next.saversLeft === s.streakSavers && next.lastActiveDay === s.lastActiveDay) return;
    await tx.student.update({ where: { id: studentId }, data: { streakDays: next.days, streakSavers: next.saversLeft, lastActiveDay: next.lastActiveDay } });
  }

  /** Returns the badge when it is newly unlocked, null when the student already had it. */
  async unlock(tx: Tx, studentId: string, key: BadgeKey): Promise<{ key: BadgeKey; name: string } | null> {
    const has = await tx.studentBadge.findUnique({ where: { studentId_badge: { studentId, badge: key } } });
    if (has) return null;
    await tx.studentBadge.create({ data: { studentId, badge: key } });
    return { key, name: BADGES[key].name };
  }

  /** Retried-correct quiz answers (the "answer:retry" XP events). */
  retriedAnswers(tx: Tx, studentId: string): Promise<number> {
    return tx.xpEvent.count({ where: { studentId, reason: "answer:retry" } });
  }

  retriedGames(tx: Tx, studentId: string): Promise<number> {
    return tx.gameResult.count({ where: { studentId, retried: { gt: 0 } } });
  }
}
