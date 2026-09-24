import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPasswordTimingSafe,
  createSessionToken,
  verifySessionToken,
  generatePasswordResetToken,
  hashPasswordResetToken,
} from "./auth";

describe("verifyPasswordTimingSafe", () => {
  it("accepts the correct password against its own hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPasswordTimingSafe("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("rejects a wrong password against a real hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPasswordTimingSafe("wrong password", hash)).resolves.toBe(false);
  });

  it("rejects (not throws) when passwordHash is null — the dummy-hash path", async () => {
    // This is the enumeration-safety path: an unknown identifier still
    // runs a real bcrypt.compare (against the dummy hash) so its timing
    // matches a known-identifier-wrong-password response. Can't assert
    // on timing directly from a unit test, but it must still resolve
    // false, not throw or short-circuit.
    await expect(verifyPasswordTimingSafe("anything", null)).resolves.toBe(false);
  });

  it("rejects when passwordHash is undefined", async () => {
    await expect(verifyPasswordTimingSafe("anything", undefined)).resolves.toBe(false);
  });

  it("the null-hash path takes roughly the same time as a real comparison (enumeration-safety spot-check)", async () => {
    // Not a precise timing-attack test (too noisy for CI), just a sanity
    // check that the null-hash path isn't short-circuiting instantly —
    // if DUMMY_PASSWORD_HASH's bcrypt.compare were ever accidentally
    // skipped, this would return near-0ms instead of a real bcrypt round.
    const start = performance.now();
    await verifyPasswordTimingSafe("anything", null);
    const elapsedMs = performance.now() - start;
    expect(elapsedMs).toBeGreaterThan(5);
  });
});

describe("createSessionToken / verifySessionToken", () => {
  it("round-trips a userId through a signed token", async () => {
    const token = await createSessionToken({ userId: "user_abc123" });
    const payload = await verifySessionToken(token);
    expect(payload).toEqual({ userId: "user_abc123" });
  });

  it("rejects a malformed token", async () => {
    await expect(verifySessionToken("not-a-real-jwt")).resolves.toBeNull();
  });

  it("rejects a token signed with a different secret (tampered/forged)", async () => {
    const token = await createSessionToken({ userId: "user_abc123" });
    // Flip a character in the signature portion — still well-formed JWT
    // shape (three dot-separated segments), just an invalid signature.
    const parts = token.split(".");
    const tamperedSignature = parts[2].slice(0, -1) + (parts[2].endsWith("A") ? "B" : "A");
    const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSignature}`;
    await expect(verifySessionToken(tamperedToken)).resolves.toBeNull();
  });

  it("rejects an empty string", async () => {
    await expect(verifySessionToken("")).resolves.toBeNull();
  });
});

describe("password reset tokens", () => {
  it("generates a raw token whose hash matches hashPasswordResetToken(raw)", () => {
    const { raw, hash } = generatePasswordResetToken();
    expect(hashPasswordResetToken(raw)).toBe(hash);
  });

  it("never stores the raw token as the hash (the whole point of hashing it)", () => {
    const { raw, hash } = generatePasswordResetToken();
    expect(hash).not.toBe(raw);
  });

  it("sets an expiry in the future", () => {
    const { expiresAt } = generatePasswordResetToken();
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("generates a different raw token on every call (not reusing entropy)", () => {
    const a = generatePasswordResetToken();
    const b = generatePasswordResetToken();
    expect(a.raw).not.toBe(b.raw);
  });
});
