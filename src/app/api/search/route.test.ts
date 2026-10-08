import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { PUBLIC_LIMITS } from "@/lib/rateLimit";
import { GET } from "./route";

/**
 * Finding #11 of the security audit, at the door.
 *
 * /api/search is unauthenticated and, until this change, unthrottled — and every query behind it was four
 * sequential scans. The limit's own unit tests (src/lib/rateLimit.test.ts) would stay green if this route
 * stopped calling it, which is exactly the failure mode worth holding: the helper is the easy half.
 *
 * getCurrentUser is stubbed to null so the file exercises the anonymous caller these limits exist for,
 * without needing a real session cookie.
 */

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn(async () => null) }));

const IP = "203.0.113.7";

const search = (q: string, ip = IP) =>
  GET(new Request(`http://localhost/api/search?q=${encodeURIComponent(q)}`, { headers: { "x-forwarded-for": ip } }));

/** Seed the bucket directly rather than looping 600 real queries through the route. */
const spend = (scope: string, ip: string, times: number) =>
  prisma.rateLimitAttempt.createMany({
    data: Array.from({ length: times }, () => ({ key: `public-ip:${scope}:${ip}` })),
  });

afterEach(async () => {
  await prisma.rateLimitAttempt.deleteMany({ where: { key: { startsWith: "public-ip:" } } });
});

describe("GET /api/search", () => {
  it("still answers a real search, from an address with budget left", async () => {
    const response = await search("zz");
    expect(response.status).toBe(200);
    // The whole shape, so a future early return can't silently drop a category.
    expect(Object.keys(await response.json()).sort()).toEqual(["battles", "communities", "games", "tournaments", "users"]);
  });

  it("answers 429 with a retry hint once the address is over the line", async () => {
    await spend("search", IP, PUBLIC_LIMITS.search.max);

    const response = await search("valorant");
    expect(response.status).toBe(429);
    expect((await response.json()).error).toMatch(/too many/i);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("refuses the caller rather than the query — an over-limit address gets nothing, not partial results", async () => {
    await spend("search", IP, PUBLIC_LIMITS.search.max);
    expect((await search("zz")).status).toBe(429);
    // A different address is untouched: one attacker must not be able to stop everyone else searching.
    expect((await search("zz", "203.0.113.8")).status).toBe(200);
  });

  it("answers a too-short query before the throttle, and without spending it", async () => {
    // The debounced input fires on the first keystroke, before there is anything to search for. Those
    // requests touch nothing, so charging a shared carrier address for them would take a whole network's
    // search down over keystrokes that cannot return results.
    await spend("search", IP, PUBLIC_LIMITS.search.max);

    const response = await search("z");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tournaments: [], battles: [], users: [], games: [], communities: [] });

    // And it is not recorded either — otherwise an over-limit caller's short queries would keep the bucket
    // permanently full and they could never recover by waiting.
    const count = await prisma.rateLimitAttempt.count({ where: { key: `public-ip:search:${IP}` } });
    expect(count).toBe(PUBLIC_LIMITS.search.max);
  });

  it("counts a served search against the caller", async () => {
    await search("zz", "203.0.113.9");
    await search("zz", "203.0.113.9");
    expect(await prisma.rateLimitAttempt.count({ where: { key: "public-ip:search:203.0.113.9" } })).toBe(2);
  });
});
