import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createSessionToken, sessionCookie, verifySessionToken } from "@/lib/auth";
import { cleanupAll, createTestUser } from "@/testHelpers";
import { POST } from "./route";

/**
 * Finding #12 of the security audit: logout cleared the cookie and nothing else, so the token it was
 * handed stayed valid for the rest of its 30-day TTL. Anyone holding a copy — off a shared machine's
 * disk, out of a backup — was still signed in after the user believed they had signed out.
 *
 * getCurrentUser is stubbed because it reads next/headers, which has no request scope under Vitest.
 * Everything else is real: the route's own logic, the session tokens, and the database write the fix
 * adds. The "stale snapshot" case below is the one that would be untestable through the real helper,
 * since it can only arise from a bump landing between the read and the write.
 */

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));

const { getCurrentUser } = await import("@/lib/session");
const asUser = (user: unknown) => vi.mocked(getCurrentUser).mockResolvedValue(user as never);

beforeEach(cleanupAll);
afterEach(async () => {
  vi.mocked(getCurrentUser).mockReset();
  await cleanupAll();
});

describe("POST /api/auth/logout", () => {
  it("revokes the token the request carried, not just the cookie", async () => {
    const user = await createTestUser();
    const token = await createSessionToken({ userId: user.id });
    asUser(user);

    const response = await POST();
    expect(response.status).toBe(200);

    // The token itself is now stale: its version no longer matches the account's, which is the check
    // src/lib/session.ts makes on every request. This is the whole finding — the cookie clearing below
    // was never the part that was missing.
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { sessionVersion: true } });
    expect(after.sessionVersion).toBe(user.sessionVersion + 1);
    expect((await verifySessionToken(token))?.sv).not.toBe(after.sessionVersion);
  });

  it("still clears both session cookies", async () => {
    asUser(await createTestUser());

    const cleared = (await POST()).headers.getSetCookie().join("\n");
    expect(cleared).toContain(`${sessionCookie.name}=`);
    expect(cleared).toMatch(/Max-Age=0/i);
    // A half-finished Google sign-in shouldn't outlive the session either.
    expect(cleared).toMatch(/circuit_oauth_pending/i);
  });

  it("does nothing — and still succeeds — when there is no session to revoke", async () => {
    const bystander = await createTestUser();
    // No cookie, an expired token or a tampered one: getCurrentUser answers null for all of them.
    asUser(null);

    const response = await POST();
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().join("\n")).toContain(`${sessionCookie.name}=`);
    // Nobody else's version moved. A logout that guessed at a user id would be a way to sign strangers out.
    const untouched = await prisma.user.findUniqueOrThrow({ where: { id: bystander.id }, select: { sessionVersion: true } });
    expect(untouched.sessionVersion).toBe(bystander.sessionVersion);
  });

  it("does not take out a session created after this token was read", async () => {
    // The interleaving the conditional update exists for: the version moves between the route reading the
    // user and writing the bump — here because a password reset revoked the old token and the user signed
    // back in. An unconditional increment would bump again and kill that brand-new session; the real
    // token was already dead the moment the version moved.
    const user = await createTestUser();
    await createSessionToken({ userId: user.id });

    // The snapshot the route would be holding, taken before the bump below.
    const stale = { ...user };
    const revoked = await prisma.user.update({
      where: { id: user.id },
      data: { sessionVersion: { increment: 1 } },
    });
    const freshToken = await createSessionToken({ userId: user.id });
    asUser(stale);

    expect((await POST()).status).toBe(200);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { sessionVersion: true } });
    expect(after.sessionVersion).toBe(revoked.sessionVersion);
    // The session the user actually holds now still works.
    expect((await verifySessionToken(freshToken))?.sv).toBe(after.sessionVersion);
  });

  it("signs the caller out even when revocation fails", async () => {
    // A database blip must not leave someone stuck signed in on a shared device. The failure is reported
    // rather than swallowed — see the captureException in the route — but the cookies still go.
    const user = await createTestUser();
    asUser(user);
    const updateMany = vi.spyOn(prisma.user, "updateMany").mockRejectedValueOnce(new Error("connection lost"));

    const response = await POST();
    updateMany.mockRestore();

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().join("\n")).toContain(`${sessionCookie.name}=`);
  });
});
