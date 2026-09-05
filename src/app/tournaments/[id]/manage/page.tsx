/**
 * Circuit — per-tournament organizer view (Build Plan P5-2 + P5-4, maps:
 * ORG-2, REG-7, ORG-4). Registrant list with payment status, bracket
 * state, escrow visibility, and any open disputes — surfaced above the
 * fold per P5-2's own acceptance criteria, not buried at the bottom.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { StatusPill, registrationStatusInfo } from "@/components/StatusPill";

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

export default async function ManageTournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/tournaments/${id}/manage`)}`);
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
  const refunded = escrowTxns
    .filter((t) => t.type === "REFUND")
    .reduce((sum, t) => sum + t.amount, 0);
  const payout = escrowTxns.find((t) => t.type === "PRIZE_PAYOUT");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard" className="w-fit text-xs text-muted hover:text-foreground">
          ← Your tournaments
        </Link>
        <h1 className="text-2xl font-semibold">{tournament.name}</h1>
        <Link href={`/tournaments/${id}`} className="w-fit text-sm text-brand underline">
          View public page →
        </Link>
      </div>

      {openDisputes.length > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border border-status-cancelled/30 bg-status-cancelled/5 p-4">
          <h2 className="font-semibold text-status-cancelled">⚠️ Disputes need your ruling</h2>
          {openDisputes.map((dispute) => (
            <Link
              key={dispute.id}
              href={`/matches/${dispute.matchId}`}
              className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 text-sm hover:bg-surface-hover"
            >
              <span>
                {dispute.match.playerA.displayName} vs {dispute.match.playerB.displayName}
              </span>
              <span className="text-brand underline">Rule now →</span>
            </Link>
          ))}
        </section>
      )}

      <section className="card grid grid-cols-3 gap-4">
        <div>
          <div className="text-xs text-muted">Entry fees collected</div>
          <div className="font-medium">{formatNaira(collected)}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Refunded</div>
          <div className="font-medium">{formatNaira(refunded)}</div>
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
        <h2 className="text-lg font-semibold">Registrants ({registrations.length})</h2>
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
                  const status = registrationStatusInfo(reg.status);
                  return (
                    <tr key={reg.id} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">
                        {reg.user.displayName} <span className="text-muted">(@{reg.user.handle})</span>
                      </td>
                      <td className="px-4 py-3 text-muted">{reg.inGameId}</td>
                      <td className="px-4 py-3 text-right">
                        <StatusPill tone={status.tone}>{status.label}</StatusPill>
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
