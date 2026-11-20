// Real end-to-end pass against the running API (no mocks). Usage: node qa/e2e.mjs <en|ar> <desktop|mobile>
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("C:/Users/A/AppData/Roaming/npm/node_modules/@playwright/mcp/");
const { chromium } = require("playwright");

const lang = process.argv[2] || "en";
const device = process.argv[3] || "desktop";
const BASE = process.env.BASE || "http://localhost:3000";
const size = device === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const mobile = device === "mobile";
const OUT = new URL("./e2e/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
fs.mkdirSync(OUT, { recursive: true });
const acct = fs.readFileSync("C:/Users/A/Desktop/DEV/helpo/.local/demo-account.txt", "utf8");
const EMAIL = /Email:\s*(\S+)/.exec(acct)[1];
const PASSWORD = /Password:\s*(\S+)/.exec(acct)[1];

const log = [];
const step = (m) => { log.push(m); console.log(m); };
const browser = await chromium.launch({ executablePath: "C:/Users/A/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe" });
const hide = () => { document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = "nextjs-portal{display:none!important}"; document.head.appendChild(st); }); };

async function ctx() {
  const c = await browser.newContext({ viewport: size, hasTouch: mobile });
  await c.addCookies([{ name: "helpo_locale", value: lang, url: BASE }]);
  await c.addInitScript(hide);
  return c;
}
const shot = async (p, name) => p.screenshot({ path: `${OUT}${name}-${lang}-${device}.png` });
async function scroll(p, label) {
  const r = await p.evaluate(() => ({ sh: document.scrollingElement.scrollHeight, ih: innerHeight, sw: document.scrollingElement.scrollWidth, iw: innerWidth }));
  step(`${r.sh <= r.ih + 1 && r.sw <= r.iw + 1 ? "PASS" : "FAIL"} no-page-scroll ${label} ${r.sh}/${r.ih} ${r.sw}/${r.iw}`);
}
async function share(p) { // opens the share dialog
  if (mobile) await p.locator(".ws-bar .tool.mob").nth(3).click();
  else await p.locator(".ws-actions .btn:not(.sec)").click();
  await p.waitForSelector(".share-choices");
}
async function results(p) {
  if (mobile) {
    await p.locator(".ws-bar .tool.mob").nth(1).click();
    await p.waitForSelector(".app-dlg");
    await p.locator(".app-dlg .btn", { hasText: /Results|النتائج/ }).first().click();
  } else await p.locator(".ws-edit .btn", { hasText: /Results|النتائج/ }).click();
  await p.waitForSelector(".res-numbers");
}
const anyway = async (p) => { const b = p.getByRole("button", { name: /Share anyway|شارك على أي حال/ }); if (await b.count()) await b.click(); };

// ---- teacher: sign in
const tctx = await ctx();
const t = await tctx.newPage();
t.on("pageerror", (e) => step(`PAGEERROR teacher ${e.message.slice(0, 100)}`));
await t.goto(`${BASE}/login`);
await t.fill("#email", EMAIL);
await t.fill("#password", PASSWORD);
await shot(t, "01-login");
await t.locator(".authbtn").click();
await t.waitForURL(/\/app/, { timeout: 30000 });
await t.waitForSelector(".create", { timeout: 30000 });
step("teacher signed in");
await scroll(t, "create");

// ---- create from a prompt, refine first
await t.fill("#prompt", "Photosynthesis for grade 6, 45 minutes, focus on vocabulary");
const refine = t.locator(".refine-btn");
const refineResp = t.waitForResponse((r) => r.url().includes("/lessons/refine-prompt"), { timeout: 60000 }).catch(() => null);
await refine.click();
const rr = await refineResp;
step(`refine-prompt -> ${rr ? rr.status() : "no response"}`);
await t.waitForTimeout(800);
await shot(t, "02-create-refined");
await t.locator(".create-make").click();
await t.waitForURL(/\/app\/lessons\/[^/]+$/, { timeout: 60000 });
const lessonId = t.url().split("/").pop();
step(`lesson created ${lessonId}`);
await shot(t, "03-making");
await t.waitForFunction(() => document.querySelectorAll(".ws-head .tab .dot.s-ready").length >= 5, null, { timeout: 240000 }).catch(() => step("WARN not all 5 tabs ready in time"));
const states = await t.locator(".ws-head .tab .dot").evaluateAll((els) => els.map((e) => e.className.replace("dot ", "")));
step(`tab states ${states.join(",")}`);
await scroll(t, "workspace");

// ---- each tab
const tabs = t.getByRole("tab");
const n = await tabs.count();
for (let i = 0; i < n; i++) {
  await tabs.nth(i).click();
  await t.waitForTimeout(500);
  await shot(t, `04-tab-${i + 1}`);
  await scroll(t, `tab-${i + 1}`);
}
// tabs fit without horizontal scroll
const fit = await t.locator(".ws-head .tabs").evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
step(`${fit.sw <= fit.cw + 1 ? "PASS" : "FAIL"} tabs fit ${fit.sw}/${fit.cw}`);

// ---- edit a slide title, check a version is created
await tabs.nth(0).click();
const before = await t.evaluate(async (id) => (await (await fetch(`/api/lessons/${id}`)).json()).resources.find((r) => r.kind === "SLIDES")?.version, lessonId);
const edit = async () => {
  await t.fill("#edit-a", "E2E edited title");
  await t.locator(".item-editor button[type=submit]").click();
};
if (mobile) { await t.locator(".ws-bar .tool.mob").nth(1).click(); await t.waitForSelector(".item-editor"); await edit(); await t.keyboard.press("Escape"); } else { await t.waitForSelector(".item-editor"); await edit(); }
await t.waitForTimeout(1500);
const after = await t.evaluate(async (id) => { const r = (await (await fetch(`/api/lessons/${id}`)).json()).resources.find((x) => x.kind === "SLIDES"); return { v: r.version, title: r.content.slides[0].title }; }, lessonId);
step(`${after.v > before ? "PASS" : "FAIL"} version ${before} -> ${after.v}, first slide title "${after.title}"`);
await shot(t, "05-edited");

