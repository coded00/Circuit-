import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { LiveCounter } from "@/components/LiveCounter";
import { StatusPill, tournamentStatusInfo, battleStatusInfo } from "@/components/StatusPill";

export default async function Home() {
  const [user, liveTournamentCount, openBattleCount, tournaments, battles] = await Promise.all([
    getCurrentUser(),
    prisma.tournament.count({ where: { status: "LIVE" } }),
    prisma.battle.count({ where: { status: "OPEN", visibility: "OPEN" } }),
    prisma.tournament.findMany({
      where: { status: { in: ["OPEN", "LIVE"] } },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.battle.findMany({
      where: { status: "OPEN", visibility: "OPEN" },
      orderBy: { createdAt: "desc" },
      take: 2,
      include: { creator: { select: { displayName: true } } },
    }),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <section className="flex flex-col items-center gap-6 px-6 py-24 text-center">
        <LiveCounter label="competing right now" count={liveTournamentCount} />
        <h1 className="max-w-2xl text-5xl font-semibold tracking-tight text-balance">
          Run your tournament.
          <br />
          <span className="text-brand">Skip the WhatsApp chaos.</span>
        </h1>
        <p className="max-w-md text-lg text-muted text-balance">
          Tournament and 1v1 Battle platform built for Nigeria-first esports
          organizers — brackets, disputes, and payouts, handled.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {user ? (
            <>
              <Link
                href="/tournaments/new"
                className="rounded-full bg-brand px-6 py-3 font-medium text-brand-foreground shadow-sm shadow-brand/30 transition hover:bg-brand-strong"
              >
                Create a tournament
              </Link>
              <Link
                href="/battles/new"
                className="rounded-full border border-border-strong px-6 py-3 font-medium transition hover:bg-surface-hover"
              >
                Open a Battle
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/signup"
                className="rounded-full bg-brand px-6 py-3 font-medium text-brand-foreground shadow-sm shadow-brand/30 transition hover:bg-brand-strong"
              >
                Sign up
              </Link>
              <Link
                href="/login"
                className="rounded-full border border-border-strong px-6 py-3 font-medium transition hover:bg-surface-hover"
              >
                Log in
              </Link>
            </>
          )}
        </div>
      </section>

      {(tournaments.length > 0 || battles.length > 0) && (
        <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 pb-24">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Happening now</h2>
            <LiveCounter label={openBattleCount === 1 ? "open Battle" : "open Battles"} count={openBattleCount} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {tournaments.map((tournament) => {
              const status = tournamentStatusInfo(tournament.status);
              return (
                <Link
                  key={tournament.id}
                  href={`/tournaments/${tournament.id}`}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 transition hover:border-border-strong hover:bg-surface-hover"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted">{tournament.game}</span>
                    <StatusPill tone={status.tone} pulse={status.pulse}>
                      {status.label}
                    </StatusPill>
                  </div>
                  <span className="font-medium">{tournament.name}</span>
                  <span className="text-xs text-muted">
                    {tournament.entryFee === 0
                      ? "Free entry"
                      : `₦${(tournament.entryFee / 100).toLocaleString("en-NG")} entry`}{" "}
                    · {tournament.participantCap} players
                  </span>
                </Link>
              );
            })}

            {battles.map((battle) => {
              const status = battleStatusInfo(battle.status);
              return (
                <Link
                  key={battle.id}
                  href={`/battles/${battle.id}`}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 transition hover:border-border-strong hover:bg-surface-hover"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted">{battle.game}</span>
                    <StatusPill tone={status.tone} pulse={status.pulse}>
                      {status.label}
                    </StatusPill>
                  </div>
                  <span className="font-medium">
                    Battle · {battle.format === "BEST_OF_3" ? "Best of 3" : "Single match"}
                  </span>
                  <span className="text-xs text-muted">opened by {battle.creator.displayName}</span>
                </Link>
              );
            })}
          </div>

          <Link href="/battles" className="w-fit text-sm font-medium text-brand underline">
            See all open Battles →
          </Link>
        </section>
      )}
    </div>
  );
}
