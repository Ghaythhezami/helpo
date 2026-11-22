import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Browser end-to-end suite (real Next.js + NestJS + Postgres, demo AI). See docs/TESTING.md.
 *
 * - Default run: scripts/e2e-stack.mjs prepares the isolated `nibras_e2e` database, builds and serves the API (:3101)
 *   and the web app (:3100); every spec except prod-smoke runs against it.
 * - E2E_BASE_URL=https://...: no local stack, only prod-smoke.spec.ts runs (read-only checks).
 */
const prodUrl = process.env.E2E_BASE_URL?.replace(/\/$/, "");
const webPort = Number(process.env.E2E_WEB_PORT || 3100);
const outDir = path.resolve(__dirname, "../../.e2e-stack"); // outside apps/web: eslint, tsc and jest never see the reports

export default defineConfig({
  testDir: "./e2e",
  testMatch: prodUrl ? /prod-smoke\.spec\.ts$/ : /\.spec\.ts$/,
  outputDir: path.join(outDir, "results"),
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: process.env.CI ? 1 : 2,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [["list"], ["html", { outputFolder: path.join(outDir, "report"), open: "never" }]],
  use: {
    baseURL: prodUrl ?? `http://localhost:${webPort}`,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: process.env.CI ? "retain-on-failure" : "on-first-retry",
    screenshot: "only-on-failure",
    // the dev-only Next.js overlay never exists in the production build; keep animations from racing the clicks
    reducedMotion: "reduce",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: prodUrl
    ? undefined
    : {
        command: "node ../../scripts/e2e-stack.mjs",
        url: `http://localhost:${webPort}/login`,
        timeout: 20 * 60_000, // database, migrations, seed, three builds
        reuseExistingServer: !process.env.CI,
        stdout: "pipe",
        stderr: "pipe",
      },
});
