/**
 * Circuit — tournament detail panel. This is the "detail panel" half of
 * the dashboard's sidebar-plus-detail-panel shell — it renders inside
 * src/app/dashboard/layout.tsx, sidebar always visible.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { StatusPill, registrationStatusInfo, tournamentStatusInfo } from "@/components/StatusPill";

function formatNaira(kobo: number): string {
  return `₦ ${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

export default async function DashboardTournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/dashboard/tournaments/${id}`)}`);
  }

  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) notFound();
  if (tournament.organizerId !== user.id && !user.isStaff) {
    redirect(`/tournaments/${id}`);
  }

  const [registrations, escrowTxns, openDisputes, bracket] = await Promise.all([
    prisma.registration.findMany({
      where: { tournamentId: id },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { displayName: true, handle: true } } },
    }),
    prisma.escrowTransaction.findMany({ where: { tournamentId: id }, orderBy: { createdAt: "asc" } }),
    prisma.dispute.findMany({
      where: { status: { in: ["OPEN", "ORGANIZER_REVIEW"] }, match: { tournamentId: id } },
      include: {
        match: {
          include: {
            playerA: { select: { displayName: true } },
            playerB: { select: { displayName: true } },
          },
        },
      },
    }),
    prisma.bracket.findUnique({ where: { tournamentId: id } }),
  ]);

  const collected = escrowTxns
    .filter((t) => t.type === "ENTRY_FEE" && t.status === "COMPLETE")
    .reduce((sum, t) => sum + t.amount, 0);
  const refunded = escrowTxns.filter((t) => t.type === "REFUND").reduce((sum, t) => sum + t.amount, 0);
  const organizerRevenueSettled = escrowTxns
    .filter((t) => t.type === "ORGANIZER_REVENUE" && t.status === "COMPLETE")
    .reduce((sum, t) => sum + t.amount, 0);
  const organizerRevenuePending = escrowTxns
    .filter((t) => t.type === "ORGANIZER_REVENUE" && t.status === "PENDING")
    .reduce((sum, t) => sum + t.amount, 0);
  const payout = escrowTxns.find((t) => t.type === "PRIZE_PAYOUT");
  const status = tournamentStatusInfo(tournament.status);

  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className="flex flex-col gap-2">
        <StatusPill tone={status.tone} pulse={status.pulse}>
          {status.label}
        </StatusPill>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{tournament.name}</h1>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href={`/tournaments/${id}`} className="font-medium text-accent-blue hover:underline">
            Public page →
          </Link>
          <Link href={`/tournaments/${id}/edit`} className="font-medium text-accent-blue hover:underline">
            Edit →
          </Link>
        </div>
      </div>

      {openDisputes.length > 0 && (
        <section className="alert alert-warning flex-col items-stretch gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-warning">
            <AlertTriangle size={16} />
            Disputes need your ruling
          </h2>
          {openDisputes.map((dispute) => (
            <Link key={dispute.id} href={`/matches/${dispute.matchId}`} className="card-row flex items-center justify-between gap-3 p-3">
              <span className="truncate font-medium">
                {dispute.match.playerA.displayName} vs {dispute.match.playerB.displayName}
              </span>
              <span className="shrink-0 text-sm font-medium text-accent-blue">Rule now →</span>
            </Link>
          ))}
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Entry fees collected</span>
          <span className="text-stat text-xl">{formatNaira(collected)}</span>
        </div>
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Your revenue</span>
          <span className="text-stat text-xl">{formatNaira(organizerRevenueSettled)}</span>
          {organizerRevenuePending > 0 && (
            <span className="text-xs text-muted">{formatNaira(organizerRevenuePending)} pending settlement</span>
          )}
        </div>
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Refunded</span>
          <span className="text-stat text-xl">{formatNaira(refunded)}</span>
        </div>
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Prize payout</span>
          <span className="text-stat text-xl">
            {payout ? (payout.status === "COMPLETE" ? "Sent" : "Processing") : "Not yet claimed"}
          </span>
        </div>
      </section>

      <section className="card flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Bracket</h2>
          {bracket && (
            <Link href={`/tournaments/${id}/bracket`} className="text-sm font-medium text-accent-blue hover:underline">
              View bracket →
            </Link>
          )}
        </div>
        <p className="text-sm text-muted">
          {bracket ? "Generated — see the bracket view for live match status." : "Not generated yet."}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            Registrants (<span className="font-mono tabular-nums">{registrations.length}</span>)
          </h2>
          {registrations.length > 0 && (
            <a href={`/api/tournaments/${id}/registrants.csv`} className="text-sm font-medium text-accent-blue hover:underline">
              Export CSV
            </a>
          )}
        </div>
        {registrations.length === 0 ? (
          <p className="card text-center text-muted">No registrants yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>In-game ID</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {registrations.map((reg) => {
                  const regStatus = registrationStatusInfo(reg.status);
                  return (
                    <tr key={reg.id}>
                      <td>
                        {reg.user.displayName} <span className="text-muted">(@{reg.user.handle})</span>
                      </td>
                      <td className="font-mono">{reg.inGameId}</td>
                      <td>
                        <StatusPill tone={regStatus.tone}>{regStatus.label}</StatusPill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
