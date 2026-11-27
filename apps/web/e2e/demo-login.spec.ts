import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, DEMO_PASSWORD, TEACHER_EMAIL, demoLogin, settleOnCreate, type DemoRole } from "./support";

const CARDS: { role: DemoRole; path: RegExp }[] = [
  { role: "Teacher", path: /\/app$/ },
  { role: "Student", path: /\/play$/ },
  { role: "Admin", path: /\/admin$/ },
];

test.describe("demo login", () => {
  for (const { role, path } of CARDS) {
    test(`the ${role} card signs in with one click`, async ({ page }) => {
      await demoLogin(page, role);
      await expect(page).toHaveURL(path);
      await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    });
  }

  test("a teacher visiting /admin is sent away", async ({ page }) => {
    await demoLogin(page, "Teacher");
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin/);
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { name: "Platform overview" })).toHaveCount(0);
  });

  test("visitors without a session are sent to the sign-in page", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp/);
  });

  test("typed login with the demo password works", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /^Email/ }).fill(TEACHER_EMAIL);
    await page.getByRole("textbox", { name: /^Password/ }).fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/app(\/lessons\/[^/]+)?$/);
    await settleOnCreate(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("the admin account also signs in by typing", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /^Email/ }).fill(ADMIN_EMAIL);
    await page.getByRole("textbox", { name: /^Password/ }).fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/(admin|app)$/);
  });

  test("a wrong password shows an error and stays on the sign-in page", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /^Email/ }).fill(TEACHER_EMAIL);
    await page.getByRole("textbox", { name: /^Password/ }).fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
