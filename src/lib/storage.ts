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

import { randomUUID } from "crypto";
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

function encodeRef(ref: ProofRef): string {
  return Buffer.from(JSON.stringify(ref)).toString("base64url");
}

function decodeRef(ref: string): ProofRef {
  return JSON.parse(Buffer.from(ref, "base64url").toString("utf8"));
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
