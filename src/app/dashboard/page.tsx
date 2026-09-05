/**
 * Circuit — organizer dashboard (Build Plan P5-1, maps: ORG-1).
 * Every tournament the current user organizes, with live status and
 * registrant count. Pure aggregation over data Phases 1–3 already produce.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { StatusPill, tournamentStatusInfo } from "@/components/StatusPill";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/dashboard");
  }

  const tournaments = await prisma.tournament.findMany({
    where: { organizerId: user.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { registrations: { where: { status: "CONFIRMED" } } } } },
  });

  const openDisputes = await prisma.dispute.findMany({
    where: {
      status: { in: ["OPEN", "ORGANIZER_REVIEW"] },
      match: { tournament: { organizerId: user.id } },
    },
    select: { match: { select: { tournamentId: true } } },
  });
  const tournamentIdsWithOpenDisputes = new Set(
    openDisputes.map((d) => d.match.tournamentId).filter((id): id is string => id !== null)
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your tournaments</h1>
        <Link href="/tournaments/new" className="btn-primary">
          Create a tournament
        </Link>
      </div>

      {tournaments.length === 0 ? (
        <p className="card text-center text-muted">You haven&apos;t created any tournaments yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {tournaments.map((tournament) => {
            const status = tournamentStatusInfo(tournament.status);
            return (
              <Link
                key={tournament.id}
                href={`/tournaments/${tournament.id}/manage`}
                className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 transition hover:border-border-strong hover:bg-surface-hover"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{tournament.name}</span>
                  <span className="text-xs text-muted">
                    {tournament.game} · {tournament._count.registrations} / {tournament.participantCap}{" "}
                    registered
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {tournamentIdsWithOpenDisputes.has(tournament.id) && (
                    <span className="rounded-full bg-status-cancelled/15 px-2.5 py-1 text-xs font-medium text-status-cancelled">
                      Disputes need ruling
                    </span>
                  )}
                  <StatusPill tone={status.tone} pulse={status.pulse}>
                    {status.label}
                  </StatusPill>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
