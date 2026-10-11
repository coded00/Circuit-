/**
 * Finding #16: /api/health described the deployment to anyone who asked.
 *
 * The public answer is now the status code plus a word. These tests pin what an anonymous caller can
 * and cannot see — the negative assertions are the point, since the failure mode is a field quietly
 * coming back — and pin that the staff answer still carries the posture an operator checks against
 * docs/pre-launch-checklist.md.
 *
 * The last test is the one worth keeping: with the database down, resolving a session throws, and an
 * unguarded lookup would have turned a monitor's 503 into a 500.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));

const { GET } = await import("./route");
const { prisma } = await import("@/lib/db");
const { getCurrentUser } = await import("@/lib/session");

const anonymous = () => vi.mocked(getCurrentUser).mockResolvedValue(null);
const asStaff = (isStaff: boolean) =>
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", isStaff } as never);
const dbUp = () => vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);
const dbDown = () => vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("connection refused"));

/** The route logs the database failure; the test output doesn't need it twice. */
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(getCurrentUser).mockReset();
  vi.mocked(prisma.$queryRaw).mockReset();
  process.env.PAYSTACK_SECRET_KEY = "sk_test_x";
  process.env.RESEND_API_KEY = "re_test_x";
  delete process.env.CRON_SECRET;
});

describe("what an anonymous caller gets", () => {
  it("gets the status and nothing else", async () => {
    anonymous();
    dbUp();

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "healthy", timestamp: expect.any(String) });

    // The posture fields, asserted gone one by one: a re-added `checks` object is the regression.
    expect(body).not.toHaveProperty("checks");
    expect(body).not.toHaveProperty("uptimeSeconds");
    expect(body).not.toHaveProperty("latencyMs");
    const serialized = JSON.stringify(body);
    for (const leak of ["paystack", "resend", "onesignal", "flutterwave", "cronSecret", "R2_S3", "LOCAL_DISK"]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("cannot tell which integrations are configured", async () => {
    anonymous();
    dbUp();
    delete process.env.PAYSTACK_SECRET_KEY;
    process.env.CRON_SECRET = "set-now";

    const body = await (await GET()).json();

    // Both changed; the public body is byte-for-byte what it was with the opposite configuration.
    expect(body).toEqual({ status: "healthy", timestamp: expect.any(String) });
  });

  it("still gets a 503 when the database is unreachable, so a monitor sees it", async () => {
    anonymous();
    dbDown();

    const res = await GET();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "degraded", timestamp: expect.any(String) });
  });

  it("is never cached", async () => {
    anonymous();
    dbUp();

    expect((await GET()).headers.get("cache-control")).toBe("no-store");
  });
});

describe("what a signed-in non-staff user gets", () => {
  it("gets the same public answer as a signed-out one", async () => {
    asStaff(false);
    dbUp();

    const res = await GET();
    const body = await res.json();

    // Not a 403: being signed in but not staff is not an error, it just isn't the operator either.
    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "healthy", timestamp: expect.any(String) });
    expect(body).not.toHaveProperty("checks");
  });
});

describe("what staff get", () => {
  it("gets the full posture", async () => {
    asStaff(true);
    dbUp();

    const body = await (await GET()).json();

    expect(body.status).toBe("healthy");
    expect(body.checks.database).toEqual({ status: "connected", latencyMs: expect.any(Number) });
    expect(body.checks.storage.driver).toBe("LOCAL_DISK");
    expect(body.checks.integrations).toEqual({
      paystack: true,
      flutterwave: false,
      bachs: false,
      resend: true,
      onesignal: false,
      // Deleted in beforeEach, and the whole point of it being off the public body.
      cronSecret: false,
    });
    expect(body.uptimeSeconds).toEqual(expect.any(Number));
    expect(body.latencyMs).toEqual(expect.any(Number));
  });

  it("gets 503 and a disconnected database rather than a 500", async () => {
    asStaff(true);
    dbDown();

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.database.status).toBe("disconnected");
  });

  it("is never cached either", async () => {
    asStaff(true);
    dbUp();

    expect((await GET()).headers.get("cache-control")).toBe("no-store");
  });
});

describe("with the database down (#16's trap)", () => {
  it("answers a signed-in caller with 503, not 500, when resolving the session also fails", async () => {
    // Resolving a session reads the User row, so it fails with the same database. Before this was
    // guarded it threw out of GET, and a monitor saw a 500 instead of the 503 it watches for.
    vi.mocked(getCurrentUser).mockRejectedValue(new Error("connection refused"));
    dbDown();

    const res = await GET();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "degraded", timestamp: expect.any(String) });
  });
});
