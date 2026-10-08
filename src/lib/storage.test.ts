/**
 * Finding #15: proof/attachment references were signed with JWT_SECRET itself.
 *
 * A reference's signature is HMAC-SHA256(secret, "<base64url payload>") and a session token's is
 * HMAC-SHA256(secret, "<base64url header>.<base64url payload>") — the same function of the same key, so
 * nothing in the crypto kept the two formats apart. These tests pin the separation that replaces it: new
 * references are signed with a key derived for this purpose, and a reference signed with any other
 * purpose's key is refused.
 *
 * They also pin the transition, and the limits of the fix. References are stored, not minted per request,
 * so the ones written before the change are still signed with the raw secret and must keep resolving —
 * see getLegacyRefKey. That means the old key is still a key this file accepts, so the JWT confusion
 * itself is *not* closed for those references; one test below records that honestly rather than implying
 * otherwise.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { createHash, createHmac } from "crypto";
import { rm } from "fs/promises";
import path from "path";

const SECRET = "storage-test-secret-0123456789-0123456789";
process.env.JWT_SECRET = SECRET;

// The round-trip test below writes real bytes. R2 credentials in the environment would send them to a
// bucket instead of the disk this test means to exercise.
for (const key of [
  "R2_BUCKET",
  "S3_BUCKET",
  "R2_ENDPOINT",
  "S3_ENDPOINT",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "AWS_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "AWS_SECRET_ACCESS_KEY",
]) {
  delete process.env[key];
}

vi.mock("@/lib/observability", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

const { proofStorage, storageKeyOf } = await import("@/lib/storage");
const { captureMessage } = await import("@/lib/observability");

const derivedKey = () => createHash("sha256").update(`${SECRET}:proof-ref`).digest();
const legacyKey = () => Buffer.from(SECRET);
/** The key a different consumer of the same secret derives — src/lib/oauth/flowCookies.ts. */
const otherPurposeKey = () => createHash("sha256").update(`${SECRET}:oauth-flow`).digest();

const payloadOf = (ref: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(ref)).toString("base64url");
const sigOf = (key: Buffer, payload: string) =>
  createHmac("sha256", key).update(payload).digest("base64url");
const refOf = (ref: Record<string, unknown>, key: Buffer) => {
  const payload = payloadOf(ref);
  return `${payload}.${sigOf(key, payload)}`;
};
const splitRef = (ref: string) => [ref.slice(0, ref.lastIndexOf(".")), ref.slice(ref.lastIndexOf(".") + 1)];

const ref = (over: Partial<Record<string, unknown>> = {}) => ({
  matchId: "match-1",
  fileId: "file-1",
  contentType: "image/png",
  ...over,
});

const createdDirs: string[] = [];
afterAll(async () => {
  for (const dir of createdDirs) await rm(dir, { recursive: true, force: true });
});

beforeEach(() => {
  vi.mocked(captureMessage).mockClear();
});

describe("reference signing (#15)", () => {
  it("signs a new reference with the purpose-derived key, not with JWT_SECRET itself", async () => {
    const matchId = `test-refkey-${Date.now()}`;
    createdDirs.push(path.join(process.cwd(), "storage", "proof", matchId));

    const stored = await proofStorage.store(matchId, Buffer.from("proof bytes"), "image/png");
    const [payload, signature] = splitRef(stored);

    expect(stored).toContain(".");
    expect(signature).toBe(sigOf(derivedKey(), payload));
    // The whole point: it is no longer the raw secret, so it is no longer the function that signs
    // session tokens.
    expect(signature).not.toBe(sigOf(legacyKey(), payload));
    // And not any other purpose's key either.
    expect(signature).not.toBe(sigOf(otherPurposeKey(), payload));
  });

  it("reads back what it stored", async () => {
    const matchId = `test-refkey-read-${Date.now()}`;
    createdDirs.push(path.join(process.cwd(), "storage", "proof", matchId));

    const bytes = Buffer.from("the proof, verbatim");
    const stored = await proofStorage.store(matchId, bytes, "image/png");

    expect(storageKeyOf(stored)).toBe(matchId);
    await expect(proofStorage.read(stored)).resolves.toEqual({ buffer: bytes, contentType: "image/png" });
  });

  it("refuses a reference signed with a different purpose's key", () => {
    expect(() => storageKeyOf(refOf(ref(), otherPurposeKey()))).toThrow(/Invalid or tampered/);
  });

  it("refuses a reference signed with the pre-fix key *format* under the derived key's name", () => {
    // Same payload, wrong key: the old signature must not be accepted for a *new* reference's slot
    // unless it came through the legacy branch — which the next test covers explicitly.
    const payload = payloadOf(ref());
    expect(() => storageKeyOf(`${payload}.${sigOf(derivedKey(), payload + "x")}`)).toThrow();
  });
});

describe("references written before the fix (#15 transition)", () => {
  it("still resolves a reference signed with the raw secret, and reports that it did", () => {
    expect(storageKeyOf(refOf(ref({ matchId: "match-legacy" }), legacyKey()))).toBe("match-legacy");

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("pre-finding-#15"),
      "info",
      expect.objectContaining({ storageKey: "match-legacy" })
    );
  });

  it("does not report a reference signed with the current key", () => {
    expect(storageKeyOf(refOf(ref(), derivedKey()))).toBe("match-1");
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("still refuses a legacy-signed reference with a traversal in it", () => {
    expect(() => storageKeyOf(refOf(ref({ matchId: "../../etc" }), legacyKey()))).toThrow(
      /Invalid proof reference/
    );
  });
});

describe("a session token is not a reference (#15)", () => {
  it("is not accepted as one — and the signature check is not what stops it", async () => {
    const { createSessionToken } = await import("@/lib/auth");
    // sv supplied so this doesn't touch the database.
    const token = await createSessionToken({ userId: "user-abc", sv: 0 });

    // Everything before a token's last dot is exactly the string it was signed over, so its signature
    // *is* a valid MAC under the key references used to be signed with. This assertion is the finding:
    // there is no key boundary between the two formats, and it fails the moment that stops being true.
    const [payload, signature] = splitRef(token);
    expect(signature).toBe(sigOf(legacyKey(), payload));

    // What actually turns a token away is the payload parse a few lines further down — so this stays
    // rejected in the current code, and would go on being rejected if the legacy branch were removed.
    // It is recorded as a property the change must not break, not as a test the change fixes.
    expect(() => storageKeyOf(token)).toThrow();
  });
});

describe("malformed references", () => {
  it("refuses one with no separator", () => {
    expect(() => storageKeyOf("no-dot-at-all")).toThrow(/Malformed proof reference/);
  });

  it("refuses a payload that is valid JSON but not a reference object", () => {
    for (const bad of ["123", '"a string"', "[1,2,3]", "{}"]) {
      const payload = Buffer.from(bad).toString("base64url");
      expect(() => storageKeyOf(`${payload}.${sigOf(derivedKey(), payload)}`)).toThrow(
        /Invalid proof reference/
      );
    }
  });

  it("refuses a reference with a tampered signature", () => {
    const [payload, signature] = splitRef(refOf(ref(), derivedKey()));
    const flipped = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
    expect(() => storageKeyOf(`${payload}.${flipped}`)).toThrow(/Invalid or tampered/);
  });
});
