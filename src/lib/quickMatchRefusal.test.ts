import { describe, expect, it } from "vitest";
import { refusalForRecipientRow, refusalFromResponse, quickMatchRefusal } from "./quickMatchRefusal";
import { selfExclusionMessage } from "./selfExclusion";
import { EMAIL_NOT_VERIFIED_MESSAGE } from "./emailGate";
import { StakeLimitError } from "./stakes";

/**
 * The bug these cover: both accept clients answered every refusal with
 * "another player accepted this battle first", whatever the reason was. The
 * reason was in the response body the whole time. So the tests that matter
 * most here are the ones asserting a *specific* reason survives to the screen —
 * a generic "shows some message" test would have passed against the broken
 * code too, since the broken code did show a message.
 */

describe("refusalFromResponse — the server's own reason reaches the player", () => {
  it("shows a stake-limit refusal verbatim, not 'somebody beat you to it'", () => {
    // The exact shape the accept route returns for a StakeLimitError: a 403
    // whose body is the error's own message, written for a player to read.
    const limit = new StakeLimitError(
      "SELF_EXCLUDED",
      "You've paused staked Battles until 14 October 2026. You can still play free Battles."
    );
    const refusal = refusalFromResponse(403, { error: limit.message });

    expect(refusal.message).toBe(limit.message);
    expect(refusal.message).not.toMatch(/another player/i);
    expect(refusal.gone).toBe(false);
  });

  it("shows the self-exclusion sentence exactly as the cool-off writes it", () => {
    // Round-tripped against the module that owns the copy, so the two can't
    // drift: a player refused here and refused on the Battle form are told the
    // same thing, which is the whole reason selfExclusionMessage is shared.
    const message = selfExclusionMessage(new Date("2026-10-14T00:00:00Z"));

    expect(refusalFromResponse(403, { error: message }).message).toBe(message);
  });

  it("keeps a code, but does not treat every code as 'gone'", () => {
    // The email gate already sent a `code` before any of this existed. Only
    // the route's own GONE tag means the challenge is gone; keying on "has a
    // code" would auto-dismiss an instruction the player has to follow.
    const refusal = refusalFromResponse(403, { error: EMAIL_NOT_VERIFIED_MESSAGE, code: "EMAIL_NOT_VERIFIED" });

    expect(refusal.gone).toBe(false);
    expect(refusal.message).toBe(EMAIL_NOT_VERIFIED_MESSAGE);
  });

  it("marks a GONE refusal as gone, and still shows the route's sentence", () => {
    const refusal = refusalFromResponse(409, { error: "This challenge is no longer available.", code: "GONE" });

    expect(refusal).toMatchObject({ gone: true, title: "Too late this time", message: "This challenge is no longer available." });
  });

  it("frames a 500 as Circuit's problem rather than a rule the player hit", () => {
    // "Can't accept this Battle" would be wrong for the route's own 500: the
    // accept did succeed, and what failed was making a match out of it.
    const refusal = refusalFromResponse(500, {
      error: "Your Quick Match was accepted but the match couldn't be created. Contact support.",
    });

    expect(refusal.title).toBe("Something went wrong");
    expect(refusal.message).toMatch(/contact support/i);
  });

  it("falls back to a sentence of its own only when there is no body at all", () => {
    // A proxy error page, an empty 502 — not something the route produced.
    for (const body of [null, undefined, "", "Internal Server Error", {}, { error: 42 }]) {
      const refusal = refusalFromResponse(502, body);
      expect(refusal.message).toBe("Something went wrong. Please try again.");
      expect(refusal.gone).toBe(false);
    }
  });
});

describe("refusalForRecipientRow — the row's status, not a guess at it", () => {
  it("says somebody else won the race only when somebody else won the race", () => {
    expect(refusalForRecipientRow("CANCELLED").message).toMatch(/another player/i);
  });

  it("does not say that about a challenge the player turned down themselves", () => {
    // Reachable: the incoming-request modal over a challenge the player has
    // already declined, or a link opened twice. "Another player got there
    // first" is nonsense for it, and it is what the old copy said.
    const refusal = refusalForRecipientRow("DECLINED");

    expect(refusal.message).not.toMatch(/another player/i);
    expect(refusal.gone).toBe(false);
  });

  it("treats an expired row as gone rather than as something to act on", () => {
    expect(refusalForRecipientRow("EXPIRED").gone).toBe(true);
  });
});

describe("quickMatchRefusal — what the dedicated page renders before any click", () => {
  it("has nothing to refuse while both the row and the challenge are open", () => {
    expect(quickMatchRefusal("PENDING", "PENDING")).toBeNull();
  });

  it("blames the row when the row is closed, even if the challenge looks open", () => {
    // The row is checked first because it is what the route checks first — a
    // page and a click must not disagree about why this one is closed.
    expect(quickMatchRefusal("DECLINED", "PENDING")?.title).toBe("You turned this one down");
  });

  it("blames the challenge when the row is still open but the challenge is not", () => {
    // The transient window where somebody's acceptance has landed but this
    // recipient's row has not been cancelled yet.
    expect(quickMatchRefusal("PENDING", "ACCEPTED")).toMatchObject({ gone: true, message: "Another player accepted this one first." });
    expect(quickMatchRefusal("PENDING", "CANCELLED")?.title).toBe("Challenge cancelled");
  });
});
