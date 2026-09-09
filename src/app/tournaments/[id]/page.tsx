/**
 * Circuit — public tournament page (Build Plan P1-2, maps: TRN-2, TRN-3).
 * Registration/withdraw/cancel controls added in P2-1..P2-5.
 *
 * No login required to view — every field here must be visible to a
 * guest, per TRN-3's acceptance criteria. Viewer-specific actions
 * (register, withdraw, cancel) only render once we know who's looking.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { Tv } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { StatusPill, tournamentStatusInfo } from "@/components/StatusPill";
import CancelButton from "./CancelButton";
import WithdrawButton from "./WithdrawButton";
import ClaimPrizeButton from "./ClaimPrizeButton";

function formatNaira(kobo: number): string {
  return `₦ ${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

function formatDate(date: Date): string {
  return date.toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) {
    notFound();
  }

  const [registrantCount, user] = await Promise.all([
    prisma.registration.count({ where: { tournamentId: tournament.id, status: "CONFIRMED" } }),
    getCurrentUser(),
  ]);

  const myRegistration = user
    ? await prisma.registration.findUnique({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: user.id } },
      })
    : null;

  const now = new Date();
  const isOrganizer = user !== null && tournament.organizerId === user.id;
  const registrationOpen =
    tournament.status !== "CANCELLED" &&
    now >= tournament.registrationOpenAt &&
    now < tournament.registrationCloseAt &&
    registrantCount < tournament.participantCap;
  const status = tournamentStatusInfo(tournament.status);
  const fillPct = Math.min(100, Math.round((registrantCount / tournament.participantCap) * 100));

  let canClaimPrize = false;
  if (user && tournament.status === "COMPLETE" && tournament.prizeAmount && tournament.prizeAmount > 0) {
    const [finalMatch, existingPayout] = await Promise.all([
      prisma.match.findFirst({
        where: { tournamentId: tournament.id, round: { not: null } },
        orderBy: { round: "desc" },
      }),
      prisma.escrowTransaction.findFirst({ where: { tournamentId: tournament.id, type: "PRIZE_PAYOUT" } }),
    ]);
    canClaimPrize = finalMatch?.winnerId === user.id && !existingPayout;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6 sm:p-8">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill tone={status.tone} pulse={status.pulse}>
            {status.label}
          </StatusPill>
          {(tournament.status === "LIVE" || tournament.status === "COMPLETE") && (
            <Link
              href={`/tournaments/${tournament.id}/bracket`}
              className="text-sm font-medium text-brand-blue hover:underline"
            >
              View bracket →
            </Link>
          )}
          {tournament.streamUrl && (
            <a
              href={tournament.streamUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-blue hover:underline"
            >
              <Tv size={14} />
              Watch stream
            </a>
          )}
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{tournament.name}</h1>
        <p className="text-sm text-muted">{tournament.game} · Single-elimination knockout</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="widget flex flex-col gap-1.5">
          <span className="text-eyebrow">Entry fee</span>
          <span className="text-stat text-lg">
            {tournament.entryFee === 0 ? "Free" : formatNaira(tournament.entryFee)}
          </span>
        </div>
        <div className="widget flex flex-col gap-1.5">
          <span className="text-eyebrow">Prize</span>
          <span className={`text-stat text-lg ${tournament.prizeAmount ? "text-gold" : ""}`}>
            {tournament.prizeAmount ? formatNaira(tournament.prizeAmount) : (tournament.prizeText ?? "—")}
          </span>
        </div>
        <div className="widget flex flex-col gap-1.5">
          <span className="text-eyebrow">Registrants</span>
          <span className="text-stat text-lg">
            {registrantCount} / {tournament.participantCap}
          </span>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
            <div className="h-full rounded-full" style={{ width: `${fillPct}%`, background: "var(--brand-gradient)" }} />
          </div>
        </div>
        <div className="widget flex flex-col gap-1.5">
          <span className="text-eyebrow">Starts</span>
          <span className="text-stat text-lg">{formatDate(tournament.startAt)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1 text-sm text-muted sm:flex-row sm:items-center sm:gap-3">
        <span>Registration opens {formatDate(tournament.registrationOpenAt)}</span>
        <span className="hidden text-muted-strong sm:inline">·</span>
        <span>Registration closes {formatDate(tournament.registrationCloseAt)}</span>
      </div>

      {tournament.prizeText && tournament.prizeAmount ? (
        <p className="text-sm text-muted">{tournament.prizeText}</p>
      ) : null}

      <div className="flex flex-col gap-3">
        {tournament.status === "CANCELLED" ? (
          <p className="alert alert-danger">
            This tournament has been cancelled. Paid entries have been refunded.
          </p>
        ) : isOrganizer ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/dashboard/tournaments/${tournament.id}`} className="btn-secondary">
              Manage
            </Link>
            {now < tournament.registrationCloseAt && (
              <Link href={`/tournaments/${tournament.id}/edit`} className="btn-ghost">
                Edit
              </Link>
            )}
            <CancelButton tournamentId={tournament.id} />
          </div>
        ) : myRegistration?.status === "CONFIRMED" ? (
          <div className="alert alert-success flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>You&apos;re registered for this tournament.</p>
            {now < tournament.registrationCloseAt &&
              tournament.status !== "LIVE" &&
              tournament.status !== "COMPLETE" && (
                <WithdrawButton registrationId={myRegistration.id} />
              )}
          </div>
        ) : myRegistration?.status === "PENDING_PAYMENT" ? (
          <p className="alert alert-warning">
            Your payment is processing.{" "}
            <Link
              href={`/tournaments/${tournament.id}/register/callback?ref=${myRegistration.paymentRef}`}
              className="font-medium underline"
            >
              Check status
            </Link>
          </p>
        ) : registrationOpen ? (
          <Link href={`/tournaments/${tournament.id}/register`} className="btn-primary w-full sm:w-fit">
            Register
          </Link>
        ) : (
          <p className="card text-center text-sm text-muted">
            {now < tournament.registrationOpenAt
              ? "Registration hasn't opened yet."
              : now >= tournament.registrationCloseAt
                ? "Registration is closed."
                : "Registration is full."}
          </p>
        )}
      </div>

      {canClaimPrize && <ClaimPrizeButton tournamentId={tournament.id} />}

      <div className="flex flex-col gap-2 border-t border-border pt-6">
        <h2 className="text-section-heading">Rules</h2>
        <p className="whitespace-pre-wrap text-sm text-muted">{tournament.rulesText}</p>
      </div>
    </div>
  );
}
