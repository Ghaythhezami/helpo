// Slides v9 QA: renders the demo deck (qa/slides-v9/deck.json, written from the real DemoAiProvider) in the workspace,
// EN + AR, and saves one PNG per slide plus Present mode and the quiz reveal. Also checks that no slide text overflows.
// Needs the web dev server (BASE, default http://localhost:3000). The API is mocked.
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("C:/Users/A/AppData/Roaming/npm/node_modules/@playwright/mcp/");
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://localhost:3000";
const OUT = new URL("./slides-v9/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const decks = JSON.parse(fs.readFileSync(`${OUT}deck.json`, "utf8"));
const now = new Date().toISOString();
const SIZES = process.env.SIZES ? process.env.SIZES.split(",") : ["1440x900"];
const log = [];

const lessonFor = (lang) => ({
  id: "l1", classId: "c1", className: "6B", title: decks[lang].deckTitle, unitTitle: null, lessonNumber: 4, status: "READY", openChecks: 0, createdAt: now, averageScore: null,
  durationMin: 45, language: lang === "ar" ? "Arabic" : "English", standard: null, objectives: [{ code: "O1", text: "Understand", bloom: "understand", sourcePage: 4 }], sourceFileName: null, sourceChars: 0, band: "NAVIGATOR", grade: 6,
  resources: [{ id: "r-s", kind: "SLIDES", status: "READY", error: null, content: decks[lang], contentLocale: lang, translations: { en: "ready", ar: "ready" }, updatedAt: now, version: 1, progress: 100, promptVersion: "slides.v2", model: "demo", tokensIn: 0, tokensOut: 0 }],
  checks: [], trace: null, generation: { startedAt: now, finishedAt: now, seconds: 12 }, blueprint: null, prompt: null, aiWritten: false, detectedLanguage: lang, tokenCount: 0, approvedAt: null, quota: { used: 1, limit: 100 }, source: null, contentLocale: lang, translations: { en: "ready", ar: "ready" },
});

function mock(page, lang) {
  return page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname.replace("/api", "");
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (p === "/me") return json({ id: "u1", name: "Alex Green", email: "a@b.c", school: { id: "s", name: "Riverside", slug: "riverside" }, locale: lang, role: "TEACHER" });
    if (p === "/classes") return json([{ id: "c1", name: "6B", grade: 6, subject: "Science", band: "NAVIGATOR", studentCount: 24 }]);
    if (p === "/lessons") return json([]);
    if (p === "/lessons/l1" || p === "/lessons/l1/status") return json(lessonFor(lang));
    return json({}, 404);
  });
}

const browser = await chromium.launch({ executablePath: "C:/Users/A/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe" });

for (const size of SIZES) {
  const [w, h] = size.split("x").map(Number);
  for (const lang of ["en", "ar"]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await ctx.addCookies([{ name: "helpo_locale", value: lang, url: BASE }, { name: "better-auth.session_token", value: "x", url: BASE }]);
    await ctx.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = "nextjs-portal{display:none!important}"; document.head.appendChild(st); }));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => log.push(`PAGEERROR ${lang} ${size}: ${e.message.slice(0, 160)}`));
    await mock(page, lang);
    await page.goto(`${BASE}/app/lessons/l1`);
    await page.waitForSelector("[data-testid=slide-frame]", { timeout: 30000 });
    const slides = decks[lang].slides;
    for (let i = 0; i < slides.length; i++) {
      if (i > 0) await page.locator(".pager .tool").nth(1).click();
      await page.waitForTimeout(450);
      const frame = page.locator("[data-testid=slide-frame]");
      const name = `${size === "1440x900" ? "" : size + "-"}${lang}-${String(i + 1).padStart(2, "0")}-${slides[i].layout}`;
      if (size === "1440x900") await frame.screenshot({ path: `${OUT}${name}.png` });
      if (i === 0 || slides[i].layout === "quizBreak") await page.screenshot({ path: `${OUT}${size === "1440x900" ? "" : size + "-"}ws-${lang}-${String(i + 1).padStart(2, "0")}.png` });
      const o = await page.evaluate(() => {
        const f = document.querySelector("[data-testid=slide-frame]");
        const fb = f.getBoundingClientRect();
        const bad = [...f.querySelectorAll("*")].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && (b.right > fb.right + 1 || b.bottom > fb.bottom + 1 || b.left < fb.left - 1) && !el.closest("[aria-hidden=true]"); }).map((el) => el.className || el.tagName).slice(0, 4);
        const clipped = [...f.querySelectorAll("*")].filter((el) => el.scrollHeight > el.clientHeight + 2 && getComputedStyle(el).overflow !== "visible" && el.clientHeight > 0).map((el) => `${el.className}:${el.scrollHeight}/${el.clientHeight}`).slice(0, 4);
        const e = document.scrollingElement;
        return { bad, clipped, pageScroll: e.scrollHeight - innerHeight, wscroll: e.scrollWidth - innerWidth };
      });
      log.push(`${o.bad.length || o.clipped.length || o.pageScroll > 1 || o.wscroll > 1 ? "WARN" : "ok  "} ${lang} ${size} S${i + 1} ${slides[i].layout} ${JSON.stringify(o)}`);
      if (slides[i].layout === "quizBreak") {
        await page.locator("[data-testid=slide-reveal]").click({ timeout: 4000 }).catch((e) => log.push(`ERROR reveal ${lang} ${size} S${i + 1}: ` + (/intercepts/.test(e.message) ? "option tiles overlap the reveal button" : e.message.slice(0, 80))));
        await page.waitForTimeout(350);
        if (size === "1440x900") await frame.screenshot({ path: `${OUT}${lang}-${String(i + 1).padStart(2, "0")}-quizBreak-revealed.png` });
        await page.locator("[data-testid=slide-reveal]").click().catch(() => {});
      }
    }
    // Present mode: arrows, then a screenshot of a mid slide and of the quiz slide
    await page.locator("[data-testid=slide-present]").click();
    await page.waitForSelector(".nsl-present");
    await page.keyboard.press("Home");
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(500);
    if (size === "1440x900") await page.screenshot({ path: `${OUT}present-${lang}.png` });
    const idx = await page.locator(".nsl-present [data-testid=slide-frame]").getAttribute("aria-label");
    log.push(`present ${lang} ${size} after 3x ArrowRight: ${idx}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    log.push(`present closed ${lang} ${size}: ${(await page.locator(".nsl-present").count()) === 0}`);
    await ctx.close();
  }
}
await browser.close();
console.log(log.join("\n"));
