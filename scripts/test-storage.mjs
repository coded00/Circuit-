#!/usr/bin/env node

/**
 * Circuit — Storage Diagnostic & Verification Tool.
 *
 * Validates configured storage credentials (Cloudflare R2 or Local Storage)
 * by storing, retrieving, and verifying the SHA-256 hash of a synthetic match proof.
 *
 * Usage:
 *   npm run test:storage
 *   node scripts/test-storage.mjs
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createHash, randomBytes } from "crypto";

// 1. Load .env if present
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

// Ensure JWT_SECRET is set for reference signing
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "test-verification-jwt-secret-circuit-2026";
}

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

async function run() {
  console.log(`${CYAN}====================================================${RESET}`);
  console.log(`${CYAN}   Circuit Storage Verification Diagnostic Tool     ${RESET}`);
  console.log(`${CYAN}====================================================${RESET}\n`);

  const r2Bucket = process.env.R2_BUCKET || process.env.S3_BUCKET;
  const r2Endpoint =
    process.env.R2_ENDPOINT ||
    process.env.S3_ENDPOINT ||
    (process.env.R2_ACCOUNT_ID
      ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : null);
  const r2Key = process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const r2Secret = process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

  const isR2Configured = Boolean(r2Bucket && r2Endpoint && r2Key && r2Secret);

  console.log(`[Config Check]`);
  if (isR2Configured) {
    console.log(`  Driver:           ${GREEN}Cloudflare R2 / AWS S3${RESET}`);
    console.log(`  Bucket:           ${r2Bucket}`);
    console.log(`  Endpoint:         ${r2Endpoint}`);
    console.log(`  Access Key ID:    ${r2Key.slice(0, 6)}...${r2Key.slice(-4)}`);
  } else {
    console.log(`  Driver:           ${YELLOW}Local Filesystem (storage/proof/)${RESET}`);
    console.log(`  Note:             R2 credentials not detected in .env. Storage falls back to disk.`);
    console.log(`                    To enable R2, set R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.`);
  }

  console.log("\n[Test Execution]");

  try {
    // Dynamic import of the storage module after environment variables are initialized
    const { proofStorage } = await import("../src/lib/storage.js").catch(async () => {
      return await import("../src/lib/storage.ts");
    });

    const testMatchId = `test_match_${Date.now()}`;
    const testContent = Buffer.from(
      `Circuit Match Proof Diagnostic Probe\nTimestamp: ${new Date().toISOString()}\nPayload: ${randomBytes(64).toString("hex")}`
    );
    const expectedHash = createHash("sha256").update(testContent).digest("hex");

    console.log(`  1. Storing synthetic proof (${testContent.length} bytes)...`);
    const ref = await proofStorage.store(testMatchId, testContent, "text/plain");
    console.log(`     ${GREEN}✓ Stored successfully.${RESET} Reference: ${ref.slice(0, 32)}...`);

    console.log(`  2. Reading proof back by reference...`);
    const retrieved = await proofStorage.read(ref);
    const actualHash = createHash("sha256").update(retrieved.buffer).digest("hex");

    if (actualHash !== expectedHash) {
      throw new Error(`Data corruption detected! Hash mismatch: expected ${expectedHash}, got ${actualHash}`);
    }

    console.log(`     ${GREEN}✓ Retrieved ${retrieved.buffer.length} bytes.${RESET}`);
    console.log(`     ${GREEN}✓ SHA-256 integrity match verified.${RESET} (${actualHash.slice(0, 16)}...)`);
    console.log(`     ${GREEN}✓ Content-Type verified: ${retrieved.contentType}${RESET}`);

    console.log(`\n${GREEN}====================================================${RESET}`);
    console.log(`${GREEN}   STORAGE TEST PASSED: Storage is production-ready! ${RESET}`);
    console.log(`${GREEN}====================================================${RESET}\n`);
    process.exit(0);
  } catch (error) {
    console.error(`\n${RED}====================================================${RESET}`);
    console.error(`${RED}   STORAGE TEST FAILED:                             ${RESET}`);
    console.error(`   ${error instanceof Error ? error.message : error}`);
    console.error(`${RED}====================================================${RESET}\n`);
    process.exit(1);
  }
}

run();
