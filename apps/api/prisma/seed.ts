/**
 * Demo data: Riverside Middle School, teacher Alex Green, five classes, Unit 3 "Plants and energy" with a finished
 * live quiz, game results and XP. Idempotent: every block checks before it writes, so running it twice is safe.
 * Credentials are written ONLY to apps/api/.env and .local/demo-account.txt (both gitignored).
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { bandForGrade, childSafeName, type Locale, type QuizContent, type ResourceKind, type WorksheetContent } from "@helpo/shared";
import { createAuth } from "../src/auth/auth.factory";
import type { LessonContext } from "../src/ai/ai.provider";
import { PLANT_TITLE_AR, PLANT_TITLE_EN, DemoAiProvider } from "../src/ai/demo.provider";
import { countStatements } from "../src/ai/content";
import { schoolDay, startOfIsoWeek } from "../src/common/time";

const prisma = new PrismaClient();
const ai = new DemoAiProvider();
const KINDS: ResourceKind[] = ["SLIDES", "WORKSHEET", "QUIZ", "GAME", "CARDS"];
const DAY = 86_400_000;

const NAMES_6B = [
  "Sara Ahmed", "Fatma Trabelsi", "Lina Mansour", "Youssef Haddad", "Ali Ben Salah", "Omar Kacem", "Mia Lopez", "Adam Cherif", "Noah Brown",
  "Yasmine Gharbi", "Karim Jaziri", "Nour Bouazizi", "Hana Mejri", "Ines Ben Ammar", "Rayan Dridi", "Leila Sassi", "Mehdi Chaabane", "Emma Wilson",
  "Lucas Martin", "Salma Ferchichi", "Amine Khelifi", "Zeineb Hamdi", "Tarek Belhadj", "Jana Miled",
];
const FIRST = ["Aya", "Bilel", "Chaima", "Dali", "Eya", "Firas", "Ghada", "Hedi", "Imen", "Jawher", "Khadija", "Louay", "Maram", "Nizar", "Oumaima", "Prince", "Rim", "Sami", "Takwa", "Wael", "Yosra", "Zied"];
const LAST = ["Abid", "Baccouche", "Cherni", "Dhaouadi", "Essid", "Fourati", "Gabsi", "Hamza", "Jebali", "Kallel", "Landolsi", "Marzouki", "Nasri", "Ouerghi", "Rekik", "Souissi", "Tlili", "Zouari"];

const CLASSES = [
  { name: "6B", grade: 6, students: NAMES_6B },
  { name: "6A", grade: 6, students: generated(22, 1) },
  { name: "7C", grade: 7, students: generated(21, 5) },
  { name: "3A", grade: 3, students: generated(18, 9) },
  { name: "11S", grade: 11, students: generated(19, 13) },
];

function generated(n: number, offset: number): string[] {
  return Array.from({ length: n }, (_, i) => `${FIRST[(i + offset) % FIRST.length]} ${LAST[(i * 3 + offset) % LAST.length]}`);
}

/** Small deterministic PRNG so the seed produces the same numbers every run. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------ demo teacher ------------------------------ */

const ACCOUNT_FILE = path.join(__dirname, "..", "..", "..", ".local", "demo-account.txt");

/** Reads the password from the gitignored account file so a second run reuses it. */
function savedPassword(): string | null {
  if (!existsSync(ACCOUNT_FILE)) return null;
  return /^Password: (.+)$/m.exec(readFileSync(ACCOUNT_FILE, "utf8"))?.[1]?.trim() ?? null;
}

async function ensureTeacher(schoolId: string) {
  const email = "demo@helpo.test";
  // DEMO_PASSWORD (a secret service variable) lets a hosted seed use a known password without writing it anywhere.
  const hostedPassword = process.env.DEMO_PASSWORD?.trim() || null;
  let password = hostedPassword || savedPassword();
  const existing = await prisma.user.findUnique({ where: { email } });
  const auth = await createAuth(prisma);
  if (existing && hostedPassword) {
    // Make the stored credential match DEMO_PASSWORD (hash with Better Auth's own hasher).
    const ctx = await auth.$context;
    await prisma.account.updateMany({ where: { userId: existing.id, providerId: "credential" }, data: { password: await ctx.password.hash(hostedPassword) } });
    await prisma.user.update({ where: { id: existing.id }, data: { schoolId } });
    return existing.id;
  }
  if (existing && password) {
    await prisma.user.update({ where: { id: existing.id }, data: { schoolId } });
    return existing.id;
  }
  if (existing) await prisma.user.delete({ where: { id: existing.id } }); // password unknown: recreate cleanly
  password = hostedPassword || randomBytes(12).toString("base64url");
  const res = await auth.api.signUpEmail({ body: { name: "Alex Green", email, password } });
  await prisma.user.update({ where: { id: res.user.id }, data: { schoolId, locale: "en" } });
  // Hosted seeds take DEMO_PASSWORD from the secret store and write nothing to disk.
  if (process.env.DEMO_PASSWORD) return res.user.id;
  mkdirSync(path.dirname(ACCOUNT_FILE), { recursive: true });
  writeFileSync(ACCOUNT_FILE, `Nibras demo teacher\nEmail: ${email}\nPassword: ${password}\n`);
  return res.user.id;
}

