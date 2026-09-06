/**
 * Circuit — tournament detail panel (Build Plan P5-2 + P5-4, maps: ORG-2,
 * REG-7, ORG-4). This is the "detail panel" half of the dashboard's
 * sidebar-plus-detail-panel shell (docs/circuit-ui-references.md, Linear)
 * — it renders inside src/app/dashboard/layout.tsx, sidebar always visible.
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
  if (tournament.organizerId !== user.id) {
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
  const payout = escrowTxns.find((t) => t.type === "PRIZE_PAYOUT");
  const status = tournamentStatusInfo(tournament.status);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <StatusPill tone={status.tone} pulse={status.pulse}>
          {status.label}
        </StatusPill>
        <h1 className="text-2xl font-semibold">{tournament.name}</h1>
        <div className="flex gap-3">
          <Link href={`/tournaments/${id}`} className="text-sm font-medium text-brand underline">
            Public page →
          </Link>
          <Link href={`/tournaments/${id}/edit`} className="text-sm font-medium text-brand underline">
            Edit →
          </Link>
        </div>
      </div>

      {openDisputes.length > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border border-status-cancelled/30 bg-status-cancelled/5 p-4">
          <h2 className="flex items-center gap-2 font-semibold text-status-cancelled">
            <AlertTriangle size={16} />
            Disputes need your ruling
          </h2>
          {openDisputes.map((dispute) => (
            <Link
              key={dispute.id}
              href={`/matches/${dispute.matchId}`}
              className="card-row flex items-center justify-between p-3"
            >
              <span>
                {dispute.match.playerA.displayName} vs {dispute.match.playerB.displayName}
              </span>
              <span className="text-brand underline">Rule now →</span>
            </Link>
          ))}
        </section>
      )}

      <section className="card grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <div className="text-xs text-muted">Entry fees collected</div>
          <div className="font-medium tabular-nums">{formatNaira(collected)}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Refunded</div>
          <div className="font-medium tabular-nums">{formatNaira(refunded)}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Prize payout</div>
          <div className="font-medium">
            {payout ? (payout.status === "COMPLETE" ? "Sent" : "Processing") : "Not yet claimed"}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Bracket</h2>
          {bracket && (
            <Link href={`/tournaments/${id}/bracket`} className="text-sm font-medium text-brand underline">
              View bracket →
            </Link>
          )}
        </div>
        <p className="text-sm text-muted">
          {bracket ? "Generated — see the bracket view for live match status." : "Not generated yet."}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Registrants (<span className="font-mono tabular-nums">{registrations.length}</span>)
          </h2>
          {registrations.length > 0 && (
            <a href={`/api/tournaments/${id}/registrants.csv`} className="text-sm font-medium text-brand underline">
              Export CSV
            </a>
          )}
        </div>
        {registrations.length === 0 ? (
          <p className="card text-center text-muted">No registrants yet.</p>
        ) : (
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="px-4 pt-4 pb-2 font-medium">Player</th>
                  <th className="px-4 pt-4 pb-2 font-medium">In-game ID</th>
                  <th className="px-4 pt-4 pb-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {registrations.map((reg) => {
                  const regStatus = registrationStatusInfo(reg.status);
                  return (
                    <tr key={reg.id} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">
                        {reg.user.displayName} <span className="text-muted">(@{reg.user.handle})</span>
                      </td>
                      <td className="px-4 py-3 text-muted">{reg.inGameId}</td>
                      <td className="px-4 py-3 text-right">
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
