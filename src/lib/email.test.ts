/**
 * Finding #18: with no `RESEND_API_KEY` set, `sendEmail` printed the entire message to the server log —
 * and three of its callers put a bearer secret in that message: the password-reset link
 * (src/app/api/auth/forgot-password/route.ts), the email-verification link (src/lib/emailVerification.ts)
 * and a marketplace instant-download URL (src/lib/orderEmails.ts). A deploy that had simply not set the
 * key therefore wrote working credentials into its log drain.
 *
 * The tests below pin the gate rather than the message: the body is printed in development, where the
 * printed link is the only way to finish those flows by hand, and nowhere else. The "nowhere else" half is
 * the one that has to hold for an unset or unexpected `NODE_ENV` too, which is why the branch is
 * `=== "development"` rather than `!== "production"` — the empty-string case below is that assertion.
 *
 * The recipient and the subject stay in both branches, and that is pinned as well: the fallback exists to
 * be loud about a deploy that cannot send email, and silencing it entirely would trade one failure for
 * another.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock, batchSendMock } = vi.hoisted(() => ({ sendMock: vi.fn(), batchSendMock: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
    batch = { send: batchSendMock };
  },
}));

const { sendEmail, sendEmailBatch } = await import("./email");

const TO = "player@example.com";
const SUBJECT = "Reset your Circuit password";
// The shape the forgot-password route actually sends, token and all.
const RESET_BODY =
  "Someone asked to reset the password on this account. This link is good for one hour:\n\n" +
  "https://circuit.app/reset-password?token=RESET-TOKEN-SECRET\n\nIf it wasn't you, ignore this.";

/** Everything written to the server log while `run` executes — both levels the fallback could reach for. */
async function loggedOutput(run: () => Promise<void>): Promise<string> {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await run();
    return [...warn.mock.calls, ...error.mock.calls].flat().join("\n");
  } finally {
    warn.mockRestore();
    error.mockRestore();
  }
}

let savedApiKey: string | undefined;

beforeEach(() => {
  sendMock.mockReset().mockResolvedValue({ error: null });
  batchSendMock.mockReset().mockResolvedValue({ error: null });
  // The fallback is the subject here, so the key starts absent in every test and the ones that want a
  // provider set it themselves.
  savedApiKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
});

afterEach(() => {
  if (savedApiKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = savedApiKey;
  vi.unstubAllEnvs();
});

describe("what the no-provider fallback writes to the log (#18)", () => {
  it("sends through Resend, and logs nothing, when the key is set", async () => {
    process.env.RESEND_API_KEY = "re_test_key";

    const output = await loggedOutput(() => sendEmail(TO, SUBJECT, RESET_BODY));

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(output).toBe("");
  });

  it("keeps the reset token out of the log on a deployment with no key", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const output = await loggedOutput(() => sendEmail(TO, SUBJECT, RESET_BODY));

    expect(output).not.toContain("RESET-TOKEN-SECRET");
    // Not just the token: nothing that narrows down where to look for one.
    expect(output).not.toContain("/reset-password");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("still says who and what, so a deploy that cannot send email is diagnosable", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const output = await loggedOutput(() => sendEmail(TO, SUBJECT, RESET_BODY));

    expect(output).toContain(TO);
    expect(output).toContain(SUBJECT);
    expect(output).toContain("RESEND_API_KEY");
  });

  it("is quiet for a NODE_ENV that is neither production nor development", async () => {
    // The gate is `=== "development"`, not `!== "production"`. An operator who exports something
    // unexpected — or nothing — has to land on the quiet side, or the gate is only as good as their env.
    vi.stubEnv("NODE_ENV", "");

    const output = await loggedOutput(() => sendEmail(TO, SUBJECT, RESET_BODY));

    expect(output).not.toContain("RESET-TOKEN-SECRET");
    expect(output).toContain(TO);
  });

  it("still prints the body in development, which is how the flow gets finished by hand", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const output = await loggedOutput(() => sendEmail(TO, SUBJECT, RESET_BODY));

    expect(output).toContain("RESET-TOKEN-SECRET");
    expect(output).toContain(TO);
  });

  it("treats the batch endpoint the same, and still sends nothing for an empty batch", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const output = await loggedOutput(() => sendEmailBatch([TO, "other@example.com"], SUBJECT, RESET_BODY));

    expect(output).not.toContain("RESET-TOKEN-SECRET");
    expect(output).toContain("2 recipients");
    expect(batchSendMock).not.toHaveBeenCalled();

    // An empty recipient list is a no-op, not a warning — the caller asked for nothing to be sent.
    expect(await loggedOutput(() => sendEmailBatch([], SUBJECT, RESET_BODY))).toBe("");
  });
});
