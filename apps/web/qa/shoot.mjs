// QA harness: mocks the API, opens each screen in EN and AR at several sizes, saves screenshots and checks page scroll.
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("C:/Users/A/AppData/Roaming/npm/node_modules/@playwright/mcp/");
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://localhost:3000";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(OUT.replace("out/", "mobile/"), { recursive: true });

const now = new Date().toISOString();
const slides = { deckTitle: "Photosynthesis", slides: [
  { layout: "title", title: "Photosynthesis", bullets: ["How plants make their own food"], speakerNotes: "Welcome the class.", imagePrompt: null, emoji: "🌱", objectiveCodes: ["O1"] },
  { layout: "bullets", title: "What plants need", bullets: ["Sunlight", "Water", "Carbon dioxide"], speakerNotes: "Ask what plants eat.", imagePrompt: null, emoji: "☀️", objectiveCodes: ["O1"] },
  { layout: "process", title: "The steps", bullets: ["Roots take in water", "Leaves catch light", "Sugar is made"], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: ["O2"] },
  { layout: "definition", title: "Chlorophyll", bullets: ["The green part of the leaf that catches sunlight."], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: ["O2"] },
  { layout: "summary", title: "Remember", bullets: ["Plants make food", "They need light"], speakerNotes: "", imagePrompt: null, emoji: null, objectiveCodes: ["O1"] },
] };
const worksheet = { title: "Photosynthesis worksheet", instructions: "Answer each question.", totalPoints: 12, sections: [
  { type: "mcq", heading: "Choose the answer", level: "core", objectiveCode: "O1", items: [{ prompt: "What do plants need to make food?", options: ["Light", "Candy", "Plastic"], answer: "Light", points: 2 }] },
  { type: "fill", heading: "Fill the gap", level: "support", objectiveCode: "O2", items: [{ prompt: "Plants take in ____ through roots.", options: null, answer: "water", points: 2 }] },
] };
const quiz = { questions: Array.from({ length: 6 }, (_, i) => ({ id: `Q${i + 1}`, type: i % 3 === 0 ? "tf" : "mcq", prompt: i % 3 === 0 ? "Plants get their food from the soil." : `Which part of a plant catches light? (${i + 1})`, options: i % 3 === 0 ? [{ text: "True", correct: false }, { text: "False", correct: true }] : [{ text: "Leaf", correct: true }, { text: "Root", correct: false }, { text: "Stem", correct: false }, { text: "Seed", correct: false }], acceptedAnswers: null, pairs: null, explanation: "Leaves hold chlorophyll.", concept: "Chlorophyll", objectiveCode: "O1", difficulty: "easy", timeLimitSec: 30 })) };
const pairs = [["Roots", "Take in water"], ["Leaf", "Makes food"], ["Stem", "Carries water"], ["Flower", "Makes seeds"], ["Seed", "Grows a new plant"], ["Sun", "Gives energy"]].map(([left, right]) => ({ left, right }));
const game = { type: "matching", title: "Plant parts", instructions: "Match each part.", timeLimitSec: 90, pairs, gridSize: 12,
  sortBaskets: { yes: "Plants need", no: "Plants don't need" },
  sortItems: [["Sunlight", true], ["Water", true], ["Carbon dioxide", true], ["Soil minerals", true], ["Candy", false], ["Darkness", false], ["Plastic", false]].map(([label, belongsInYes]) => ({ label, belongsInYes })),
  equationTiles: ["carbon dioxide", "+", "water", "->", "glucose", "+", "oxygen"],
  statements: [{ text: "Plants make their own food.", isTrue: true, explanation: "They use light." }, { text: "Roots make seeds.", isTrue: false, explanation: "Flowers make seeds." }, { text: "Leaves catch light.", isTrue: true, explanation: "Chlorophyll is in leaves." }, { text: "Plants eat soil.", isTrue: false, explanation: "They make food." }, { text: "Water goes up the stem.", isTrue: true, explanation: "Stems carry water." }] };
