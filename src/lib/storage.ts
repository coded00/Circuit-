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

import { randomUUID, createHmac, createHash, timingSafeEqual } from "crypto";
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

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Buffer {
  const kDate = hmac("AWS4" + key, dateStamp);
  const kRegion = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  return hmac(kService, "aws4_request");
}

/**
 * Cloudflare R2 / AWS S3 storage adapter using native SigV4 signing
 * with standard Node.js crypto (zero heavy SDK dependencies).
 */
class R2ProofStorage implements ProofStorage {
  private bucket: string;
  private endpoint: string;
  private accessKeyId: string;
  private secretAccessKey: string;
  private region: string;

  constructor(config: { bucket: string; endpoint: string; accessKeyId: string; secretAccessKey: string; region?: string }) {
    this.bucket = config.bucket;
    this.endpoint = config.endpoint.replace(/\/$/, "");
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
    this.region = config.region || "auto";
  }

  private signRequest(method: string, path: string, body: Buffer = Buffer.alloc(0), contentType?: string): { url: string; headers: Record<string, string> } {
    const url = `${this.endpoint}/${this.bucket}${path}`;
    const parsedUrl = new URL(url);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256(body);

    const headers: Record<string, string> = {
      host: parsedUrl.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    if (contentType) headers["content-type"] = contentType;

    const sortedHeaderKeys = Object.keys(headers).sort();
    const canonicalHeaders = sortedHeaderKeys.map((k) => `${k.toLowerCase()}:${headers[k].trim()}\n`).join("");
    const signedHeaders = sortedHeaderKeys.map((k) => k.toLowerCase()).join(";");

    const canonicalRequest = [
      method,
      parsedUrl.pathname,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256(canonicalRequest),
    ].join("\n");

    const signingKey = getSignatureKey(this.secretAccessKey, dateStamp, this.region, "s3");
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

    headers["authorization"] = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return { url, headers };
  }

  async store(matchId: string, fileBuffer: Buffer, contentType: string): Promise<string> {
    const fileId = randomUUID();
    const objectKey = `/${matchId}/${fileId}`;
    const { url, headers } = this.signRequest("PUT", objectKey, fileBuffer, contentType);

    const res = await fetch(url, {
      method: "PUT",
      headers,
      body: new Uint8Array(fileBuffer),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`R2/S3 store failed (${res.status}): ${errText}`);
    }

    return encodeRef({ matchId, fileId, contentType });
  }

  async read(ref: string): Promise<{ buffer: Buffer; contentType: string }> {
    const { matchId, fileId, contentType } = decodeRef(ref);
    const objectKey = `/${matchId}/${fileId}`;
    const { url, headers } = this.signRequest("GET", objectKey);

    const res = await fetch(url, { method: "GET", headers });
    if (!res.ok) {
      throw new Error(`R2/S3 read failed (${res.status}): ${res.statusText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), contentType };
  }
}

function createProofStorage(): ProofStorage {
  const bucket = process.env.R2_BUCKET || process.env.S3_BUCKET;
  const endpoint =
    process.env.R2_ENDPOINT ||
    process.env.S3_ENDPOINT ||
    (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "");
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

  if (bucket && endpoint && accessKeyId && secretAccessKey) {
    return new R2ProofStorage({
      bucket,
      endpoint,
      accessKeyId,
      secretAccessKey,
      region: process.env.R2_REGION || process.env.AWS_REGION || "auto",
    });
  }

  return new LocalProofStorage();
}

export const proofStorage: ProofStorage = createProofStorage();

/** The storage key a reference was stored under — verifies the
 *  reference's signature first (throws if malformed or tampered). Lets a
 *  caller restrict which stored files a given route may serve, e.g. the
 *  public image route only ever serving `public-*` uploads, never match
 *  proof, report evidence or chat images stored through this same class. */
export function storageKeyOf(ref: string): string {
  return decodeRef(ref).matchId;
}

/**
 * The access rule NFR-4 actually cares about. Call this in the route
 * handler that serves a proof file, before calling proofStorage.read().
 *
 * NFR-4's own wording names only "match participants and staff" — it
 * doesn't mention the organizer. But P3-8 requires the organizer to
 * review evidence to rule on a dispute, which is impossible without
 * seeing it. Rather than silently resolve that tension either way,
 * `isOrganizerCurrentlyRuling` exists as a narrow, deliberate carve-out:
 * pass true only while a dispute on this exact match is actually awaiting
 * that organizer's ruling (see the route that computes it), never for
 * blanket access to every match in their tournaments.
 */
export function canAccessProof(params: {
  requestingUserId: string;
  match: { playerAId: string; playerBId: string };
  isStaff: boolean;
  isOrganizerCurrentlyRuling?: boolean;
}): boolean {
  const { requestingUserId, match, isStaff, isOrganizerCurrentlyRuling } = params;
  return (
    isStaff ||
    Boolean(isOrganizerCurrentlyRuling) ||
    requestingUserId === match.playerAId ||
    requestingUserId === match.playerBId
  );
}
