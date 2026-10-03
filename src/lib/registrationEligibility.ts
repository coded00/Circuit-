/**
 * Circuit — can this player register for this tournament right now? The
 * same rules the registration API enforces (it stays the source of truth),
 * worked out up front so the register page can say what's wrong and how to
 * fix it before anyone fills in a form.
 */

import { isOldEnough, MINIMUM_AGE_YEARS } from "@/lib/age-gate";

export type Blocker = { title: string; detail: string; fix?: { href: string; label: string } };

export function registrationBlockers({
  tournament,
  user,
  registered,
  now = new Date(),
}: {
  tournament: { status: string; entryFee: number; registrationOpenAt: Date; registrationCloseAt: Date; participantCap: number };
  user: { isSuspended: boolean; suspensionReason: string | null; dateOfBirth: Date | null };
  /** Confirmed entries so far. */
  registered: number;
  now?: Date;
}): Blocker[] {
  const blockers: Blocker[] = [];
  if (user.isSuspended) {
    blockers.push({ title: "Your account is suspended", detail: user.suspensionReason ? `Reason: ${user.suspensionReason}` : "You can't enter tournaments while suspended." });
  }
  if (tournament.status === "CANCELLED") {
    blockers.push({ title: "This tournament was cancelled", detail: "Registration is closed." });
  } else if (now < tournament.registrationOpenAt) {
    blockers.push({ title: "Registration hasn't opened yet", detail: `It opens ${tournament.registrationOpenAt.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}.` });
  } else if (now >= tournament.registrationCloseAt) {
    blockers.push({ title: "Registration is closed", detail: "This tournament is no longer taking entries." });
  } else if (tournament.participantCap > 0 && registered >= tournament.participantCap) {
    blockers.push({ title: "This tournament is full", detail: "Every spot has been taken." });
  }
  if (tournament.entryFee > 0) {
    if (!user.dateOfBirth) {
      blockers.push({ title: "Add your date of birth", detail: "Paid tournaments need a date of birth on your account.", fix: { href: "/account", label: "Open account settings" } });
    } else if (!isOldEnough(user.dateOfBirth)) {
      blockers.push({ title: `Paid entry is ${MINIMUM_AGE_YEARS}+`, detail: `You can still join free tournaments. Paid entry unlocks at ${MINIMUM_AGE_YEARS}.` });
    }
  }
  return blockers;
}

/** What happens to an entry fee, in plain words — mirrors the withdraw and cancel behaviour. */
export function refundConditions(tournament: { registrationCloseAt: Date }): string[] {
  return [
    `Withdraw any time before registration closes (${tournament.registrationCloseAt.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}) and the tournament starts, and your entry fee is refunded.`,
    "If the organizer cancels the tournament, every entry fee is refunded.",
    "Refunds go back the way you paid: a wallet payment returns to your wallet, a card payment to your card.",
  ];
}