const cards = { cards: Array.from({ length: 8 }, (_, i) => ({ front: `Term ${i + 1}`, back: `Meaning of term ${i + 1}`, emoji: "🌿", tag: "concept", concept: "c", objectiveCode: "O1" })) };
const res = (kind, content, extra = {}) => ({ id: `r-${kind}`, kind, status: "READY", error: null, content, contentLocale: "en", translations: { en: "ready", ar: "ready" }, updatedAt: now, version: 1, progress: 100, promptVersion: "v1", model: "m", tokensIn: 1, tokensOut: 1, ...extra });
const lesson = {
  id: "l1", classId: "c1", className: "6B", title: "Photosynthesis: how plants make food", unitTitle: "Plants and energy", lessonNumber: 4, status: "READY", openChecks: 2, createdAt: now, averageScore: 0.74,
  durationMin: 45, language: "English", standard: "NGSS MS-LS1-6", objectives: [{ code: "O1", text: "Understand that plants make food.", bloom: "understand", sourcePage: 4 }], sourceFileName: "Plants_Unit3.pdf", sourceChars: 9000, band: "NAVIGATOR", grade: 6,
  resources: [res("SLIDES", slides), res("WORKSHEET", worksheet), res("QUIZ", quiz), res("GAME", game), res("CARDS", cards)],
  checks: [
    { id: "k1", resource: "QUIZ", itemRef: "Q1", kind: "FACT_CHECK", message: "The key says False. Check the wording.", suggestion: "Plants make their own food.", sourcePage: 6, status: "OPEN" },
    { id: "k2", resource: "SLIDES", itemRef: "S2", kind: "READING_LEVEL", message: "Reading level is grade 8.", suggestion: null, sourcePage: null, status: "OPEN" },
  ],
  trace: { traced: 41, total: 44 }, generation: { startedAt: now, finishedAt: now, seconds: 38 }, blueprint: null, prompt: null, aiWritten: false, detectedLanguage: "en", tokenCount: 1200, approvedAt: null, quota: { used: 3, limit: 100 }, source: null, contentLocale: "en", translations: { en: "ready", ar: "ready" },
};
const summaries = ["Photosynthesis", "The water cycle", "Food chains", "States of matter", "Fractions", "Solar system"].map((title, i) => ({ id: i === 0 ? "l1" : `l${i + 1}`, classId: "c1", className: "6B", title, unitTitle: null, lessonNumber: i + 1, status: "READY", openChecks: 0, createdAt: new Date(Date.now() - i * 86400000 * 3).toISOString(), averageScore: i % 2 ? 0.8 : null }));
const students = ["Sara A.", "Omar K.", "Mia L.", "Ali B."].map((n, i) => ({ id: `s${i}`, displayName: n, fullName: n.replace(".", "yed"), xp: 100, level: 2, streakDays: 1, badges: [] }));
const results = { lessonId: "l1", sessionId: "se1", answered: 22, classSize: 24, average: 0.74,
  mastery: [{ code: "O1", text: "Understand", bloom: "understand", value: 0.68 }, { code: "O2", text: "Remember", bloom: "remember", value: 0.85 }],
  questions: quiz.questions.map((q, i) => ({ index: i, id: q.id, prompt: q.prompt, objectiveCode: "O1", percent: 0.5 + i * 0.08 })), misconception: { questionIndex: 0, prompt: "x", percent: 0.4, note: "9 students chose True." },
  grid: students.map((s, i) => ({ participantId: `p${i}`, name: s.displayName, score: 0.7, cells: ["correct", "wrong", "correct", "none", "partial", "correct"] })), needsHelp: [{ participantId: "p1", studentId: "s1", name: "Omar K.", score: 0.4, missed: ["Q2"] }], notSubmitted: [{ studentId: "s2", name: "Mia L." }], gameInsights: [{ game: "MATCH", plays: 20, averageStars: 2.4 }], classGoal: { goalXp: 500, earnedXp: 380 } };
