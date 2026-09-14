/**
 * Circuit — admin tournament detail/manage (native to the admin shell).
 * Same real data the organizer's own `/dashboard/tournaments/[id]` shows
 * (registrants, escrow, disputes, bracket status) — deliberately not a
 * redirect out to that page, or to the public `/tournaments/[id]`: an
 * admin clicking something in the control center should stay in the
 * control center, not land back in the player-facing app's own chrome.
 * "View public page" is the one explicit, clearly-labeled exception —
 * opens in a new tab.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/db";
import { StatusPill, registrationStatusInfo, tournamentStatusInfo } from "@/components/StatusPill";
import { CancelTournamentButton } from "@/components/admin/CancelTournamentButton";

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

export default async function AdminCompetitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) notFound();

  const [registrations, escrowTxns, openDisputes, bracket] = await Promise.all([
    prisma.registration.findMany({
      where: { tournamentId: id },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, displayName: true, handle: true } } },
    }),
    prisma.escrowTransaction.findMany({ where: { tournamentId: id }, orderBy: { createdAt: "asc" } }),
    prisma.dispute.findMany({
      where: { status: { in: ["OPEN", "ORGANIZER_REVIEW"] }, match: { tournamentId: id } },
      include: {
        match: { include: { playerA: { select: { displayName: true } }, playerB: { select: { displayName: true } } } },
      },
    }),
    prisma.bracket.findUnique({ where: { tournamentId: id } }),
  ]);

  const collected = escrowTxns.filter((t) => t.type === "ENTRY_FEE" && t.status === "COMPLETE").reduce((s, t) => s + t.amount, 0);
  const refunded = escrowTxns.filter((t) => t.type === "REFUND").reduce((s, t) => s + t.amount, 0);
  const payout = escrowTxns.find((t) => t.type === "PRIZE_PAYOUT");
  const status = tournamentStatusInfo(tournament.status);
  const cancellable = tournament.status !== "CANCELLED" && tournament.status !== "COMPLETE" && new Date() < tournament.startAt;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <Link href="/admin/competitions" className="w-fit text-sm font-medium text-muted transition hover:text-foreground">
        ← All competitions
      </Link>

      <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <StatusPill tone={status.tone} pulse={status.pulse}>
            {status.label}
          </StatusPill>
          <h1 className="font-display text-2xl font-bold tracking-tight">{tournament.name}</h1>
          <span className="text-sm text-muted">{tournament.game}</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href={`/tournaments/${id}`} target="_blank" className="text-sm font-medium text-accent-blue hover:underline">
            View public page ↗
          </Link>
          <Link href={`/admin/competitions/${id}/edit`} className="btn-secondary text-sm">
            Edit
          </Link>
          {cancellable && <CancelTournamentButton tournamentId={id} />}
        </div>
      </div>

      {openDisputes.length > 0 && (
        <section className="alert alert-warning flex-col items-stretch gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-warning">
            <AlertTriangle size={16} />
            Disputes need a ruling
          </h2>
          {openDisputes.map((dispute) => (
            <Link key={dispute.id} href={`/matches/${dispute.matchId}`} target="_blank" className="card-row flex items-center justify-between gap-3 p-3">
              <span className="truncate font-medium">
                {dispute.match.playerA.displayName} vs {dispute.match.playerB.displayName}
              </span>
              <span className="shrink-0 text-sm font-medium text-accent-blue">Rule now ↗</span>
            </Link>
          ))}
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Entry fees collected</span>
          <span className="text-stat text-xl">{formatNaira(collected)}</span>
        </div>
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Refunded</span>
          <span className="text-stat text-xl">{formatNaira(refunded)}</span>
        </div>
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Prize payout</span>
          <span className="text-stat text-xl">{payout ? (payout.status === "COMPLETE" ? "Sent" : "Processing") : "Not yet claimed"}</span>
        </div>
      </div>

      <div className="card flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-card-title">Bracket</h2>
          {bracket && (
            <Link href={`/tournaments/${id}/bracket`} target="_blank" className="text-sm font-medium text-accent-blue hover:underline">
              View bracket ↗
            </Link>
          )}
        </div>
        <p className="text-sm text-muted">{bracket ? "Generated — see the bracket view for live match status." : "Not generated yet."}</p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-card-title">
            Registrants (<span className="font-mono tabular-nums">{registrations.length}</span>)
          </h2>
          {registrations.length > 0 && (
            <a href={`/api/tournaments/${id}/registrants.csv`} className="text-sm font-medium text-accent-blue hover:underline">
              Export CSV
            </a>
          )}
        </div>
        {registrations.length === 0 ? (
          <p className="card py-8 text-center text-sm text-muted">No registrants yet.</p>
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
                        <Link href={`/admin/users/${reg.user.id}`} className="hover:text-accent-volt">
                          {reg.user.displayName} <span className="text-muted">(@{reg.user.handle})</span>
                        </Link>
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
      </div>
    </div>
  );
}