/* --------------------------------- lessons --------------------------------- */

const LESSONS = [
  { n: 1, en: "What plants need to live", ar: "ما تحتاجه النباتات لتعيش", avg: 0.88, daysAgo: 21 },
  { n: 2, en: "Parts of a plant", ar: "أجزاء النبات", avg: 0.84, daysAgo: 14 },
  { n: 3, en: "Water and nutrients in plants", ar: "الماء والعناصر الغذائية في النبات", avg: 0.79, daysAgo: 7 },
  { n: 4, en: PLANT_TITLE_EN, ar: PLANT_TITLE_AR, avg: 0.74, daysAgo: 1 },
];

function ctxFor(title: string, locale: Locale, grade: number): LessonContext {
  return { title, grade, band: bandForGrade(grade), locale, language: locale === "ar" ? "Arabic (Modern Standard Arabic)" : "English", durationMin: 45, standard: "NGSS MS-LS1-6", objectives: [], sourceText: "", description: null };
}

async function seedLesson(teacherId: string, classId: string, grade: number, spec: (typeof LESSONS)[number]) {
  const existing = await prisma.lesson.findFirst({ where: { teacherId, classId, lessonNumber: spec.n, unitTitleEn: "Plants and energy" }, select: { id: true } });
  if (existing) return null;

  const en = ctxFor(spec.en, "en", grade);
  const ar = ctxFor(spec.ar, "ar", grade);
  const planEn = await ai.analyze(en);
  const planAr = await ai.analyze(ar);
  en.objectives = planEn.objectives;
  ar.objectives = planAr.objectives;
  const contents = new Map<ResourceKind, { en: unknown; ar: unknown }>();
  for (const k of KINDS) contents.set(k, { en: (await ai.generateResource(k, en)).content, ar: (await ai.generateResource(k, ar)).content });
  const started = new Date(Date.now() - spec.daysAgo * DAY - 3600_000);

  const lesson = await prisma.lesson.create({
    data: {
      teacherId,
      classId,
      titleEn: spec.en,
      titleAr: spec.ar,
      unitTitleEn: "Plants and energy",
      unitTitleAr: "النباتات والطاقة",
      lessonNumber: spec.n,
      descriptionEn: planEn.summary,
      descriptionAr: planAr.summary,
      standard: planEn.standard,
      blueprint: planEn as unknown as Prisma.InputJsonValue,
      approvedAt: new Date(started.getTime() + 120_000),
      objectivesEn: planEn.objectives as unknown as Prisma.InputJsonValue,
      objectivesAr: planAr.objectives as unknown as Prisma.InputJsonValue,
      contentLocale: "en",
      translationStatus: { en: "ready", ar: "ready" },
      requestedKinds: KINDS,
      status: "READY",
      generationStartedAt: started,
      generationFinishedAt: new Date(started.getTime() + 47_000),
      createdAt: started,
      resources: {
        create: KINDS.map((kind) => ({
          kind,
          status: "READY" as const,
          contentEn: contents.get(kind)!.en as Prisma.InputJsonValue,
          contentAr: contents.get(kind)!.ar as Prisma.InputJsonValue,
          promptVersion: `${kind.toLowerCase()}.v1`,
          model: "demo",
          progress: 100,
          versions: { create: { version: 1, source: "AI", contentEn: contents.get(kind)!.en as Prisma.InputJsonValue, contentAr: contents.get(kind)!.ar as Prisma.InputJsonValue } },
        })),
      },
    },
  });

  if (spec.n === 4) {
    const quizEn = contents.get("QUIZ")!.en as QuizContent;
    const quizAr = contents.get("QUIZ")!.ar as QuizContent;
    const sheetEn = contents.get("WORKSHEET")!.en as WorksheetContent;
    const sheetAr = contents.get("WORKSHEET")!.ar as WorksheetContent;
    const total = countStatements("QUIZ", quizEn) + countStatements("WORKSHEET", sheetEn);
    const checksEn = await ai.generateChecks(en, { QUIZ: quizEn, WORKSHEET: sheetEn });
    const checksAr = await ai.generateChecks(ar, { QUIZ: quizAr, WORKSHEET: sheetAr });
    await prisma.aiCheck.createMany({
      data: checksEn.map((c, i) => ({
        lessonId: lesson.id,
        resource: c.resource,
        itemRef: c.itemRef,
        kind: c.kind,
        messageEn: c.message,
        messageAr: checksAr[i]?.message ?? null,
        suggestionEn: c.suggestion,
        suggestionAr: checksAr[i]?.suggestion ?? null,
        sourcePage: c.sourcePage,
      })),
    });
    await prisma.lesson.update({ where: { id: lesson.id }, data: { totalStatements: total, tracedStatements: total - checksEn.length } });
  }
  return { lesson, quiz: quizOf(contents) };
}

