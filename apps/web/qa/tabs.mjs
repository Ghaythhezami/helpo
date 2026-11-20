import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("C:/Users/A/AppData/Roaming/npm/node_modules/@playwright/mcp/");
const { chromium } = require("playwright");
const acct = fs.readFileSync("C:/Users/A/Desktop/DEV/helpo/.local/demo-account.txt", "utf8");
const browser = await chromium.launch({ executablePath: "C:/Users/A/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe" });
fs.mkdirSync(new URL("./e2e/", import.meta.url), { recursive: true });
for (const lang of ["en", "ar"]) for (const [w, h] of [[1440, 900], [1280, 720], [1024, 768]]) {
  const c = await browser.newContext({ viewport: { width: w, height: h } });
  await c.addCookies([{ name: "helpo_locale", value: lang, url: "http://localhost:3000" }]);
  await c.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = "nextjs-portal{display:none!important}"; document.head.appendChild(st); }));
  const p = await c.newPage();
  await p.goto("http://localhost:3000/login");
  await p.fill("#email", /Email:\s*(\S+)/.exec(acct)[1]);
  await p.fill("#password", /Password:\s*(\S+)/.exec(acct)[1]);
  await p.locator(".authbtn").click();
  await p.waitForURL(/\/app/);
  const id = await p.evaluate(async () => (await (await fetch("/api/lessons")).json()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0].id);
  await p.goto(`http://localhost:3000/app/lessons/${id}`);
  await p.waitForSelector(".ws-head .tabs");
  await p.waitForTimeout(800);
  const m = await p.evaluate(() => { const t = document.querySelector(".ws-head .tabs"); const tabs = [...t.querySelectorAll(".tab")]; return { sw: t.scrollWidth, cw: t.clientWidth, clipped: tabs.some((e) => e.getBoundingClientRect().right > t.getBoundingClientRect().right + 1), page: document.scrollingElement.scrollWidth <= innerWidth }; });
  console.log(`${m.sw <= m.cw + 1 && !m.clipped && m.page ? "PASS" : "FAIL"} tabs ${lang} ${w}x${h}: ${JSON.stringify(m)}`);
  await p.screenshot({ path: new URL(`./e2e/tabs-${lang}-${w}.png`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") });
  await c.close();
}
await browser.close();
