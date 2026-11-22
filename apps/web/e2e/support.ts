import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

/** Test-only password the owner chose for the demo accounts (never a real credential). */
export const DEMO_PASSWORD = "Nibras2020@";
export const TEACHER_EMAIL = "demo@helpo.test";
export const ADMIN_EMAIL = "admin@helpo.test";

export type DemoRole = "Teacher" | "Student" | "Admin";
const LANDING: Record<DemoRole, RegExp> = { Teacher: /\/app$/, Student: /\/play$/, Admin: /\/admin$/ };

/** One click on a demo card on /login. Locators are role based so the redesign does not break them. */
export async function demoLogin(page: Page, role: DemoRole): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`^${role}`) }).click();
  await expect(page).toHaveURL(LANDING[role]);
}

/** A fresh, isolated browser context (own cookies, like another person's device) with a viewport and optional UI locale. */
export async function newRoleContext(browser: Browser, baseURL: string | undefined, opts: { width?: number; height?: number; locale?: "en" | "ar" } = {}): Promise<BrowserContext> {
  if (!baseURL) throw new Error("baseURL is not configured");
  const context = await browser.newContext({ baseURL, viewport: { width: opts.width ?? 1440, height: opts.height ?? 900 }, acceptDownloads: true, reducedMotion: "reduce" });
  if (opts.locale) await context.addCookies([{ name: "helpo_locale", value: opts.locale, url: baseURL }]);
  return context;
}

/** Creates a lesson kit through the UI (describe, Make lesson kit) and waits until all five resources are ready. */
export async function createLessonKit(page: Page, prompt: string): Promise<string> {
  await page.goto("/app");
  await page.getByRole("textbox", { name: "Or describe your lesson" }).fill(prompt);
  await page.getByRole("button", { name: "Make lesson kit" }).click();
  await expect(page).toHaveURL(/\/app\/lessons\/[^/]+$/);
  await expect(page.getByRole("tab", { name: /\(ready\)/ })).toHaveCount(5, { timeout: 60_000 });
  return new URL(page.url()).pathname.split("/").pop() as string;
}

/** The no-page-scroll rule from AGENTS.md: the document never scrolls, only inner panels do. */
export async function pageScrollMetrics(page: Page): Promise<{ sh: number; ih: number; sw: number; iw: number }> {
  return page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return { sh: el.scrollHeight, ih: window.innerHeight, sw: el.scrollWidth, iw: window.innerWidth };
  });
}

export async function expectNoPageScroll(page: Page, label: string): Promise<void> {
  await expect
    .poll(async () => {
      const m = await pageScrollMetrics(page);
      return m.sh <= m.ih && m.sw <= m.iw ? "ok" : `${label}: scrollHeight ${m.sh} / innerHeight ${m.ih}, scrollWidth ${m.sw} / innerWidth ${m.iw}`;
    }, { message: `no page scroll on ${label}` })
    .toBe("ok");
}

/** Keys that would reveal an answer. Student payloads must not contain them before a reveal or a submission. */
export const ANSWER_KEYS = ["correctIndex", "correctAnswer", "correctOptions", "acceptedAnswers", "explanation", "belongsInYes"] as const;
