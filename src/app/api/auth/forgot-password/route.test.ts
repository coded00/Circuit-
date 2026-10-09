import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { AUTH_LIMITS } from "@/lib/rateLimit";
import { createTestUser, cleanupAll, uniqueSuffix } from "@/testHelpers";
import { sendEmail } from "@/lib/email";
import { POST } from "./route";

/**
 * The forgot-password half of the Phase 9 throttle fix. Here the re-spelling
 * bypass is worse than a password-guessing window: this route mails a reset
 * link, so a fresh bucket per spelling of a victim's phone number is unbounded
 * reset mail into their inbox, sent by whoever knows the number. It is now
 * keyed on the account (throttleKeyFor, src/lib/accountLookup.ts), the same way
 * login is.
 *
 * The mail is mocked — the throttle is what is under test, and a test should
 * never reach for Resend.
 */

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => undefined), sendEmailBatch: vi.fn(async () => undefined) }));

const PHONE = "+2348051234567";

/** Three spellings of one number, each of which a real form accepts. */
const SPELLINGS = ["08051234567", "0805 123 4567", "+2348051234567"];
/** A fourth, used nowhere above — so on its own it can never be a bucket with history in it. */
const UNSEEN = "0805-123-4567";

const request = (emailOrPhone: string) =>
  POST(
    new Request("http://localhost/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emailOrPhone }),
    })
  );

const requestFrom = (ip: string, emailOrPhone: string) =>
  POST(
    new Request("http://localhost/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ emailOrPhone }),
    })
  );

// Every key this file's throttle can be filed under — the account id once the fix is in, the raw spelling when
// it is reverted. cleanupAll only sweeps keys containing "test-", so these have to go explicitly or they leak
// into the next run's window.
const keys = new Set([...SPELLINGS, UNSEEN].map((s) => `forgot-password:${s.toLowerCase()}`));

afterEach(async () => {
  await prisma.rateLimitAttempt.deleteMany({ where: { key: { in: [...keys] } } });
  keys.clear();
  await cleanupAll();
});

describe("forgot-password throttle", () => {
  it("bounds reset mail for one account however its phone number is spelled", async () => {
    // A phone-signup account: emailOrPhone is the number and there is no email
    // on file, so this route has nowhere to deliver to and mails nothing — the
    // throttle is the only thing left to observe.
    const account = await createTestUser({ phone: PHONE, emailOrPhone: PHONE });
    keys.add(`forgot-password:${account.id}`);

    // The limit is three, spent here in three different spellings.
    for (const spelling of SPELLINGS) {
      expect((await request(spelling)).status).toBe(200);
    }

    // A fourth request, in a spelling never used before, is refused: the three
    // already spent are the account's, not the spelling's.
    const blocked = await request(UNSEEN);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });

  it("still folds an email's capitalisation onto one bucket (unchanged by the fix)", async () => {
    // Guard test, not regression coverage: the old key was already lower-cased,
    // so this passed before the fix too. It is here to pin the behaviour the
    // shared normaliser has to keep for emails while it gains phone support.
    const suffix = uniqueSuffix();
    const address = `victim-${suffix}@example.com`;
    const account = await createTestUser({ email: address, emailOrPhone: address });
    keys.add(`forgot-password:${account.id}`);
    keys.add(`forgot-password:${address}`);

    expect((await request(`Victim-${suffix}@Example.com`)).status).toBe(200);
    expect((await request(address)).status).toBe(200);
    expect((await request(`VICTIM-${suffix.toUpperCase()}@EXAMPLE.COM`)).status).toBe(200);
    expect((await request(`viCTim-${suffix}@example.com`)).status).toBe(429);
  });
});

/**
 * The caller layer here (finding #8). It is the same rule as login's, but the damage it bounds is
 * different in kind: a request this route accepts is a query and possibly an email, so an attacker walking
 * a list of addresses is not guessing passwords — they are spending the origin's database and mailing
 * strangers, one address at a time, each in a bucket of its own.
 */
describe("forgot-password caller throttling", () => {
  const IP = "203.0.113.11";
  const ipKey = `auth-ip:forgot-password:${IP}`;

  it("refuses a caller that has spent its budget, and sends nothing", async () => {
    const suffix = uniqueSuffix();
    const address = `victim-${suffix}@example.com`;
    await createTestUser({ email: address, emailOrPhone: address });
    keys.add(`forgot-password:${address}`);

    await prisma.rateLimitAttempt.createMany({
      data: Array.from({ length: AUTH_LIMITS["forgot-password"].caller.max }, () => ({ key: ipKey })),
    });

    const blocked = await requestFrom(IP, address);

    expect(blocked.status).toBe(429);
    // The refusal is before the lookup, so the mail is not merely suppressed — it was never composed. That
    // is the difference that matters on this route: it is the one auth endpoint whose accepted requests
    // land in somebody else's inbox.
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });
});