function quizOf(contents: Map<ResourceKind, { en: unknown; ar: unknown }>): QuizContent {
  return contents.get("QUIZ")!.en as QuizContent;
}

/** Spreads `totalCorrect` over the questions (or uses explicit per-question counts). */
function correctCounts(nQ: number, n: number, totalCorrect: number, explicit?: number[]): number[] {
  if (explicit) return explicit;
  return Array.from({ length: nQ }, (_, q) => Math.min(n, Math.floor(totalCorrect / nQ) + (q < totalCorrect % nQ ? 1 : 0)));
}

const L4_CORRECT = [19, 18, 17, 9, 18, 17, 13, 16, 17, 19]; // Q4 = 41%, Q7 = 59%, average 74%

async function seedQuizSession(
  lessonId: string,
  classId: string,
  quiz: QuizContent,
  students: { id: string; displayName: string }[],
  spec: (typeof LESSONS)[number],
  code: string,
) {
  const rand = mulberry32(100 + spec.n);
  const answering = spec.n === 4 ? students.filter((s) => s.displayName !== "Adam C." && s.displayName !== "Noah B.") : students;
  const nQ = quiz.questions.length;
  const counts = correctCounts(nQ, answering.length, Math.round(spec.avg * answering.length * nQ), spec.n === 4 ? L4_CORRECT : undefined);
  const ended = new Date(Date.now() - spec.daysAgo * DAY);
  const session = await prisma.activitySession.create({
    data: {
      lessonId,
      classId,
      type: "LIVE_QUIZ",
      status: "ENDED",
      joinCode: code,
      namesHidden: true,
      currentQuestion: nQ - 1,
      revealed: true,
      startedAt: new Date(ended.getTime() - 25 * 60_000),
      endedAt: ended,
      createdAt: new Date(ended.getTime() - 30 * 60_000),
    },
  });
  const participants = await Promise.all(
    answering.map((s) => prisma.participant.create({ data: { sessionId: session.id, studentId: s.id, displayName: s.displayName, joinedAt: new Date(ended.getTime() - 28 * 60_000) } })),
  );
  // Weakness: two students struggle, the rest vary a little, so wrong answers cluster realistically.
  const weak = answering.map((_, i) => (i === 5 || i === 14 ? 2 : 0));
  const rows: Prisma.AnswerCreateManyInput[] = [];
  quiz.questions.forEach((q, qi) => {
    const wrong = answering.length - counts[qi];
    const order = answering.map((_, i) => ({ i, score: weak[i] + rand() * 1.4 })).sort((a, b) => b.score - a.score);
    const wrongSet = new Set(order.slice(0, wrong).map((o) => o.i));
    answering.forEach((_, i) => {
      const ok = !wrongSet.has(i);
      let optionIndex: number | null = null;
      let text: string | null = null;
      if (q.type === "short") text = ok ? (q.acceptedAnswers?.[0] ?? "") : "I am not sure";
      else {
        const opts = q.options ?? [];
        const right = Math.max(0, opts.findIndex((o) => o.correct));
        const wrongs = opts.map((_, k) => k).filter((k) => k !== right);
        optionIndex = ok ? right : wrongs[rand() < 0.7 ? 0 : Math.floor(rand() * wrongs.length)];
      }
      rows.push({
        sessionId: session.id,
        participantId: participants[i].id,
        questionIndex: qi,
        optionIndex,
        text,
        correct: ok,
        xpAwarded: 0,
        createdAt: new Date(ended.getTime() - (20 - qi) * 60_000),
      });
    });
  });
  await prisma.answer.createMany({ data: rows });
}

/* -------------------------- XP, streaks, game results -------------------------- */

