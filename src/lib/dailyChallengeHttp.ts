/**
 * Circuit — turns the "no"s the Daily Challenge entry code throws into the responses the player sees. Every one of
 * these is an answer (a rule, a limit, an empty wallet), not a failure, so they are 4xx with a message written for
 * the player; anything else is a real error and is rethrown for the error handler.
 */

import { NextResponse } from "next/server";
import { ChallengeRefusedError } from "@/lib/dailyChallengeEntries";
import { InsufficientWalletBalanceError, StakeLimitError } from "@/lib/stakes";

export function challengeErrorResponse(err: unknown): NextResponse {
  if (err instanceof ChallengeRefusedError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  if (err instanceof InsufficientWalletBalanceError) {
    return NextResponse.json({ error: "Your wallet balance is too low for this entry. Add funds in Wallet first.", code: "INSUFFICIENT_BALANCE" }, { status: 402 });
  }
  if (err instanceof StakeLimitError) return NextResponse.json({ error: err.message, code: err.code }, { status: 403 });
  throw err;
}
