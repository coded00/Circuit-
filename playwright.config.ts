import { defineConfig, devices } from "@playwright/test";

/**
 * Circuit — Playwright config for the two money-critical e2e flows
 * (docs/testing.md: register → pay → escrow hold, result-submit →
 * auto-complete → payout-eligible). Mirrors vitest.config.mts's own
 * `fileParallelism: false`: these tests hit the same real dev Postgres
 * as the app itself, not an isolated per-worker database, so running
 * more than one file/worker at a time risks the same cross-test
 * interference Vitest was configured to avoid.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Next dev mode (Turbopack) compiles each route/API handler on its
  // first real hit, not ahead of time — a cold POST to an API route this
  // test suite has never exercised in the current dev-server process can
  // itself take several real seconds before the page-level navigation
  // this test is actually asserting on even starts. Generous on purpose.
  timeout: 90_000,
  reporter: "list",
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
