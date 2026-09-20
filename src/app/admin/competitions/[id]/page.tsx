/**
 * Circuit — admin tournament detail/manage (native to the admin shell).
 * Same real data the organizer's own `/dashboard/tournaments/[id]` shows
 * (registrants, escrow, disputes, bracket status) — deliberately not a
 * redirect out to that page, or to the public `/tournaments/[id]`: an
 * admin clicking something in the control center should stay in the
 * control center, not land back in the player-facing app's own chrome.
 * Bracket and dispute ruling are both admin-native now too
 * (`/admin/competitions/[id]/bracket`, `/admin/matches/[id]`). "View
 * public page" is the one remaining explicit, clearly-labeled exception
 * — opens in a new tab.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Snowflake } from "lucide-react";
import { prisma } from "@/lib/db";
import { StatusPill, registrationStatusInfo, tournamentStatusInfo } from "@/components/StatusPill";
import { CancelTournamentButton } from "@/components/admin/CancelTournamentButton";
import { FreezeFundsControl } from "@/components/admin/FreezeFundsControl";

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export default async function AdminCompetitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) notFound();

  const [registrations, escrowTxns, openDisputes, bracket, latestFreezeAction] = await Promise.all([
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
    // Freeze reason isn't duplicated onto Tournament itself — the most
    // recent freeze/unfreeze audit-log row is the source of truth for
    // "why," same reasoning as the schema field's own comment.
    prisma.auditLogEntry.findFirst({
      where: { targetType: "Tournament", targetId: id, action: { in: ["tournament.freezeFunds", "tournament.unfreezeFunds"] } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const collected = escrowTxns.filter((t) => t.type === "ENTRY_FEE" && t.status === "COMPLETE").reduce((s, t) => s + t.amount, 0);
  const platformFee = escrowTxns.filter((t) => t.type === "PLATFORM_FEE" && t.status === "COMPLETE").reduce((s, t) => s + t.amount, 0);
  const organizerRevenueSettled = escrowTxns.filter((t) => t.type === "ORGANIZER_REVENUE" && t.status === "COMPLETE").reduce((s, t) => s + t.amount, 0);
  const organizerRevenuePending = escrowTxns.filter((t) => t.type === "ORGANIZER_REVENUE" && t.status === "PENDING").reduce((s, t) => s + t.amount, 0);
  const refunded = escrowTxns.filter((t) => t.type === "REFUND").reduce((s, t) => s + t.amount, 0);
  const payout = escrowTxns.find((t) => t.type === "PRIZE_PAYOUT");
  const status = tournamentStatusInfo(tournament.status);
  // Matches tournaments/[id]/cancel/route.ts's own guard exactly — that
  // route stopped blocking cancellation once startAt passes (a live
  // tournament can still be voided/refunded), but this button's own
  // visibility condition was never updated to match, so it kept hiding
  // itself past startAt even though the API underneath would have
  // allowed the call. Found while wiring the freeze-funds condition in.
  const cancellable = tournament.status !== "CANCELLED" && tournament.status !== "COMPLETE" && !tournament.fundsFrozen;
  const freezeReason =
    tournament.fundsFrozen && latestFreezeAction?.action === "tournament.freezeFunds"
      ? ((latestFreezeAction.metadata as { reason?: string } | null)?.reason ?? null)
      : null;

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
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-4">
            <Link href={`/tournaments/${id}`} target="_blank" className="text-sm font-medium text-accent-blue hover:underline">
              View public page ↗
            </Link>
            <Link href={`/admin/competitions/${id}/edit`} className="btn-secondary text-sm">
              Edit
            </Link>
            {cancellable && <CancelTournamentButton tournamentId={id} />}
          </div>
          {tournament.cancellationLockAt && cancellable && (
            <span className="text-xs text-muted">
              {new Date() < tournament.cancellationLockAt
                ? `Organizer can cancel until ${formatDateTime(tournament.cancellationLockAt)}`
                : `Past the cancellation lock (${formatDateTime(tournament.cancellationLockAt)}) — staff-only now`}
            </span>
          )}
        </div>
      </div>

      {tournament.fundsFrozen && (
        <section className="alert alert-danger flex-col items-stretch gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-danger">
            <Snowflake size={16} />
            Funds frozen — payouts and cancellation are blocked
          </h2>
          {freezeReason && <p className="text-sm">{freezeReason}</p>}
        </section>
      )}

      <div className="card flex flex-col items-start gap-2">
        <h2 className="text-card-title">Fund controls</h2>
        <p className="text-sm text-muted">
          Freezing blocks the prize-payout claim and cancel-with-refund actions for this tournament until unfrozen —
          use this while investigating a dispute or a suspected issue, not as a routine action.
        </p>
        <FreezeFundsControl tournamentId={id} fundsFrozen={tournament.fundsFrozen} freezeReason={freezeReason} />
      </div>

      {openDisputes.length > 0 && (
        <section className="alert alert-warning flex-col items-stretch gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-warning">
            <AlertTriangle size={16} />
            Disputes need a ruling
          </h2>
          {openDisputes.map((dispute) => (
            <Link key={dispute.id} href={`/admin/matches/${dispute.matchId}`} className="card-row flex items-center justify-between gap-3 p-3">
              <span className="truncate font-medium">
                {dispute.match.playerA.displayName} vs {dispute.match.playerB.displayName}
              </span>
              <span className="shrink-0 text-sm font-medium text-accent-blue">Rule now →</span>
            </Link>
          ))}
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Entry fees collected</span>
          <span className="text-stat text-xl">{formatNaira(collected)}</span>
        </div>
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Platform fee</span>
          <span className="text-stat text-xl">{formatNaira(platformFee)}</span>
        </div>
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Organizer revenue</span>
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
          <span className="text-stat text-xl">{payout ? (payout.status === "COMPLETE" ? "Sent" : "Processing") : "Not yet claimed"}</span>
        </div>
      </div>

      <div className="card flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-card-title">Bracket</h2>
          {bracket && (
            <Link href={`/admin/competitions/${id}/bracket`} className="text-sm font-medium text-accent-blue hover:underline">
              View bracket →
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
