import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertCircle, CalendarClock, ChevronLeft, Trophy, Wallet } from "lucide-react";
import { loginPath } from "@/lib/safeRedirect";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { captainTeamOptions, describeRoster, rosterBounds } from "@/lib/teamEntries";
import { refundConditions, registrationBlockers } from "@/lib/registrationEligibility";
import { tournamentPath } from "@/lib/seo";
import RegistrationForm from "./RegistrationForm";

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG")}`;
const when = (d: Date) => d.toLocaleString("en-NG", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(loginPath(`/tournaments/${id}/register`));
  }

  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) {
    notFound();
  }

  const [registered, existing] = await Promise.all([
    prisma.registration.count({ where: { tournamentId: tournament.id, status: "CONFIRMED" } }),
    prisma.registration.findFirst({ where: { tournamentId: tournament.id, userId: user.id, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } }, select: { status: true } }),
  ]);
  // Already in: nothing to fill in, go to the tournament.
  if (existing?.status === "CONFIRMED") redirect(tournamentPath(tournament));

  const isTeam = tournament.entryType === "TEAM";
  const blockers = registrationBlockers({ tournament, user, registered });

  if (blockers.length > 0) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
        <Link href={tournamentPath(tournament)} className="flex w-fit items-center gap-1 text-sm text-muted transition hover:text-foreground">
          <ChevronLeft size={16} /> Back to tournament
        </Link>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{tournament.name}</h1>
        <div className="card flex flex-col gap-4" role="alert">
          <div className="flex items-center gap-2 text-sm font-semibold text-accent-orange">
            <AlertCircle size={18} /> You can&apos;t register yet
          </div>
          <ul className="flex flex-col gap-3">
            {blockers.map((b) => (
              <li key={b.title} className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold">{b.title}</span>
                <span className="text-sm text-muted">{b.detail}</span>
                {b.fix && (
                  <Link href={b.fix.href} className="mt-1 w-fit text-sm font-semibold text-accent-blue hover:underline">
                    {b.fix.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const bounds = rosterBounds(tournament);
  const teamOptions = isTeam ? await captainTeamOptions(user.id, tournament.id) : [];
  const savedName = tournament.gameId
    ? (await prisma.userGameName.findUnique({ where: { userId_gameId: { userId: user.id, gameId: tournament.gameId } }, select: { name: true } }))?.name ?? null
    : null;
  const paid = tournament.entryFee > 0;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <Link href={tournamentPath(tournament)} className="flex w-fit items-center gap-1 text-sm text-muted transition hover:text-foreground">
        <ChevronLeft size={16} /> Back to tournament
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {isTeam ? "Enter your team in" : "Register for"} {tournament.name}
        </h1>
        <p className="text-sm text-muted">
          {tournament.game} · {tournament.modeName ?? tournament.teamSize}
          {isTeam ? ` · teams of ${tournament.playersPerTeam} · roster of ${describeRoster(bounds)}` : ""}
        </p>
      </div>

      {/* What you're signing up for: cost, dates and what happens to your money. */}
      <section className="card flex flex-col gap-4" aria-label="Entry summary">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] font-medium tracking-wide text-muted uppercase">Entry fee</dt>
            <dd className={`text-stat text-lg ${paid ? "" : "text-success"}`}>{paid ? `${naira(tournament.entryFee)} NGN` : "Free"}</dd>
          </div>
          {tournament.prizeAmount ? (
            <div className="flex flex-col gap-0.5">
              <dt className="flex items-center gap-1 text-[11px] font-medium tracking-wide text-muted uppercase">
                <Trophy size={12} aria-hidden /> Prize pool
              </dt>
              <dd className="text-stat text-lg text-gold">{naira(tournament.prizeAmount)}</dd>
            </div>
          ) : null}
          <div className="col-span-2 flex items-start gap-2 text-muted">
            <CalendarClock size={15} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              Registration closes {when(tournament.registrationCloseAt)}. The tournament starts {when(tournament.startAt)}.
            </span>
          </div>
          {paid && (
            <div className="col-span-2 flex items-start gap-2 text-muted">
              <Wallet size={15} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                Payment status: <strong className="font-semibold text-foreground">not paid yet</strong>. You pay by card (Paystack) or from your wallet in the next step, and your spot is confirmed once it goes through.
              </span>
            </div>
          )}
        </dl>
        {paid && (
          <div className="flex flex-col gap-1.5 rounded-[var(--radius-md)] bg-surface-elevated p-3.5">
            <span className="text-[11px] font-semibold tracking-wide uppercase">Refund conditions</span>
            <ul className="ml-4 list-disc space-y-1 text-[13px] leading-relaxed text-muted">
              {refundConditions(tournament).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="card">
        <RegistrationForm
          tournamentId={tournament.id}
          entryFee={tournament.entryFee}
          walletBalance={user.walletBalance}
          username={user.handle}
          savedName={savedName}
          rulesText={tournament.rulesText}
          team={isTeam ? { options: teamOptions, bounds, profileHref: `/players/${user.handle}?tab=teams`, hasPrize: (tournament.prizeAmount ?? 0) > 0 } : undefined}
        />
      </div>
    </div>
  );
}
