import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createSessionToken, verifySessionToken } from "@/lib/auth";
import { cleanupAll, createTestUser } from "@/testHelpers";

describe("session versions", () => {
  beforeEach(cleanupAll);
  afterAll(cleanupAll);

  it("stamps new tokens with the user's current version and reads it back", async () => {
    const user = await createTestUser();
    const token = await createSessionToken({ userId: user.id });
    expect(await verifySessionToken(token)).toEqual({ userId: user.id, sv: 0 });
  });

  it("makes a token issued before a bump stale, while a fresh one matches", async () => {
    const user = await createTestUser();
    const oldToken = await createSessionToken({ userId: user.id });
    const bumped = await prisma.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
    const newToken = await createSessionToken({ userId: user.id });

    const old = await verifySessionToken(oldToken);
    const fresh = await verifySessionToken(newToken);
    // getCurrentUser accepts a token only when its version equals the user's current one.
    expect(old?.sv).not.toBe(bumped.sessionVersion);
    expect(fresh?.sv).toBe(bumped.sessionVersion);
  });

  it("treats a token from before session versions existed as version 0", async () => {
    const { SignJWT } = await import("jose");
    const legacy = await new SignJWT({ userId: "u1" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(process.env.JWT_SECRET));
    expect(await verifySessionToken(legacy)).toEqual({ userId: "u1", sv: 0 });
  });
});
