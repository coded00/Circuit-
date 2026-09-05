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
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { StatusPill, tournamentStatusInfo } from "@/components/StatusPill";
import CancelButton from "./CancelButton";
import WithdrawButton from "./WithdrawButton";

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <StatusPill tone={status.tone} pulse={status.pulse}>
            {status.label}
          </StatusPill>
          {(tournament.status === "LIVE" || tournament.status === "COMPLETE") && (
            <Link
              href={`/tournaments/${tournament.id}/bracket`}
              className="text-sm font-medium text-brand underline"
            >
              View bracket →
            </Link>
          )}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{tournament.name}</h1>
        <p className="text-muted">{tournament.game} · Single-elimination knockout</p>
      </div>

      <div className="card grid grid-cols-2 gap-5 sm:grid-cols-4">
        <div>
          <div className="text-xs text-muted">Entry fee</div>
          <div className="font-medium">
            {tournament.entryFee === 0 ? "Free" : formatNaira(tournament.entryFee)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">Prize</div>
          <div className="font-medium">
            {tournament.prizeAmount ? formatNaira(tournament.prizeAmount) : (tournament.prizeText ?? "—")}
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <div className="text-xs text-muted">Registrants</div>
          <div className="font-medium">
            {registrantCount} / {tournament.participantCap}
          </div>
          <div className="mt-1.5 h-1.5 w-full max-w-24 overflow-hidden rounded-full bg-surface-hover">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${fillPct}%` }} />
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">Starts</div>
          <div className="font-medium">{formatDate(tournament.startAt)}</div>
        </div>
      </div>

      <div className="flex flex-col gap-1 text-sm text-muted">
        <span>Registration opens {formatDate(tournament.registrationOpenAt)}</span>
        <span>Registration closes {formatDate(tournament.registrationCloseAt)}</span>
      </div>

      {tournament.prizeText && tournament.prizeAmount ? (
        <p className="text-sm text-muted">{tournament.prizeText}</p>
      ) : null}

      <div className="flex flex-col gap-1">
        {tournament.status === "CANCELLED" ? (
          <p className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            This tournament has been cancelled. Paid entries have been refunded.
          </p>
        ) : isOrganizer ? (
          <CancelButton tournamentId={tournament.id} />
        ) : myRegistration?.status === "CONFIRMED" ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">You&apos;re registered for this tournament.</p>
            {now < tournament.registrationCloseAt &&
              tournament.status !== "LIVE" &&
              tournament.status !== "COMPLETE" && (
                <WithdrawButton registrationId={myRegistration.id} />
              )}
          </div>
        ) : myRegistration?.status === "PENDING_PAYMENT" ? (
          <p className="text-sm text-muted">
            Your payment is processing.{" "}
            <Link
              href={`/tournaments/${tournament.id}/register/callback?ref=${myRegistration.paymentRef}`}
              className="font-medium text-brand underline"
            >
              Check status
            </Link>
          </p>
        ) : registrationOpen ? (
          <Link href={`/tournaments/${tournament.id}/register`} className="btn-primary w-fit">
            Register
          </Link>
        ) : (
          <p className="text-sm text-muted">
            {now < tournament.registrationOpenAt
              ? "Registration hasn't opened yet."
              : now >= tournament.registrationCloseAt
                ? "Registration is closed."
                : "Registration is full."}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-6">
        <h2 className="text-lg font-semibold">Rules</h2>
        <p className="whitespace-pre-wrap text-sm text-muted">{tournament.rulesText}</p>
      </div>
    </div>
  );
}