const live = { sessionId: "se1", type: "LIVE_QUIZ", game: null, lessonTitle: "Photosynthesis" };

function mock(page, state) {
  return page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname.replace("/api", "");
    const method = route.request().method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (p === "/me") return json({ id: "u1", name: "Alex Green", email: "a@b.c", school: { id: "s", name: "Riverside", slug: "riverside" }, locale: "en", role: "ADMIN" });
    if (p === "/demo/accounts") return json([{ key: "teacher", label: "Teacher", labelAr: "معلّم", description: "Make lessons and share them", descriptionAr: "أنشئ دروسًا وشاركها", email: "teacher@demo.nibras.app", next: "/app" }, { key: "student", label: "Student", labelAr: "طالب", description: "Play a live quiz", descriptionAr: "العب اختبارًا مباشرًا", email: null, next: "/join?code=202020" }, { key: "admin", label: "Admin", labelAr: "مدير", description: "See the platform", descriptionAr: "شاهد المنصة", email: "admin@demo.nibras.app", next: "/admin" }]);
    if (p === "/admin/overview") return json({ totals: { schools: 1, teachers: 3, classes: 5, students: 62, lessons: 18, sessions: 11, answers: 940 }, lessonsByStatus: { READY: 14, PARTIAL: 2, FAILED: 2 }, ai: { resources: 90, tokensIn: 120000, tokensOut: 340000, byModel: [{ model: "claude-sonnet", resources: 70, tokensIn: 90000, tokensOut: 250000 }, { model: "claude-haiku", resources: 20, tokensIn: 30000, tokensOut: 90000 }] }, recentLessons: Array.from({ length: 12 }, (_, i) => ({ id: `l${i}`, title: `Lesson ${i + 1}: a long title about plants and energy`, teacherName: "Alex Green", status: "READY", createdAt: now })), recentSessions: Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, type: "LIVE_QUIZ", joinCode: "202020", status: "CLOSED", joined: 20, createdAt: now })), runtime: { queueDriver: "bullmq", realtime: "socket.io", aiMode: "claude", demoLogin: true } });
    if (p === "/classes" && method === "GET") return json([{ id: "c1", name: "6B", grade: 6, subject: "Science", band: "NAVIGATOR", studentCount: 24 }]);
    if (p === "/classes/c1") return json({ id: "c1", name: "6B", grade: 6, subject: "Science", band: "NAVIGATOR", studentCount: 4, settings: { pointsEnabled: true, teamsEnabled: false, soundsEnabled: false, celebrationsEnabled: true, weeklyGoalXp: 500 }, students, weekXp: 380, lessons: summaries });
    if (p === "/lessons" && method === "GET") return json(summaries);
    if (p === "/lessons/l1") return json(lesson);
    if (p === "/lessons/l1/results") return json(results);
    if (p === "/join/schools/riverside/classes") return json([{ classId: "c1", className: "6B", grade: 6, teacherName: "Alex Green", live: state.live ? live : null }]);
    if (p === "/join/classes/c1/students") return json(students.map((s) => ({ id: s.id, displayName: s.displayName })));
    if (p === "/join" && method === "POST") return json({ participantId: "pp", displayName: "Sara A.", sessionId: "se1", next: state.next });
    if (p.startsWith("/play/code/")) return json({ classId: "c1", className: "6B", grade: 6, teacherName: "Alex", live });
    if (p === "/play/games") return json([{ lessonId: "l1", lessonTitle: "Photosynthesis", game: "MATCH", bestStars: 2, assigned: true }]);
    if (p.startsWith("/play/games/l1/")) return json({ lessonId: "l1", lessonTitle: "Photosynthesis", game: p.split("/").pop(), content: game, bestStars: 0 });
    if (p === "/play/games/result") return json({ stars: 3, xp: 60, personalBest: true, totalXp: 400, level: 7, xpIntoLevel: 400, badgeUnlocked: null, classGoal: { goalXp: 500, earnedXp: 440 } });
    if (p === "/play/me") return json({ displayName: "Sara A.", className: "6B", band: state.band || "NAVIGATOR", xp: 340, level: 7, levelTitle: "Plant Scout", xpIntoLevel: 340, xpForNextLevel: 500, streak: { days: 4, saversLeft: 1, message: "4-day streak" }, quests: [], badges: [], classGoal: { goalXp: 500, earnedXp: 380 }, live, journey: [], avatar: { items: [], background: "lavender", unlocked: [] }, settings: { pointsEnabled: true, teamsEnabled: false, soundsEnabled: false, celebrationsEnabled: true, weeklyGoalXp: 500 }, locale: "en" });
    if (p === "/play/sessions/se1" && method === "GET") return json({ sessionId: "se1", status: "LIVE", lessonTitle: "Photosynthesis", questionIndex: 3, questionCount: 10, question: { prompt: "True or false: plants get their food from the soil.", options: ["True", "False"], type: "true_false" }, myAnswer: state.answered ? { optionIndex: 1, text: null } : null, revealed: null });
    if (p.endsWith("/answers")) { state.answered = true; return json({ sessionId: "se1", status: "LIVE", lessonTitle: "Photosynthesis", questionIndex: 3, questionCount: 10, question: { prompt: "True or false: plants get their food from the soil.", options: ["True", "False"], type: "true_false" }, myAnswer: { optionIndex: 1, text: null }, revealed: null }); }
    if (p.startsWith("/resources/") && p.endsWith("/share")) return json({ id: "se1", link: BASE + "/join?code=482913", qrSvg: "", isOpen: true, expiresAt: new Date(Date.now() + 86400000).toISOString(), leaderboard: "TEAMS", lessonId: "l1", type: "LIVE_QUIZ", game: null, status: "LOBBY", joinCode: "482913", namesHidden: true, currentQuestion: 0, questionCount: 6, revealed: false, joined: 0, classSize: 24, answeredCurrent: 0, notAnswered: [], question: null, distribution: null });
    if (p.endsWith("/locale")) return json({ ok: true });
    return json({}, 404);
  });
}

