import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { PUBLIC_LIMITS } from "@/lib/rateLimit";
import { GET } from "./route";

/**
 * Finding #11 of the security audit, at the door.
 *
 * This is the only route that runs `sharp` on demand, and it is unauthenticated — so before this change an
 * anonymous caller could ask the origin to decode and re-encode images as fast as they could send requests.
 *
 * The throttle is asserted here rather than only in the helper's own unit tests, because the helper staying
 * green proves nothing about whether this route calls it. The ref below is deliberately one that does not
 * exist: every case in this file is decided before the storage read, which is the point of the ordering.
 */

const IP = "198.51.100.4";
const MISSING_REF = "public-00000000000000000000000000000000";

const get = (ip = IP, query = "") =>
  GET(new Request(`http://localhost/api/images/${MISSING_REF}${query}`, { headers: { "x-forwarded-for": ip } }), {
    params: Promise.resolve({ ref: MISSING_REF }),
  });

const spend = (ip: string, times: number) =>
  prisma.rateLimitAttempt.createMany({
    data: Array.from({ length: times }, () => ({ key: `public-ip:images:${ip}` })),
  });

afterEach(async () => {
  await prisma.rateLimitAttempt.deleteMany({ where: { key: { startsWith: "public-ip:" } } });
});

describe("GET /api/images/[ref]", () => {
  it("answers 429 with a retry hint once the address is over the line", async () => {
    await spend(IP, PUBLIC_LIMITS.images.max);

    const response = await get();
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("does not cache the 429", async () => {
    // The specific hazard this route's 429 is written to avoid: HEADERS carries
    // `Cache-Control: public, max-age=31536000, immutable`, and a cached 429 would leave that image broken
    // in that browser for a year — long after the minute-long block expired.
    await spend(IP, PUBLIC_LIMITS.images.max);

    const response = await get();
    expect(response.headers.get("cache-control")).toBeNull();
  });

  it("sheds the work rather than doing it — an over-limit request never reaches the storage read", async () => {
    // Told apart from the 404 a missing ref produces by its own run below: if the throttle ran after the
    // read, this would be a 404 and the sharp call would have happened anyway.
    await spend(IP, PUBLIC_LIMITS.images.max);
    expect((await get()).status).toBe(429);
    // The same ref, from an address with budget: 404, i.e. it did get as far as the storage read.
    expect((await get("198.51.100.5")).status).toBe(404);
  });

  it("refuses the caller, not the image — a dud ref still spends nothing on anyone else", async () => {
    await spend(IP, PUBLIC_LIMITS.images.max);
    expect((await get()).status).toBe(429);
    expect((await get("198.51.100.6")).status).toBe(404);
  });

  it("counts a served request against the caller", async () => {
    await get("198.51.100.7");
    await get("198.51.100.7");
    // Counted even though the ref did not exist: a 404 still cost the storage read, so it is work done.
    expect(await prisma.rateLimitAttempt.count({ where: { key: "public-ip:images:198.51.100.7" } })).toBe(2);
  });
});
