/**
 * Circuit — Playwright global setup.
 *
 * Turbopack (Next.js dev) compiles each route on its first real request,
 * not ahead of time — a route as heavy as /matches/[id] (ResultForm,
 * RulingForm, ActivityTimeline, the Poller, several lib imports) can take
 * well past a single test's timeout to compile cold. Warming the routes
 * these tests hit — with throwaway ids, so each one 404s but still forces
 * Turbopack to compile the route module — keeps that one-time cost out of
 * the timed tests themselves.
 */
import type { FullConfig } from "@playwright/test";

const WARMUP_PATHS = [
  "/login",
  "/tournaments/warmup/register",
  "/tournaments/warmup",
  "/matches/warmup",
  "/battles/new",
  "/quick-match/warmup",
  "/api/quick-match",
  "/api/quick-match/pending",
  "/api/quick-match/warmup",
  "/api/quick-match/warmup/accept",
  "/api/quick-match/warmup/cancel",
  "/api/quick-match/warmup/decline",
  "/api/presence/heartbeat",
];

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3000";
  await Promise.all(
    WARMUP_PATHS.map((path) => fetch(`${baseURL}${path}`).catch(() => null))
  );
}
