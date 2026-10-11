/**
 * Circuit — the checks every Marketplace purchase carries, however it is paid. Buying is a money action, so it
 * needs the same verified email and age checks as paid entries and stakes.
 */
import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { suspendedResponse } from "@/lib/session";
import { emailVerificationRequired } from "@/lib/emailGate";
import { AgeGateError, assertAgeGate } from "@/lib/age-gate";

/** A response to return when this user may not buy right now, or null when they may. */
export function buyerGate(user: User): NextResponse | null {
  const suspended = suspendedResponse(user);
  if (suspended) return suspended;
  const unverified = emailVerificationRequired(user);
  if (unverified) return unverified;
  try {
    assertAgeGate(user.dateOfBirth);
  } catch (err) {
    if (err instanceof AgeGateError) {
      return NextResponse.json({ error: err.code === "MISSING_DOB" ? "Add your date of birth in your account settings before buying." : err.message }, { status: 403 });
    }
    throw err;
  }
  return null;
}
