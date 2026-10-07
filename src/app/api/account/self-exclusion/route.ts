/**
 * Circuit — set or extend your own cool-off from staked Battles.
 *
 * Its own route rather than a field on `PATCH /api/account` because the
 * rules don't fit that route's shape. Everything there is "set this field to
 * the value you sent"; this is one-way, measured in days from now, and can
 * only ever move in one direction. A `selfExcludedUntil` the client could
 * assign freely would be a cool-off anyone could clear.
 *
 * Deliberately no password re-entry, unlike the email and payout changes next
 * door. That check exists where a hijacked session could take money; this is
 * the one action on the account a hijacked session could use only to *stop*
 * the owner staking. Adding friction to the moment someone has decided they
 * need a break is the wrong trade.
 *
 * Ending one early is not here at all — it is admin-only, at
 * src/app/api/admin/users/[id]/self-exclusion/route.ts, and audited.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { notify } from "@/lib/notifications";
import { captureException } from "@/lib/observability";
import { formatSelfExclusionDate, resolveSelfExclusion } from "@/lib/selfExclusion";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const days = body && typeof body === "object" ? (body as { days?: unknown }).days : undefined;

  // Read the current cool-off fresh rather than from the session's copy: that
  // row is a moment old, and two tabs open on this page is a normal way for
  // someone to set one. The decision below is "is this later than what is
  // already there", which is only correct against the current value.
  const current = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { selfExcludedUntil: true, selfExcludedAt: true },
  });

  const change = resolveSelfExclusion(current.selfExcludedUntil, current.selfExcludedAt, days);
  if (change.kind === "invalid") {
    return NextResponse.json({ error: "Choose a cool-off of between 1 day and 5 years." }, { status: 400 });
  }
  if (change.kind === "shorten") {
    return NextResponse.json(
      {
        error: `Your cool-off already runs to ${formatSelfExclusionDate(change.until)}. You can extend it, but not shorten it. Contact support if you need it lifted.`,
        selfExcludedUntil: change.until,
      },
      { status: 400 }
    );
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { selfExcludedUntil: change.until, selfExcludedAt: change.startedAt },
    select: { selfExcludedUntil: true, selfExcludedAt: true },
  });

  // A receipt, not a courtesy: this is the one setting a player may later want
  // evidence they chose, and an in-app row is the version of that which
  // doesn't depend on them keeping an email. Best-effort and after the write —
  // a failed notification must not turn a cool-off that was set into an error
  // the player retries, only to be told they can't shorten what they just set.
  await notify(user.id, "SELF_EXCLUSION_SET", {
    until: change.until.toISOString(),
    extended: change.kind === "extend",
  }).catch((err) => {
    captureException(err, { source: "account/self-exclusion:notify", userId: user.id });
  });

  return NextResponse.json(updated);
}
