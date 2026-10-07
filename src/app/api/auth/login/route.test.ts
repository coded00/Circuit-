import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { createTestUser, cleanupAll } from "@/testHelpers";
import { POST } from "./route";

/**
 * Regression test for the Phase 9 fix: the login throttle was keyed on the
 * identifier exactly as typed (`login:${emailOrPhone.toLowerCase()}`), while
 * findUserByIdentifier deliberately folds every common spelling of a phone
 * number onto one account. One account therefore had one bucket per spelling
 * — "08031234567", "0803 123 4567", "+2348031234567" — and each fresh spelling
 * bought another full window of five password guesses, which is the throttle's
 * whole job undone. The key now comes from the account the lookup resolved
 * (throttleKeyFor, src/lib/accountLookup.ts).
 */

const PHONE = "+2348031234567";
const PASSWORD = "correct-horse-battery-staple";

/** Five spellings of one number, each of which a real login form accepts. */
const SPELLINGS = ["08031234567", "0803 123 4567", "0803-123-4567", "+2348031234567", "2348031234567"];
/** A sixth, used nowhere above — so on its own it can never be a bucket with history in it. */
const UNSEEN = "0803.123.4567";
/** The seventh, only ever used for a correct password. */
const TRUE_PASSWORD_SPELLING = "+234 803 123 4567";

const login = (emailOrPhone: string, password = "not-the-password") =>
  POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emailOrPhone, password }),
    })
  );

// Every key this file's throttle can be filed under: the account id once the fix is in, the raw spelling when
// it is reverted. cleanupAll only sweeps keys containing "test-", so these must be removed explicitly or they
// leak into the next run's window.
const keys = new Set(
  [...SPELLINGS, UNSEEN, TRUE_PASSWORD_SPELLING, PHONE].map((s) => `login:${s.toLowerCase()}`)
);

afterEach(async () => {
  await prisma.rateLimitAttempt.deleteMany({ where: { key: { in: [...keys] } } });
  keys.clear();
  await cleanupAll();
});

/** A phone-signup account, and every key its throttle may be filed under. */
async function phoneAccount() {
  const account = await createTestUser({ phone: PHONE, passwordHash: await hashPassword(PASSWORD) });
  keys.add(`login:${account.id}`);
  return account;
}

describe("login throttle", () => {
  it("counts every spelling of one phone number against the account's five attempts", async () => {
    await phoneAccount();

    // Five failures, each in a different spelling: before the fix each opened
    // its own bucket, so all five landed on an empty counter.
    for (const spelling of SPELLINGS) {
      expect((await login(spelling)).status).toBe(401);
    }

    // A sixth guess — in a spelling never used before, so it cannot be a bucket
    // of its own — is refused. One account, one bucket.
    const blocked = await login(UNSEEN);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });

  it("still lets the true password in, and a success clears the shared bucket", async () => {
    await phoneAccount();
    for (const spelling of SPELLINGS.slice(0, 3)) {
      expect((await login(spelling)).status).toBe(401);
    }

    // The real password, typed in a spelling used by none of the failures above.
    const ok = await login(TRUE_PASSWORD_SPELLING, PASSWORD);
    expect(ok.status).toBe(200);

    // Those three failures were cleared, so a full five are available again —
    // without the clear, the third of these would already be refused.
    for (const spelling of SPELLINGS) {
      expect((await login(spelling)).status).toBe(401);
    }
    expect((await login(UNSEEN)).status).toBe(429);
  });

  it("folds the spellings of a number that has no account on it too", async () => {
    // Nothing was created for PHONE in this test: the account lookup resolves
    // nothing, so the key falls back to the normalised identifier. Probing
    // identifiers nobody has must stay as bounded as probing one that exists.
    for (const spelling of SPELLINGS) {
      expect((await login(spelling)).status).toBe(401);
    }
    expect((await login(UNSEEN)).status).toBe(429);
  });
});