// ---- share live
await share(t);
await shot(t, "06-share-choices");
await t.locator(".share-choice").first().click();
await anyway(t);
await t.waitForSelector(".share-code", { timeout: 30000 });
const code = (await t.locator(".share-code .code").innerText()).replace(/\D/g, "");
step(`live code ${code}`);
await shot(t, "07-share-code");

// ---- student joins by code
const sctx = await ctx();
const s = await sctx.newPage();
s.on("pageerror", (e) => step(`PAGEERROR student ${e.message.slice(0, 100)}`));
await s.goto(`${BASE}/join?code=${code}`);
await s.waitForSelector("#join-name", { timeout: 30000 });
await s.fill("#join-name", "Sara A.");
await shot(s, "08-student-join");
await scroll(s, "student-join");
await s.locator("#join-btn").click();
await s.waitForURL(/\/play\/(quiz|self)\//, { timeout: 30000 }).catch(() => step("FAIL student did not reach quiz"));
step(`student at ${new URL(s.url()).pathname.replace(/[0-9a-z]{20,}/i, ":id")}`);
await shot(s, "09-student-waiting");

// ---- teacher runs the quiz
await t.getByRole("button", { name: /Run it on the board|شغّله على السبورة/ }).click();
await t.waitForSelector(".board");
await t.locator(".dock .btn", { hasText: /Start the quiz|ابدأ الاختبار/ }).click();
await s.waitForSelector(".qcard .ans, .qcard #short", { timeout: 20000 });
await shot(s, "10-student-question");
await scroll(s, "student-question");
await s.locator(".qcard .ans").first().click();
await s.waitForSelector(".savednote:not(:empty)", { timeout: 10000 }).catch(() => step("WARN answer-saved note missing"));
await shot(s, "11-student-answered");
await t.waitForTimeout(2500);
await shot(t, "12-teacher-live");
await t.locator(".dock .btn", { hasText: /Show answer|اعرض الإجابة/ }).click();
await s.waitForTimeout(2500);
await shot(s, "13-student-revealed");
step("student sees result after reveal: " + (await s.locator(".fb").count() ? "yes" : "no"));
await t.locator(".dock .btn", { hasText: /Next question|السؤال التالي/ }).click();
await t.waitForTimeout(1500);

// ---- results dialog
await t.keyboard.press("Escape");
await t.waitForTimeout(300);
await results(t);
await shot(t, "14-results-live");
const nums = await t.locator(".res-numbers .tile b").allInnerTexts();
step(`results numbers ${nums.join(" | ")}`);
await t.keyboard.press("Escape");

// ---- self-paced
await share(t);
await t.locator(".share-choice").nth(1).click();
await anyway(t);
await t.waitForSelector(".share-code", { timeout: 30000 });
const code2 = (await t.locator(".share-code .code").innerText()).replace(/\D/g, "");
step(`self-paced code ${code2}`);
await shot(t, "15-share-selfpaced");
const s2c = await ctx();
const s2 = await s2c.newPage();
s2.on("pageerror", (e) => step(`PAGEERROR student2 ${e.message.slice(0, 100)}`));
await s2.goto(`${BASE}/join?code=${code2}`);
await s2.waitForSelector("#join-name", { timeout: 30000 });
await s2.fill("#join-name", "Omar K.");
await s2.locator("#join-btn").click();
await s2.waitForURL(/\/play\/self\//, { timeout: 30000 }).catch(() => step("FAIL self-paced student not routed to /play/self"));
step(`student2 at ${new URL(s2.url()).pathname.replace(/[0-9a-z]{20,}/i, ":id")}`);
await s2.waitForSelector(".qcard", { timeout: 20000 });
await shot(s2, "16-selfpaced-first");
await scroll(s2, "selfpaced-question");
for (let i = 0; i < 25; i++) {
  const q = s2.locator(".qcard");
  const opt = q.locator(".ans").first();
  if (await opt.count()) await opt.click();
  else if (await s2.locator("#sp-short").count()) await s2.fill("#sp-short", "green pigment");
  else { const sels = s2.locator(".match-self select"); const m = await sels.count(); for (let k = 0; k < m; k++) await sels.nth(k).selectOption({ index: k + 1 }).catch(() => undefined); }
  const submit = s2.getByRole("button", { name: /Send my answers|أرسل إجاباتي/ });
  if (await submit.count()) { await submit.click(); break; }
  await s2.getByRole("button", { name: /^Next$|^التالي$/ }).click();
}
await s2.waitForSelector(".qcard h1", { timeout: 20000 });
await s2.waitForTimeout(800);
await shot(s2, "17-selfpaced-result");
step("self-paced result: " + (await s2.locator(".qcard .qtext").innerText().catch(() => "?")));
await scroll(s2, "selfpaced-result");

await t.waitForTimeout(500);
await t.keyboard.press("Escape");
await results(t);
await shot(t, "18-results-after-selfpaced");
step(`results numbers ${(await t.locator(".res-numbers .tile b").allInnerTexts()).join(" | ")}`);
fs.writeFileSync(`${OUT}log-${lang}-${device}.txt`, log.join("\n"));
await browser.close();
