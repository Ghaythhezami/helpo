// UX audit probe: runs against a base URL (prod, or local + API mocks from shoot.mjs), writes JSON findings + screenshots to qa/audit/.
// Usage: BASE=https://nibras-web-sage.vercel.app node qa/audit.mjs   |   MOCK=1 PAGES='["/app"]' node qa/audit.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("C:/Users/A/AppData/Roaming/npm/node_modules/@playwright/mcp/");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3000";
const MOCK = process.env.MOCK === "1";
const OUT = new URL("./audit/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
fs.mkdirSync(OUT, { recursive: true });
let mock;
if (MOCK) {
  const head = fs.readFileSync(new URL("./shoot.mjs", import.meta.url), "utf8").split("const SIZES")[0];
  const src = head.replace(/const OUT = [^\n]*\n/, "").replace(/fs\.mkdirSync\([^\n]*\n/g, "") + "\nexport { mock };";
  fs.writeFileSync(OUT + "_mock.gen.mjs", src);
  ({ mock } = await import("file:///" + OUT + "_mock.gen.mjs"));
  fs.unlinkSync(OUT + "_mock.gen.mjs");
}
const browser = await chromium.launch({ executablePath: "C:/Users/A/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe" });

const probe = () => {
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const bgOf = (el) => { let c = [255, 255, 255]; const chain = []; for (let e = el; e; e = e.parentElement) chain.push(e); for (const e of chain.reverse()) { const b = parse(getComputedStyle(e).backgroundColor); if (b && b[3] > 0) c = c.map((v, i) => v * (1 - b[3]) + b[i] * b[3]); } return c; };
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0; };
  const name = (el) => (el.getAttribute("aria-label") || (el.getAttribute("aria-labelledby") && document.getElementById(el.getAttribute("aria-labelledby"))?.textContent) || el.textContent || el.getAttribute("title") || el.getAttribute("alt") || "").trim().replace(/\s+/g, " ");
  const desc = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "") + ` "${name(el).slice(0, 20)}"`;
  const ctl = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], [role=checkbox], [tabindex]:not([tabindex='-1'])")].filter(vis);
  const small = ctl.map((el) => { const r = el.getBoundingClientRect(); return { d: desc(el), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((x) => x.w < 44 || x.h < 44);
  const noName = ctl.filter((el) => !name(el) && !(el.labels && el.labels.length) && !el.getAttribute("placeholder")).map(desc);
  const inputs = [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea")].filter(vis);
  const unlabeled = inputs.filter((el) => !(el.labels && el.labels.length) && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby")).map(desc);
  const placeholderOnly = inputs.filter((el) => el.getAttribute("placeholder") && !(el.labels && el.labels.length)).map(desc);
  const imgs = [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length;
  const svgNoHide = [...document.querySelectorAll("button svg, a svg")].filter((s) => !s.getAttribute("aria-hidden") && !s.getAttribute("aria-label") && !s.closest("[aria-hidden=true]")).length;
  const low = []; const seen = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while ((n = w.nextNode())) { const t = n.textContent.trim(); const el = n.parentElement; if (!t || !el || seen.has(el) || !vis(el) || ["SCRIPT", "STYLE", "NEXTJS-PORTAL"].includes(el.tagName)) continue; seen.add(el);
    const s = getComputedStyle(el); const fg = parse(s.color); if (!fg) continue; const bg = bgOf(el);
    const a = fg[3]; const fgc = fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a));
    const L1 = lum(fgc), L2 = lum(bg); const cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(s.fontSize); const bold = +s.fontWeight >= 700; const large = px >= 24 || (px >= 18.66 && bold);
    if (cr < (large ? 3 : 4.5)) low.push({ d: desc(el), cr: +cr.toFixed(2), px: Math.round(px), t: t.slice(0, 24) }); }
  const lowCt = low.sort((a, b) => a.cr - b.cr).slice(0, 12);
  const sc = document.scrollingElement;
  return {
    lang: document.documentElement.lang, dir: document.documentElement.dir, title: document.title,
    h1: document.querySelectorAll("h1").length, main: document.querySelectorAll("main,[role=main]").length, nav: document.querySelectorAll("nav").length,
    skip: !!document.querySelector("a[href='#main'], a[href='#content'], .skip, [class*=skip]"),
    viewportMeta: document.querySelector("meta[name=viewport]")?.content,
    ctlCount: ctl.length, small, noName, unlabeled, placeholderOnly, imgsNoAlt: imgs, svgNoHide, lowContrastCount: low.length, lowCt,
    scroll: { sh: sc.scrollHeight, ih: innerHeight, sw: sc.scrollWidth, iw: innerWidth },
    live: document.querySelectorAll("[aria-live],[role=status],[role=alert]").length,
    dialogs: [...document.querySelectorAll("[role=dialog],dialog")].map((d) => ({ modal: d.getAttribute("aria-modal"), label: d.getAttribute("aria-label") || d.getAttribute("aria-labelledby") })),
  };
};

const focusProbe = async (page) => {
  const out = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    out.push(await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return { el: e.tagName.toLowerCase() + (typeof e.className === "string" && e.className ? "." + e.className.split(" ")[0] : "") + ` "${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 16)}"`, outline: s.outlineStyle + " " + s.outlineWidth + " " + s.outlineColor, shadow: s.boxShadow !== "none" ? "shadow" : "", x: Math.round(r.x), y: Math.round(r.y) }; }));
  }
  return out;
};

const results = {};
const pages = JSON.parse(process.env.PAGES || '["/","/login","/signup","/join","/join?code=123456"]');
const sizes = JSON.parse(process.env.SIZES || '[{"n":"desktop","w":1280,"h":800},{"n":"mobile","w":390,"h":844},{"n":"mobile320","w":320,"h":568}]');
const tag = MOCK ? "local" : "prod";
for (const lang of ["en", "ar"]) for (const sz of sizes) for (const p of pages) {
  const ctx = await browser.newContext({ viewport: { width: sz.w, height: sz.h }, hasTouch: sz.w < 500 });
  await ctx.addCookies([{ name: "helpo_locale", value: lang, url: BASE }, ...(MOCK ? [{ name: "better-auth.session_token", value: "x", url: BASE }] : [])]);
  const page = await ctx.newPage();
  if (mock) await mock(page, {});
  const key = `${p} ${lang} ${sz.n}`;
  try {
    await page.goto(BASE + p, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(800);
    const r = await page.evaluate(probe);
    if (sz.n === "desktop") r.focus = await focusProbe(page);
    await page.screenshot({ path: `${OUT}${tag}-${p.replace(/[^a-z0-9]+/gi, "_")}-${lang}-${sz.n}.png` });
    results[key] = r;
  } catch (e) { results[key] = { error: String(e.message).slice(0, 200) }; }
  await ctx.close();
}
fs.writeFileSync(`${OUT}${tag}-probe.json`, JSON.stringify(results, null, 1));
await browser.close();
console.log("done", Object.keys(results).length);
