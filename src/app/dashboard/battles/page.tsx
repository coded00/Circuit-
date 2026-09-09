/**
 * Circuit — Battles view — every Battle this user has opened, with status.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { StatusPill, battleStatusInfo } from "@/components/StatusPill";

export default async function DashboardBattlesPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const battles = await prisma.battle.findMany({
    where: { creatorId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Your Battles</h1>
        <Link href="/battles/new" className="btn-primary">
          Open a Battle
        </Link>
      </div>

      {battles.length === 0 ? (
        <p className="card text-center text-muted">You haven&apos;t opened any Battles yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {battles.map((battle) => {
            const status = battleStatusInfo(battle.status);
            return (
              <Link key={battle.id} href={`/battles/${battle.id}`} className="card-row flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium">{battle.game}</span>
                  <span className="text-xs text-muted">{battle.format === "BEST_OF_3" ? "Best of 3" : "Single match"}</span>
                </div>
                <StatusPill tone={status.tone} pulse={status.pulse}>
                  {status.label}
                </StatusPill>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
