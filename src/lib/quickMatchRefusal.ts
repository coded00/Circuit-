/**
 * Circuit — what a player is told when their attempt to accept a Quick Match
 * comes back refused.
 *
 * Both accept clients used to answer *every* refusal with the same sentence:
 * "This challenge was already accepted by another player." That is one of the
 * things that can happen and a lie about every other one. A self-excluded
 * player tapping Accept was told someone had beaten them to it; so was a
 * player whose wallet was short, whose email was unverified, who had no date
 * of birth on file, or who was already in a match. The one useful fact in each
 * of those — the reason — was in the response body, discarded.
 *
 * So the message is now always the server's own sentence, and this module
 * decides only the framing around it:
 *
 *   - `gone`: the challenge is simply no longer there — claimed by another
 *     player, or lapsed. There is nothing to act on, so the modal shows it
 *     briefly and clears itself.
 *   - otherwise: something the player can act on (top up, verify an email,
 *     wait out a cool-off), so the panel waits for them to close it. Three
 *     seconds is not long enough to read "verify your email and come back".
 *
 * Both the route and the two clients go through here, which is the point: the
 * sentence a player sees when the live request modal refuses them and the one
 * they see when the dedicated page refuses them are the same sentence, and the
 * list of reasons is written down once.
 *
 * One thing this deliberately does *not* cover, because it is a product call
 * rather than a bug: a self-excluded player is still fanned a Quick Match
 * invite in the first place (see `getEligibleRecipients`). What happens when
 * they take it up is a refusal that now tells the truth about why.
 */

import type { QuickMatchRecipientStatus, QuickMatchStatus } from "@prisma/client";

export type AcceptRefusal = {
  /**
   * The challenge is gone rather than blocked — the player did nothing wrong
   * and there is nothing for them to do about it.
   */
  gone: boolean;
  /** Short heading above the message. */
  title: string;
  /** The sentence itself: the server's own wherever it sent one. */
  message: string;
};

/** The heading for a challenge that went to somebody else, or ran out of time. */
const TOO_LATE = "Too late this time";

/**
 * Why a recipient's own row is closed, in words.
 *
 * Keyed by the row's status rather than the challenge's, because the row is
 * the one that knows what happened *to this player*: a CANCELLED row means
 * somebody else won the race, but a DECLINED one means they answered it
 * themselves — and "another player got there first" is nonsense for the
 * second. The row is also what the route checks first, so the route and this
 * agree by construction.
 */
export function refusalForRecipientRow(status: QuickMatchRecipientStatus): AcceptRefusal {
  switch (status) {
    case "CANCELLED":
      return { gone: true, title: TOO_LATE, message: "Another player accepted this one first." };
    case "EXPIRED":
      return { gone: true, title: TOO_LATE, message: "This challenge expired before it was answered." };
    case "DECLINED":
      return { gone: false, title: "You turned this one down", message: "Ask the host to send you another." };
    case "ACCEPTED":
      return { gone: false, title: "You're already in this one", message: "Open the battle to play it." };
    default:
      // PENDING — the row is open, so whatever closed the door was the
      // challenge itself. `quickMatchRefusal` below sends those here.
      return { gone: true, title: TOO_LATE, message: "This challenge is no longer available." };
  }
}

/** Why the challenge itself is closed, when the recipient's own row is still open. */
export function refusalForChallenge(status: QuickMatchStatus): AcceptRefusal {
  switch (status) {
    case "ACCEPTED":
      return { gone: true, title: TOO_LATE, message: "Another player accepted this one first." };
    case "EXPIRED":
      return { gone: true, title: TOO_LATE, message: "This challenge expired before it was answered." };
    case "CANCELLED":
      return { gone: true, title: "Challenge cancelled", message: "The host called this one off." };
    default:
      return { gone: true, title: TOO_LATE, message: "This challenge is no longer available." };
  }
}

/**
 * The refusal for a surface that already knows both statuses — the dedicated
 * /quick-match/[id] page, which reads them before rendering. Null when there
 * is still nothing to refuse, which is the ordinary case: the page renders the
 * accept card.
 */
export function quickMatchRefusal(
  recipientStatus: QuickMatchRecipientStatus,
  challengeStatus: QuickMatchStatus
): AcceptRefusal | null {
  if (recipientStatus !== "PENDING") return refusalForRecipientRow(recipientStatus);
  if (challengeStatus !== "PENDING") return refusalForChallenge(challengeStatus);
  return null;
}

/** Shown when a refusal arrived with no usable body at all — a proxy error page, say. */
const NO_REASON_GIVEN = "Something went wrong. Please try again.";

/**
 * The refusal to render for an accept attempt's response.
 *
 * `status` is used only for framing; the sentence is the body's own `error`,
 * which is where every reason the route can give already lives — a stake-limit
 * or self-exclusion refusal is `StakeLimitError.message`, written for a player
 * to read, and the email and age gates are the same. `code` is the one
 * structural fact the body carries (see the route's `GONE` tag): whether the
 * challenge is gone or the player is blocked, which is the difference between
 * a panel that clears itself and one that waits.
 */
export function refusalFromResponse(status: number, body: unknown): AcceptRefusal {
  const fields = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const message = typeof fields.error === "string" && fields.error ? fields.error : NO_REASON_GIVEN;
  const gone = fields.code === "GONE";

  if (gone) return { gone: true, title: TOO_LATE, message };
  // A 5xx is Circuit's fault, not a rule the player hit — "can't accept this
  // Battle" would misdescribe one that was accepted and then failed to become
  // a match.
  return { gone: false, title: status >= 500 ? "Something went wrong" : "Can't accept this Battle", message };
}
