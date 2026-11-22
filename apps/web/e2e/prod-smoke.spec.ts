import { expect, test } from "@playwright/test";

/**
 * Read-only checks against a deployed site (E2E_BASE_URL). They only sign in with the one-click demo cards and open
 * pages: no lessons, sessions or submissions are created in production.
 */
test.describe("production smoke", () => {
  test("the sign-in page offers the three demo accounts", async ({ page }) => {
    await page.goto("/login");
    for (const name of ["Teacher", "Student", "Admin"]) await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  });

  test("Teacher card lands on Create with the side menu", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Teacher", { exact: true }).first().click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { name: /What are we teaching today/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Nibras home" }).first()).toHaveAttribute("href", "/app");
  });

  test("Student card lands on the practice hub", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Student", { exact: true }).first().click();
    await expect(page).toHaveURL(/\/play$/);
    await expect(page.getByRole("heading", { name: "Practice" })).toBeVisible();
  });

  test("Admin card lands on the admin overview", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Admin", { exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("no page scrolls on the public and student screens", async ({ page }) => {
    for (const path of ["/login", "/join"]) {
      await page.goto(path);
      const m = await page.evaluate(() => ({ sh: document.scrollingElement!.scrollHeight, ih: innerHeight, sw: document.scrollingElement!.scrollWidth, iw: innerWidth }));
      expect(m.sh, path).toBeLessThanOrEqual(m.ih);
      expect(m.sw, path).toBeLessThanOrEqual(m.iw);
    }
  });
});
