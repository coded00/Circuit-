import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts"],
    // Generous — integration tests round-trip several real queries/
    // transactions against a real (often remote, e.g. Neon) Postgres, not
    // an in-memory fake; a concurrent-request test can genuinely take
    // 20-30s under real network latency.
    testTimeout: 45_000,
    hookTimeout: 30_000,
    // Integration tests share one real Postgres (see docs/testing.md) —
    // several of them (the settlement sweep especially) query "every
    // ready tournament" platform-wide, not just their own fixtures, so
    // two test files creating tournaments concurrently could see each
    // other's data. Sequential file execution trades some CI speed for
    // that not being a source of flaky tests.
    fileParallelism: false,
  },
});
