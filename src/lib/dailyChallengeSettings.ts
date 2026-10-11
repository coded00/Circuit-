/**
 * Circuit — the Daily Challenges platform settings, read in one place: the kill switch, the pilot ceilings and the
 * platform fee in force. Its own file so the admin actions and the entry/refund code can both read it without
 * importing each other.
 */

import { prisma } from "@/lib/db";
import type { ChallengeLimits } from "@/lib/dailyChallenges";

export type ChallengeSettings = ChallengeLimits & { enabled: boolean; platformFeeBps: number; maxPayoutBps: number };

/** The platform switch, the pilot ceilings and the fee in force. Defaults match the schema's for a fresh database. */
export async function loadChallengeSettings(): Promise<ChallengeSettings> {
  const s = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
  return {
    enabled: s?.dailyChallengesEnabled ?? false,
    maxEntryFeeKobo: s?.maxChallengeEntryFeeKobo ?? 200_000,
    maxEntrants: s?.maxChallengeEntrants ?? 50,
    platformFeeBps: s?.platformFeeBps ?? 500,
    maxPayoutBps: s?.maxChallengePayoutBps ?? 7000,
  };
}
