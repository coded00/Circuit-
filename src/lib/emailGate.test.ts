import { describe, it, expect, afterEach } from "vitest";
import { emailVerificationEnforced, needsEmailVerification, emailVerificationRequired } from "./emailGate";
import { registrationBlockers } from "./registrationEligibility";

const saved = { flag: process.env.REQUIRE_VERIFIED_EMAIL, resend: process.env.RESEND_API_KEY };
afterEach(() => {
  if (saved.flag === undefined) delete process.env.REQUIRE_VERIFIED_EMAIL;
  else process.env.REQUIRE_VERIFIED_EMAIL = saved.flag;
  if (saved.resend === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = saved.resend;
});

const unverified = { emailVerifiedAt: null };
const verified = { emailVerifiedAt: new Date() };

describe("email verification for money actions", () => {
  it("isn't enforced when email can't be sent (no provider, no override)", () => {
    delete process.env.REQUIRE_VERIFIED_EMAIL;
    delete process.env.RESEND_API_KEY;
    expect(emailVerificationEnforced()).toBe(false);
    expect(needsEmailVerification(unverified)).toBe(false);
    expect(emailVerificationRequired(unverified)).toBeNull();
  });

  it("switches on by itself once an email provider is configured", () => {
    delete process.env.REQUIRE_VERIFIED_EMAIL;
    process.env.RESEND_API_KEY = "re_test";
    expect(needsEmailVerification(unverified)).toBe(true);
    expect(needsEmailVerification(verified)).toBe(false);
  });

  it("can be forced on or off", () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.REQUIRE_VERIFIED_EMAIL = "false";
    expect(emailVerificationEnforced()).toBe(false);
    delete process.env.RESEND_API_KEY;
    process.env.REQUIRE_VERIFIED_EMAIL = "true";
    expect(emailVerificationEnforced()).toBe(true);
  });

  it("answers an unverified player with a 403 and a code the forms can show", async () => {
    process.env.REQUIRE_VERIFIED_EMAIL = "true";
    const res = emailVerificationRequired(unverified)!;
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("EMAIL_NOT_VERIFIED");
    expect(emailVerificationRequired(verified)).toBeNull();
  });

  it("blocks paid registration up front but never a free one", () => {
    process.env.REQUIRE_VERIFIED_EMAIL = "true";
    const now = new Date();
    const t = (entryFee: number) => ({ status: "OPEN", entryFee, registrationOpenAt: new Date(now.getTime() - 1000), registrationCloseAt: new Date(now.getTime() + 3600_000), participantCap: 8 });
    const player = { isSuspended: false, suspensionReason: null, dateOfBirth: new Date("2000-01-01"), emailVerifiedAt: null };
    expect(registrationBlockers({ tournament: t(50_000), user: player, registered: 0 }).map((b) => b.title)).toContain("Verify your email");
    expect(registrationBlockers({ tournament: t(0), user: player, registered: 0 })).toEqual([]);
    expect(registrationBlockers({ tournament: t(50_000), user: { ...player, emailVerifiedAt: now }, registered: 0 })).toEqual([]);
  });
});
