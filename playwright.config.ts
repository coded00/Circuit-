import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

/**
 * Circuit — Playwright config for the money-critical e2e flows
 * (docs/testing.md: register → pay → escrow hold, result-submit →
 * auto-complete → payout-eligible, and Quick Match's first-accept-wins
 * race). Mirrors vitest.config.mts's own `fileParallelism: false`: these
 * tests hit the same real Postgres the app itself uses (the dev DB
 * locally, the CI job's own ephemeral service in CI), not an isolated
 * per-worker database, so running more than one file/worker at a time
 * risks the same cross-test interference Vitest was configured to avoid.
 *
 * CI runs against a real production build (`next start`, after the
 * workflow's own `npm run build` step) instead of `next dev` — Next dev
 * mode (Turbopack) compiles each route/API handler on its first real hit
 * rather than ahead of time, which is exactly the local-only flakiness
 * this suite's generous `timeout` and its own warm-up step
 * (`global-setup.ts`) exist to absorb; a production build has no such
 * cold-compile tax, so CI runs are both faster and don't need that
 * workaround (though it's harmless to leave in for the local case).
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  // One retry in CI absorbs genuine transient flakiness (a slow CI
  // runner, a momentary connection-pool hiccup against the ephemeral
  // Postgres service) without masking a real regression — a single
  // consistently-failing test still fails the run. Local runs get none,
  // so a real bug fails immediately instead of quietly retrying.
  retries: isCI ? 1 : 0,
  timeout: 90_000,
  reporter: "list",
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: isCI ? "npm run start" : "npm run dev",
    url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
});
