import { expect, test } from "@playwright/test";
import { demoLogin } from "./support";

test.describe("admin overview", () => {
  test("shows platform totals and the runtime badges", async ({ page }) => {
    await demoLogin(page, "Admin");
    await expect(page.getByRole("heading", { name: "Platform overview", level: 1 })).toBeVisible();

    const runtime = page.getByRole("list", { name: "Runtime" });
    await expect(runtime).toContainText("Demo mode"); // AI_MODE=demo: no Claude cost
    await expect(runtime).toContainText("inline"); // QUEUE_DRIVER
    await expect(runtime).toContainText("poll"); // REALTIME
    await expect(runtime).toContainText(/Demo login/);

    const totals = page.getByRole("list", { name: "Totals" });
    for (const label of ["Schools", "Teachers", "Classes", "Students", "Lessons", "Sessions", "Answers"]) {
      const item = totals.getByRole("listitem").filter({ hasText: label });
      await expect(item).toHaveCount(1);
      await expect(item).toContainText(/\d/);
    }
    // the seed creates one school, five classes and well over a hundred students
    await expect(totals.getByRole("listitem").filter({ hasText: "Schools" })).toContainText("1");
    await expect(totals.getByRole("listitem").filter({ hasText: "Classes" })).toContainText("5");

    await expect(page.getByRole("region", { name: "Lessons by status" })).toBeVisible();
    await expect(page.getByRole("table", { name: "AI usage" })).toContainText("demo");
    await expect(page.getByRole("region", { name: "Recent lessons" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Recent sessions" })).toBeVisible();
  });
});