async function seedGamification(classId: string, lessonId: string, students: { id: string }[]) {
  const already = await prisma.xpEvent.count({ where: { classId } });
  if (already > 0) return;
  const now = Date.now();
  const weekStart = startOfIsoWeek(new Date()).getTime();
  const today = schoolDay();
  const yesterday = schoolDay(new Date(now - DAY));
  // [student index, xp, game, stars, firstTry, retried]
  const weekly: [number, number, "MATCH" | "SORT" | "EQUATION", number, number, number][] = [
    [0, 75, "MATCH", 3, 7, 0],
    [0, 45, "SORT", 2, 5, 2],
    [1, 60, "MATCH", 2, 5, 2],
    [2, 55, "EQUATION", 2, 5, 2],
    [3, 40, "SORT", 1, 4, 3],
    [4, 30, "MATCH", 1, 3, 4],
    [5, 25, "SORT", 1, 3, 4],
    [6, 50, "MATCH", 2, 5, 2],
  ]; // sums to 380
  const weekXp = new Map<number, number>();
  for (const [i, xp] of weekly) weekXp.set(i, (weekXp.get(i) ?? 0) + xp);
  const rand = mulberry32(7);
  for (let i = 0; i < students.length; i++) {
    const total = i === 0 ? 3340 : 350 + Math.floor(rand() * 2100);
    const thisWeek = weekXp.get(i) ?? 0;
    const streak = i === 0 ? 4 : Math.floor(rand() * 4);
    await prisma.student.update({
      where: { id: students[i].id },
      data: { xp: total, streakDays: streak, streakSavers: 1, lastActiveDay: i === 0 || i < 8 ? today : streak > 0 ? yesterday : null },
    });
    await prisma.xpEvent.create({
      data: { studentId: students[i].id, classId, amount: total - thisWeek, reason: "seed:history", createdAt: new Date(weekStart - 14 * DAY) },
    });
  }
  for (const [k, [i, xp, game, stars, first, retried]] of weekly.entries()) {
    const at = new Date(Math.max(weekStart, now - (k + 1) * 3_600_000));
    await prisma.xpEvent.create({ data: { studentId: students[i].id, classId, amount: xp, reason: `game:${game.toLowerCase()}`, createdAt: at } });
    await prisma.gameResult.create({ data: { studentId: students[i].id, lessonId, game, stars, xp, total: 7, firstTry: first, retried, createdAt: at } });
  }
  await prisma.studentBadge.createMany({
    data: [
      { studentId: students[0].id, badge: "PLANT_SCOUT" },
      { studentId: students[0].id, badge: "KIND_HELPER" },
      { studentId: students[1].id, badge: "WORD_WIZARD" },
    ],
    skipDuplicates: true,
  });
}

/* ----------------------------------- main ----------------------------------- */

async function main() {
  const school = await prisma.school.upsert({ where: { slug: "riverside" }, create: { name: "Riverside Middle School", slug: "riverside" }, update: { name: "Riverside Middle School" } });
  const teacherId = await ensureTeacher(school.id);

  for (const c of CLASSES) {
    const cls = await prisma.classRoom.upsert({
      where: { teacherId_name: { teacherId, name: c.name } },
      create: { teacherId, schoolId: school.id, name: c.name, grade: c.grade, band: bandForGrade(c.grade), subjectEn: "Science", subjectAr: "العلوم", weeklyGoalXp: 500 },
      update: { schoolId: school.id, grade: c.grade, band: bandForGrade(c.grade), subjectAr: "العلوم" },
    });
    if ((await prisma.student.count({ where: { classId: cls.id } })) === 0) {
      await prisma.student.createMany({ data: c.students.map((fullName) => ({ classId: cls.id, fullName, displayName: childSafeName(fullName) })) });
    }
  }

  const cls6b = await prisma.classRoom.findUniqueOrThrow({ where: { teacherId_name: { teacherId, name: "6B" } } });
  const students = await prisma.student.findMany({ where: { classId: cls6b.id }, orderBy: { createdAt: "asc" }, select: { id: true, fullName: true, displayName: true } });
  // createMany keeps insertion order only loosely; sort to the roster order so "Sara Ahmed" is index 0.
  students.sort((a, b) => NAMES_6B.indexOf(a.fullName) - NAMES_6B.indexOf(b.fullName));

  let lesson4 = "";
  for (const spec of LESSONS) {
    const made = await seedLesson(teacherId, cls6b.id, cls6b.grade, spec);
    const lessonId = made?.lesson.id ?? (await prisma.lesson.findFirstOrThrow({ where: { teacherId, classId: cls6b.id, lessonNumber: spec.n }, select: { id: true } })).id;
    if (spec.n === 4) lesson4 = lessonId;
    if (made) await seedQuizSession(made.lesson.id, cls6b.id, made.quiz, students, spec, String(480_900 + spec.n * 37));
  }
  await seedGamification(cls6b.id, lesson4, students);
  console.log("Seed complete: school riverside, teacher Alex Green, 5 classes, Unit 3 lessons L1 to L4.");
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