const SIZES = [
  { name: "tablet1024", w: 1024, h: 768 },
  { name: "mobile320", w: 320, h: 568 },
  { name: "desktop", w: 1440, h: 900 },
  { name: "laptop", w: 1280, h: 720 },
  { name: "mobile390", w: 390, h: 844 },
  { name: "mobile360", w: 360, h: 740 },
];

const results_log = [];

async function scan(page, label) {
  const r = await page.evaluate(() => {
    const e = document.scrollingElement;
    const wide = [...document.querySelectorAll("body *")].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.right > innerWidth + 1 && getComputedStyle(el).position !== "fixed" && !el.closest("[class*=strip], .tabs, .track, .gridscroll, .ws-head, .prev-strip"); }).slice(0, 3).map((el) => el.className.toString().slice(0, 40));
    return { sh: e.scrollHeight, ih: innerHeight, sw: e.scrollWidth, iw: innerWidth, wide };
  });
  const ok = r.sh <= r.ih + 1 && r.sw <= r.iw + 1;
  results_log.push(`${ok ? "PASS" : "FAIL"} ${label}: scrollHeight ${r.sh}/${r.ih} scrollWidth ${r.sw}/${r.iw}${r.wide.length ? " wide:" + r.wide.join(",") : ""}`);
}

const browser = await chromium.launch({ executablePath: "C:/Users/A/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe" });
async function run(size, lang, fn, name, state = {}) {
  const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1, hasTouch: size.w < 500 });
  await ctx.addCookies([
    { name: "helpo_locale", value: lang, url: BASE },
    { name: "better-auth.session_token", value: "x", url: BASE },
  ]);
  if (state.rail) await ctx.addInitScript((v) => localStorage.setItem("helpo:rail", v), state.rail);
  await ctx.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'nextjs-portal{display:none!important}'; document.head.appendChild(st); }); });
  const page = await ctx.newPage();
  await mock(page, state);
  page.on("pageerror", (e) => results_log.push(`PAGEERROR ${name} ${lang} ${size.name}: ${e.message.slice(0, 120)}`));
  try {
    await fn(page, state);
    const dir = size.w < 500 ? OUT.replace("out/", "mobile/") : OUT;
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}${name}-${lang}-${size.name}.png` });
    await scan(page, `${name} ${lang} ${size.name}`);
    if (size.w >= 1024 && name === "create" || name === "create-railcollapsed") {
      const box = await page.locator("aside.rail").boundingBox();
      const onRight = box.x > size.w / 2;
      results_log.push(`${(lang === "ar") === onRight ? "PASS" : "FAIL"} rail side ${name} ${lang} ${size.name}: x=${Math.round(box.x)} w=${Math.round(box.width)}`);
    }
  } catch (e) {
    results_log.push(`ERROR ${name} ${lang} ${size.name}: ${String(e.message).slice(0, 160)}`);
  }
  await ctx.close();
}

const only = process.argv[2];
async function hit(p, which) {
  const mobile = (p.viewportSize()?.width ?? 1000) <= 900;
  if (!mobile) {
    if (which === "board") return p.locator(".ws-controls .tool", { hasText: /Whiteboard|السبورة/ }).click();
    if (which === "share") return p.locator(".ws-actions .btn:not(.sec)").click();
    return p.locator(".ws-edit .btn", { hasText: /Results|النتائج/ }).click();
  }
  if (which === "board") return p.locator(".ws-bar .tool.mob").nth(2).click();
  if (which === "share") return p.locator(".ws-bar .tool.mob").nth(3).click({ force: true });
  await p.locator(".ws-bar .tool.mob").nth(1).click();
  await p.waitForSelector(".app-dlg");
  await p.locator(".app-dlg .btn", { hasText: /Results|النتائج/ }).first().click();
}

const screens = {
  login: async (p) => { await p.goto(`${BASE}/login`); await p.waitForSelector(".authcard"); },
  signup: async (p) => { await p.goto(`${BASE}/signup`); await p.waitForSelector(".authcard"); },
  joincode: async (p) => { await p.goto(`${BASE}/join?code=395550`); await p.waitForSelector(".code-chip"); await p.fill("#join-name", "Sara A."); },
  joinnocode: async (p) => { await p.goto(`${BASE}/join`); await p.waitForSelector("#join-code"); },
  create: async (p) => { await p.goto(`${BASE}/app`); await p.waitForSelector(".create", { timeout: 20000 }); await p.waitForSelector(".prev-strip"); },
  workspace: async (p) => { await p.goto(`${BASE}/app/lessons/l1`); await p.waitForSelector(".ws-center .sl, .ws-center .doc", { timeout: 20000 }); },
  "ws-quiz": async (p) => { await p.goto(`${BASE}/app/lessons/l1?tab=quiz`); await p.waitForSelector(".ws-head"); await p.getByRole("tab").nth(2).click(); await p.waitForSelector(".ws-center .doc"); },
  "ws-game": async (p) => { await p.goto(`${BASE}/app/lessons/l1`); await p.waitForSelector(".ws-head"); await p.getByRole("tab").nth(3).click(); await p.waitForSelector(".mg"); },
  "ws-cards": async (p) => { await p.goto(`${BASE}/app/lessons/l1`); await p.waitForSelector(".ws-head"); await p.getByRole("tab").nth(4).click(); await p.waitForSelector(".cards3"); },
  "ws-worksheet": async (p) => { await p.goto(`${BASE}/app/lessons/l1`); await p.waitForSelector(".ws-head"); await p.getByRole("tab").nth(1).click(); await p.waitForSelector(".doc"); },
  board: async (p) => {
    await p.goto(`${BASE}/app/lessons/l1`); await p.waitForSelector(".ws-head");
    await hit(p, "board"); await p.waitForSelector(".board-canvas");
    const b = await p.locator(".board-canvas").boundingBox();
    await p.mouse.move(b.x + 40, b.y + 60); await p.mouse.down();
    for (let i = 0; i < 30; i++) await p.mouse.move(b.x + 40 + i * 8, b.y + 60 + Math.sin(i / 3) * 30);
    await p.mouse.up();
  },
  share: async (p) => { await p.goto(`${BASE}/app/lessons/l1`); await p.waitForSelector(".ws-head"); await hit(p, "share"); await p.waitForSelector(".share-choices"); await p.locator(".share-choice").first().click(); await p.getByRole("button", { name: /Share anyway|شارك على أي حال/ }).click(); await p.waitForSelector(".share-code"); },
  results: async (p) => { await p.goto(`${BASE}/app/lessons/l1`); await p.waitForSelector(".ws-head"); await hit(p, "results"); await p.waitForSelector(".app-dlg .grid2"); },
  join: async (p) => { await p.goto(`${BASE}/join`); await p.waitForSelector(".gchips"); await p.locator(".gchips button").nth(4).click(); await p.waitForSelector(".ctiles button"); await p.locator(".ctiles button").first().click(); await p.waitForSelector(".ntiles button"); await p.locator(".ntiles button").first().click(); },
  quiz: async (p) => { await p.goto(`${BASE}/play/quiz/se1`); await p.waitForSelector(".qcard"); },
  match: async (p) => { await p.goto(`${BASE}/play/games/l1/MATCH`); await p.waitForSelector(".board"); },
  memory: async (p) => { await p.goto(`${BASE}/play/games/l1/MEMORY`); await p.waitForSelector(".memgrid"); },
  sort: async (p) => { await p.goto(`${BASE}/play/games/l1/SORT`); await p.waitForSelector(".baskets"); },
  equation: async (p) => { await p.goto(`${BASE}/play/games/l1/EQUATION`); await p.waitForSelector(".eq"); },
  tf: async (p) => { await p.goto(`${BASE}/play/games/l1/TRUE_FALSE`); await p.waitForSelector(".qtf"); },
  admin: async (p) => { await p.goto(`${BASE}/admin`); await p.waitForSelector(".admin", { timeout: 20000 }); },
  landing: async (p) => { await p.goto(`${BASE}/`); await p.waitForSelector(".demo-card"); },
  "login-demo": async (p) => { await p.goto(`${BASE}/login`); await p.waitForSelector(".demo-card"); },
  win: async (p) => { await p.goto(`${BASE}/join`); await p.evaluate(() => sessionStorage.setItem("helpo:last-result", JSON.stringify({ game: "MATCH", lessonId: "l1", result: { stars: 3, xp: 60, personalBest: true, totalXp: 400, level: 7, xpIntoLevel: 400, badgeUnlocked: null, classGoal: { goalXp: 500, earnedXp: 440 } } }))); await p.goto(`${BASE}/play/win`); await p.waitForSelector(".wincard"); },
};

for (const [name, fn] of Object.entries(screens)) {
  if (only && !name.startsWith(only)) continue;
  for (const lang of ["en", "ar"]) for (const size of SIZES) await run(size, lang, fn, name);
}
// teacher screens again with the rail saved as collapsed
for (const name of ["create", "workspace", "ws-quiz", "share", "results", "admin"]) {
  if (only && !name.startsWith(only)) continue;
  for (const lang of ["en", "ar"]) for (const size of SIZES.filter((s) => s.w >= 1024)) await run(size, lang, screens[name], `${name}-railcollapsed`, { rail: "collapsed" });
}
await browser.close();
fs.appendFileSync(new URL("./scroll-check.txt", import.meta.url), results_log.join("\n") + "\n");
console.log(results_log.join("\n"));
