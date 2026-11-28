import { expect, test, type Page } from "@playwright/test";
import { createLessonKit, demoLogin, expectNoPageScroll } from "./support";

const PROMPT = "Photosynthesis for grade 6, 45 minutes, focus on vocabulary";

/** Opens a resource tab by its name (the tab label also carries a state and a check count, so match the start). */
async function openTab(page: Page, name: "Slides" | "Worksheet" | "Quiz" | "Game" | "Cards") {
  const tab = page.getByRole("tab", { name: new RegExp(`^${name}`) });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  return page.getByRole("tabpanel");
}

test.describe("create a lesson kit and work in the workspace", () => {
  // one lesson is shared by the tests below; they only read it or add to it, in order
  test.describe.configure({ mode: "serial" });
  let page: Page;

  test.beforeAll(async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, acceptDownloads: true, reducedMotion: "reduce" });
    page = await context.newPage();
    await demoLogin(page, "Teacher");
  });
  test.afterAll(async () => {
    await page.context().close();
  });

  test("Refine with AI rewrites the prompt and Undo restores it", async () => {
    await page.goto("/app");
    const prompt = page.getByRole("textbox", { name: "Or describe your lesson" });
    const refine = page.getByRole("button", { name: "Refine with AI" });
    await expect(refine).toBeDisabled(); // nothing to refine yet
    await prompt.fill(PROMPT);
    await expect(refine).toBeEnabled();
    await refine.click();
    await expect(prompt).not.toHaveValue(PROMPT);
    await expect(prompt).toHaveValue(new RegExp(`^Lesson on: ${PROMPT.slice(0, 20)}`));
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(prompt).toHaveValue(PROMPT);
  });

  test("the generation view locks the app, then the workspace opens", async () => {
    await page.goto("/app");
    await page.getByRole("textbox", { name: "Or describe your lesson" }).fill(`${PROMPT} (lock check)`);
    await expect(page.getByLabel("Curriculum")).toHaveValue("GENERAL");
    await page.getByRole("button", { name: "Make lesson kit" }).click();

    const view = page.getByRole("dialog", { name: /Making|lesson kit/ });
    await expect(view).toBeVisible();
    // the rest of the app is inert: no nav, tabs or logo can be reached, and there is no background option
    await expect(page.locator(".app-inert")).toHaveAttribute("inert", "");
    await expect(view.getByRole("button", { name: "Cancel generation" })).toBeVisible();
    await expect(page.getByRole("button", { name: /background/i })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(view).toBeVisible();

    // finishing lifts the lock and opens the workspace
    await expect(page).toHaveURL(/\/app\/lessons\/[^/]+$/);
    await expect(page.getByRole("tablist", { name: "Resources" })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator(".app-inert")).not.toHaveAttribute("inert", "");
  });

  test("Make lesson kit reaches READY with five resources and all five tabs render content", async () => {
    const lessonId = await createLessonKit(page, PROMPT);
    expect(lessonId).toMatch(/\S+/);

    await expect(page.getByRole("tablist", { name: "Resources" }).getByRole("tab")).toHaveCount(5);
    const content: Record<string, RegExp | string> = {
      Slides: /Speaker note/,
      Worksheet: /pts/,
      Quiz: /Q1/,
      Game: /\S/,
      Cards: /11 cards|cards/,
    };
    for (const name of ["Slides", "Worksheet", "Quiz", "Game", "Cards"] as const) {
      const panel = await openTab(page, name);
      await expect(panel).toBeVisible();
      await expect(panel).toContainText(content[name]);
      await expect(page.getByRole("heading", { name: /^Items \(\d+\)$/ })).toBeVisible();
    }
  });

  test("the top navigation replaces the side rail and never repeats the lesson's own actions", async () => {
    const nav = page.getByRole("navigation", { name: "Menu" });
    await expect(nav.getByRole("link", { name: "New lesson" })).toHaveAttribute("href", "/app");
    await expect(nav.getByRole("button", { name: "My lessons" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Classes" })).toBeVisible();
    await expect(page.locator("aside.rail")).toHaveCount(0);
    for (const name of ["Share", "Results", "Whiteboard", "Slides", "Quiz"]) await expect(nav.getByRole("button", { name })).toHaveCount(0);
    // Share with class and Results live only in the workspace header
    await expect(page.getByRole("button", { name: "Share with class" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Results" })).toHaveCount(1);
    await page.getByRole("button", { name: /account menu/ }).click();
    await expect(page.getByRole("button", { name: "العربية" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await page.keyboard.press("Escape");
    for (const [width, height] of [[1440, 900], [1280, 720], [1024, 768], [390, 844], [360, 740]] as const) {
      await page.setViewportSize({ width, height });
      await expectNoPageScroll(page, `workspace ${width}x${height}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Open the menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer.getByText("New lesson")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("the cards tab is a flip deck with piles, and a grid toggle", async () => {
    await openTab(page, "Cards");
    const card = page.getByRole("button", { name: /Card 1 of/ }).first();
    await expect(card).toBeVisible();
    await card.focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: "Got it" })).toBeVisible();
    await page.getByRole("button", { name: "Got it" }).click();
    await page.getByRole("radio", { name: "Grid" }).click();
    await expect(page.getByRole("link", { name: "Print cards grid (PDF)" })).toBeVisible();
    await page.getByRole("radio", { name: "Deck" }).click();
  });

  test("editing a slide title saves a new version", async () => {
    const panel = await openTab(page, "Slides");
    await expect(panel).toBeVisible();
    await expect(page.getByRole("button", { name: /^Versions \(v1\)/ })).toBeVisible();

    const title = page.getByRole("textbox", { name: "Title", exact: true });
    await title.fill("E2E edited slide title");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByRole("button", { name: /^Versions \(v2\)/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "E2E edited slide title" }).first()).toBeVisible();

    // the API agrees: the slides resource moved to version 2
    const lessonId = new URL(page.url()).pathname.split("/").pop();
    const res = await page.request.get(`/api/lessons/${lessonId}`);
    expect(res.ok()).toBeTruthy();
    const lesson = (await res.json()) as { resources: { kind: string; version: number }[] };
    expect(lesson.resources.find((r) => r.kind === "SLIDES")?.version).toBeGreaterThanOrEqual(2);
  });

  test("the whiteboard opens, draws with pointer events and closes", async () => {
    await openTab(page, "Slides");
    await page.getByRole("button", { name: "Whiteboard" }).last().click();
    const board = page.getByRole("dialog", { name: "Whiteboard" });
    await expect(board).toBeVisible();

    const area = board.getByRole("img", { name: "Drawing area" });
    await expect(area).toBeVisible();
    const clear = board.getByRole("button", { name: "Clear the board" });
    await expect(clear).toBeDisabled(); // nothing drawn yet

    const box = await area.boundingBox();
    if (!box) throw new Error("drawing area has no box");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x - 80, y - 40);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 8 });
    await page.mouse.move(x + 80, y + 40, { steps: 8 });
    await page.mouse.up();

    await expect(clear).toBeEnabled(); // a stroke exists now
    const undo = board.getByRole("button", { name: /^Undo/ });
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(clear).toBeDisabled();

    await board.getByRole("button", { name: "Close the whiteboard" }).click();
    await expect(board).toBeHidden();
  });

  test("Preview as student shows the quiz and a game", async () => {
    await page.getByRole("link", { name: "Preview as student" }).first().click();
    await expect(page).toHaveURL(/\/preview$/);
    await expect(page.getByRole("status").filter({ hasText: /Preview/ })).toBeVisible();

    const choose = page.getByRole("group", { name: "What to preview" });
    await expect(choose.getByRole("button", { name: "Quiz" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { name: /^Question 1 of \d+$/ })).toBeVisible();
    await expect(page.getByRole("main").getByRole("group").getByRole("button").first()).toBeVisible();

    // thinking games come first: Sort it, then the sequence game
    const names = await choose.getByRole("button").allInnerTexts();
    expect(names[0]).toMatch(/Quiz/);
    expect(names[1]).toMatch(/Sort it/);
    await choose.getByRole("button", { name: "Sort it" }).click();
    await expect(page.getByRole("button", { name: /Hint \((-5 points|free)\)/ }).first()).toBeVisible();
    await expect(page.getByText(/Points: \d+/).first()).toBeVisible();

    await choose.getByRole("button", { name: "Match it" }).click();
    await expect(choose.getByRole("button", { name: "Match it" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Hint" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Question 1 of/ })).toHaveCount(0);
  });

  test("the Download menu offers PPTX and PDF for slides and a PPTX download starts", async () => {
    await page.goBack();
    await expect(page).toHaveURL(/\/app\/lessons\/[^/]+$/);
    await openTab(page, "Slides");
    const menu = page.getByRole("button", { name: "Download" });
    await menu.click();
    await expect(page.getByRole("link", { name: "Download PPTX" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download PDF" })).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download PPTX" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/slides\.pptx$/i);
    const path = await download.path();
    expect(path).toBeTruthy();
    const { readFileSync } = await import("node:fs");
    const bytes = readFileSync(path);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(bytes.subarray(0, 2).toString()).toBe("PK"); // a pptx is a zip
  });

  test("other resources offer PDF, Esc closes the menu, and the game has nothing to download", async () => {
    for (const name of ["Worksheet", "Cards"] as const) {
      await openTab(page, name);
      await page.getByRole("button", { name: "Download" }).click();
      await expect(page.getByRole("link", { name: "Download PDF" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Download PPTX" })).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("link", { name: "Download PDF" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Download" })).toBeFocused();
    }
    await openTab(page, "Quiz");
    await page.getByRole("button", { name: "Download" }).click();
    await expect(page.getByRole("link", { name: /PDF/ })).toHaveCount(2); // with and without the answer key
    await page.keyboard.press("Escape");
    await openTab(page, "Game");
    await expect(page.getByRole("button", { name: "Download" })).toBeDisabled();
  });
});
