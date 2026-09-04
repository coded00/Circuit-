/**
 * Circuit — proof file storage (Build Plan task P0-5).
 *
 * Maps to NFR-4: proof uploads (screenshots/clips) must be access-restricted
 * to the match's two participants plus staff — no publicly guessable URL.
 *
 * V1 dev implementation stores files on local disk under `storage/proof/`
 * and serves them through an access-checked route handler rather than a
 * static file path, so the access rule lives in one place regardless of
 * where the bytes eventually live. Swap `LocalProofStorage` for an S3/R2
 * implementation of the same interface when it's time to deploy — nothing
 * above this file should need to change.
 */

import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";

export interface ProofStorage {
  /** Stores a proof file for a match, returns an opaque reference — never a
   *  public URL. Persist this reference on Match.proofARef / proofBRef. */
  store(matchId: string, fileBuffer: Buffer, contentType: string): Promise<string>;
  /** Reads a proof file back by reference. Access control (is this
   *  requester a participant or staff?) is the caller's job — this method
   *  assumes that check already happened. */
  read(ref: string): Promise<{ buffer: Buffer; contentType: string }>;
}

type ProofRef = {
  matchId: string;
  fileId: string;
  contentType: string;
};

// Refs are handed back to the client and round-trip through whatever route
// handler serves a proof file, so they're untrusted input by the time
// decodeRef sees them again. Signing (not just encoding) them stops two
// otherwise-real risks: a forged ref pointing outside STORAGE_ROOT (path
// traversal, since path.join doesn't sanitize ".." segments) and a forged
// ref pointing at a *different* match's file than the one access control
// was actually checked against.
function getRefSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set — it's also used to sign proof storage references. Set it in .env."
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getRefSecret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function encodeRef(ref: ProofRef): string {
  const payload = Buffer.from(JSON.stringify(ref)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeRef(ref: string): ProofRef {
  const separatorIndex = ref.lastIndexOf(".");
  if (separatorIndex === -1) {
    throw new Error("Malformed proof reference.");
  }
  const payload = ref.slice(0, separatorIndex);
  const signature = ref.slice(separatorIndex + 1);
  if (!safeEqual(sign(payload), signature)) {
    throw new Error("Invalid or tampered proof reference.");
  }

  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ProofRef;
  // Belt-and-suspenders: reject anything that isn't a plain path segment,
  // even though a validly-signed ref can only ever contain values this
  // module itself wrote in store().
  for (const segment of [decoded.matchId, decoded.fileId]) {
    if (!segment || segment.includes("/") || segment.includes("\\") || segment.includes("..")) {
      throw new Error("Invalid proof reference.");
    }
  }
  return decoded;
}

const STORAGE_ROOT = path.join(process.cwd(), "storage", "proof");

class LocalProofStorage implements ProofStorage {
  async store(matchId: string, fileBuffer: Buffer, contentType: string): Promise<string> {
    const dir = path.join(STORAGE_ROOT, matchId);
    await mkdir(dir, { recursive: true });
    const fileId = randomUUID();
    await writeFile(path.join(dir, fileId), fileBuffer);
    return encodeRef({ matchId, fileId, contentType });
  }

  async read(ref: string): Promise<{ buffer: Buffer; contentType: string }> {
    const { matchId, fileId, contentType } = decodeRef(ref);
    const buffer = await readFile(path.join(STORAGE_ROOT, matchId, fileId));
    return { buffer, contentType };
  }
}

export const proofStorage: ProofStorage = new LocalProofStorage();

/**
 * The access rule NFR-4 actually cares about. Call this in the route
 * handler that serves a proof file, before calling proofStorage.read().
 */
export function canAccessProof(params: {
  requestingUserId: string;
  match: { playerAId: string; playerBId: string };
  isStaff: boolean;
}): boolean {
  const { requestingUserId, match, isStaff } = params;
  return (
    isStaff ||
    requestingUserId === match.playerAId ||
    requestingUserId === match.playerBId
  );
}
