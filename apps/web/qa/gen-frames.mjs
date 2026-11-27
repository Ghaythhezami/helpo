// Frame sequence of the generation view (lamp hero) against the mocked API: BASE=http://localhost:3000 node qa/gen-frames.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("C:/Users/A/AppData/Roaming/npm/node_modules/@playwright/mcp/");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3000";
const OUT = new URL("./out/gen-frames/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
fs.mkdirSync(OUT, { recursive: true });

const now = new Date().toISOString();
const kinds = ["SLIDES", "WORKSHEET", "QUIZ", "CARDS", "GAME"];
const res = (kind, status, progress) => ({ id: `r-${kind}`, kind, status, error: null, content: status === "READY" ? { cards: [], slides: [], questions: [], sections: [] } : null, contentLocale: "en", translations: { en: "ready", ar: "ready" }, updatedAt: now, version: 1, progress });
function lessonAt(step) {
  const status = step < 1 ? "ANALYZING" : step >= 7 ? "READY" : "GENERATING";
  const resources = step < 1 ? [] : kinds.map((k, i) => (step - 1 > i ? res(k, "READY", 100) : step - 1 === i ? res(k, "WORKING", 35 + ((step * 17) % 50)) : res(k, "WAITING", 0)));
  return { id: "l9", classId: "c1", className: "6B", title: "Photosynthesis", unitTitle: null, lessonNumber: 1, status, openChecks: 0, createdAt: now, averageScore: null, durationMin: 45, language: "English", standard: null, objectives: [], sourceFileName: null, sourceChars: 4000, band: "NAVIGATOR", grade: 6, resources, checks: [], trace: { traced: 1, total: 1 }, generation: { startedAt: now, finishedAt: null, seconds: null }, blueprint: null, prompt: null, aiWritten: false, detectedLanguage: "en", tokenCount: 1, approvedAt: null, quota: { used: 1, limit: 100 }, source: null, contentLocale: "en", translations: { en: "ready", ar: "ready" }, curriculum: "GENERAL" };
}
const browser = await chromium.launch({ executablePath: "C:/Users/A/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe" });
for (const lang of ["en", "ar"]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addCookies([{ name: "helpo_locale", value: lang, url: BASE }, { name: "better-auth.session_token", value: "x", url: BASE }]);
  await ctx.addInitScript(() => localStorage.setItem("helpo:gen-lock", "l9"));
  const page = await ctx.newPage();
  let step = 0;
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname.replace("/api", "");
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
    if (p === "/me") return json({ id: "u1", name: "Alex Green", email: "a@b.c", school: null, locale: lang, role: "TEACHER" });
    if (p === "/classes") return json([]);
    if (p === "/lessons") return json([]);
    if (p === "/lessons/l9") return json(lessonAt(step));
    if (p === "/lessons/l9/status") return json({ status: lessonAt(step).status, resources: lessonAt(step).resources, translations: {}, updatedAt: now });
    return json({}, 404);
  });
  await page.goto(`${BASE}/app/lessons/l9`);
  await page.waitForSelector(".gen-ovl");
  for (let i = 0; i < 9; i++) {
    step = i;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(i === 0 ? 300 : 5600);
    await page.screenshot({ path: `${OUT}${lang}-${String(i).padStart(2, "0")}.png` });
  }
  await ctx.close();
}
await browser.close();
console.log("frames in", OUT);
