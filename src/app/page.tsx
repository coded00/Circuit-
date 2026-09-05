/**
 * Circuit — homepage as a real discovery feed (maps: TRN-6/P1-4, BTL-2),
 * not a marketing page with a preview bolted on. Sectioned by timing and
 * status (start.gg's pattern, docs/circuit-ui-references.md) — Live Now,
 * Starting Soon, Registration Open, Recently Finished, plus a compact
 * Battles strip linking to the full board. Fully guest-browsable (ACC-1).
 */

import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { LiveCounter } from "@/components/LiveCounter";
import { StatusPill, tournamentStatusInfo } from "@/components/StatusPill";

const STARTING_SOON_WINDOW_MS = 48 * 60 * 60 * 1000;
const SECTION_LIMIT = 8;

type TournamentCard = {
  id: string;
  name: string;
  game: string;
  status: string;
  entryFee: number;
  participantCap: number;
  streamUrl: string | null;
};

function TournamentGrid({ tournaments }: { tournaments: TournamentCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tournaments.map((tournament) => {
        const status = tournamentStatusInfo(tournament.status);
        return (
          <Link
            key={tournament.id}
            href={`/tournaments/${tournament.id}`}
            className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 transition hover:border-border-strong hover:bg-surface-hover"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium text-muted">{tournament.game}</span>
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
              {tournament.streamUrl && " · 📺"}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const { game } = await searchParams;
  const gameFilter = game ? { game: { equals: game, mode: "insensitive" as const } } : {};
  const now = new Date();
  const soonThreshold = new Date(now.getTime() + STARTING_SOON_WINDOW_MS);

  const cardSelect = {
    id: true,
    name: true,
    game: true,
    status: true,
    entryFee: true,
    participantCap: true,
    streamUrl: true,
  } as const;

  const [
    user,
    liveTournamentCount,
    openBattleCount,
    liveTournaments,
    startingSoon,
    registrationOpen,
    recentlyFinished,
    battles,
  ] = await Promise.all([
    getCurrentUser(),
    prisma.tournament.count({ where: { status: "LIVE", ...gameFilter } }),
    prisma.battle.count({ where: { status: "OPEN", visibility: "OPEN", ...gameFilter } }),
    prisma.tournament.findMany({
      where: { status: "LIVE", ...gameFilter },
      orderBy: { createdAt: "desc" },
      take: SECTION_LIMIT,
      select: cardSelect,
    }),
    prisma.tournament.findMany({
      where: { status: "OPEN", startAt: { lte: soonThreshold }, ...gameFilter },
      orderBy: { startAt: "asc" },
      take: SECTION_LIMIT,
      select: cardSelect,
    }),
    prisma.tournament.findMany({
      where: { status: "OPEN", startAt: { gt: soonThreshold }, ...gameFilter },
      orderBy: { createdAt: "desc" },
      take: SECTION_LIMIT,
      select: cardSelect,
    }),
    prisma.tournament.findMany({
      where: { status: "COMPLETE", ...gameFilter },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: cardSelect,
    }),
    prisma.battle.findMany({
      where: { status: "OPEN", visibility: "OPEN", ...gameFilter },
      orderBy: { createdAt: "desc" },
      take: 4,
      include: { creator: { select: { displayName: true } } },
    }),
  ]);

  const nothingToShow =
    liveTournaments.length === 0 &&
    startingSoon.length === 0 &&
    registrationOpen.length === 0 &&
    recentlyFinished.length === 0 &&
    battles.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-10">
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <LiveCounter label="competing right now" count={liveTournamentCount} />
        <h1 className="max-w-xl text-3xl font-semibold tracking-tight text-balance">
          Find a tournament. <span className="text-brand">Skip the WhatsApp chaos.</span>
        </h1>
        {!user && (
          <div className="flex gap-3">
            <Link href="/signup" className="btn-primary">
              Sign up
            </Link>
            <Link href="/login" className="btn-secondary">
              Log in
            </Link>
          </div>
        )}
        {user && (
          <div className="flex gap-3">
            <Link href="/tournaments/new" className="btn-primary">
              Create a tournament
            </Link>
            <Link href="/battles/new" className="btn-secondary">
              Open a Battle
            </Link>
          </div>
        )}
      </div>

      <form className="mx-auto flex w-full max-w-md gap-2">
        <input
          type="text"
          name="game"
          defaultValue={game ?? ""}
          placeholder="Filter everything by game"
          className="field-input flex-1"
        />
        <button type="submit" className="btn-secondary">
          Filter
        </button>
        {game && (
          <Link href="/" className="btn-secondary">
            Clear
          </Link>
        )}
      </form>

      {nothingToShow ? (
        <p className="card text-center text-muted">
          {game ? `Nothing live for "${game}" right now.` : "Nothing live right now — be the first."}
        </p>
      ) : (
        <>
          <Section title="🔴 Live now" count={liveTournaments.length}>
            <TournamentGrid tournaments={liveTournaments} />
          </Section>

          <Section title="⏱ Starting soon" count={startingSoon.length}>
            <TournamentGrid tournaments={startingSoon} />
          </Section>

          <Section title="📝 Registration open" count={registrationOpen.length}>
            <TournamentGrid tournaments={registrationOpen} />
          </Section>

          <Section title="✅ Recently finished" count={recentlyFinished.length}>
            <TournamentGrid tournaments={recentlyFinished} />
          </Section>

          {battles.length > 0 && (
            <section className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">⚔️ Open Battles</h2>
                <LiveCounter
                  label={openBattleCount === 1 ? "open Battle" : "open Battles"}
                  count={openBattleCount}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {battles.map((battle) => (
                  <Link
                    key={battle.id}
                    href={`/battles/${battle.id}`}
                    className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 transition hover:border-border-strong hover:bg-surface-hover"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-muted">{battle.game}</span>
                      <StatusPill tone="live" pulse>
                        Open
                      </StatusPill>
                    </div>
                    <span className="font-medium">
                      {battle.format === "BEST_OF_3" ? "Best of 3" : "Single match"}
                      {battle.streamUrl && " · 📺"}
                    </span>
                    <span className="text-xs text-muted">opened by {battle.creator.displayName}</span>
                  </Link>
                ))}
              </div>
              <Link href="/battles" className="w-fit text-sm font-medium text-brand underline">
                See all open Battles →
              </Link>
            </section>
          )}
        </>
      )}
    </div>
  );
}
