/**
 * Circuit — homepage as a real discovery feed (maps: TRN-6/P1-4, BTL-2),
 * not a marketing page with a preview bolted on. Sectioned by timing and
 * status (start.gg's pattern, docs/circuit-ui-references.md) — Live Now,
 * Starting Soon, Registration Open, Recently Finished, plus a compact
 * Battles strip linking to the full board. Fully guest-browsable (ACC-1).
 *
 * Rebuilt for the NEXA reference: hero banner + Next Tournament spotlight
 * + Live Now + Leaderboard widgets, image-led cards via GameArtTile (no
 * real cover-art/photography source exists — see that component's own
 * comment). "Connect Your Accounts" deliberately does NOT live here — see
 * /account, since this page is guest-browsable and account-linking is a
 * private per-user action.
 */

import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { LiveCounter } from "@/components/LiveCounter";
import { StatusPill, tournamentStatusInfo } from "@/components/StatusPill";
import { GameArtTile } from "@/components/GameArtTile";
import { globalStandings } from "@/lib/standings";

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
  startAt: Date;
  _count: { registrations: number };
};

function formatCardDate(date: Date): string {
  return date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

function formatNaira(kobo: number): string {
  return kobo === 0 ? "Free entry" : `₦${(kobo / 100).toLocaleString("en-NG")} entry`;
}

function TournamentGrid({ tournaments }: { tournaments: TournamentCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tournaments.map((tournament) => {
        const status = tournamentStatusInfo(tournament.status);
        return (
          <Link key={tournament.id} href={`/tournaments/${tournament.id}`} className="group flex flex-col gap-2 overflow-hidden rounded-xl border border-border transition hover:border-border-strong">
            <GameArtTile game={tournament.game} className="h-28 w-full">
              <span className="absolute top-2 right-2">
                <StatusPill tone={status.tone} pulse={status.pulse}>
                  {status.label}
                </StatusPill>
              </span>
            </GameArtTile>
            <div className="flex flex-col gap-1 bg-surface p-3">
              <span className="truncate font-medium">{tournament.name}</span>
              <span className="text-xs text-muted">{formatCardDate(tournament.startAt)}</span>
              <span className="text-xs text-muted">
                {formatNaira(tournament.entryFee)} · {tournament._count.registrations}/{tournament.participantCap} players
                {tournament.streamUrl && " · 📺"}
              </span>
            </div>
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
      <h2 className="text-xs font-bold tracking-widest text-muted uppercase">{title}</h2>
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
    startAt: true,
    prizeAmount: true,
    prizeText: true,
    _count: { select: { registrations: { where: { status: "CONFIRMED" as const } } } },
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
    nextTournament,
    leaderboard,
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
    prisma.tournament.findFirst({
      where: { status: { in: ["OPEN", "LIVE"] } },
      orderBy: { startAt: "asc" },
      select: cardSelect,
    }),
    globalStandings(),
  ]);

  const nothingToShow =
    liveTournaments.length === 0 &&
    startingSoon.length === 0 &&
    registrationOpen.length === 0 &&
    recentlyFinished.length === 0 &&
    battles.length === 0;

  const liveNow = liveTournaments.slice(0, 2);
  const topLeaderboard = leaderboard.slice(0, 5);

  return (
    <div className="flex w-full flex-1 flex-col gap-10 px-6 py-10">
      {/* Hero */}
      <GameArtTile
        game={nextTournament?.game ?? "Circuit"}
        className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 rounded-2xl py-16 text-center"
      >
        <div className="relative z-10 flex flex-col items-center gap-4">
          <LiveCounter label="competing right now" count={liveTournamentCount} />
          <h1 className="max-w-xl text-4xl font-bold tracking-tight text-balance text-white sm:text-5xl">
            Find a tournament. <span className="text-brand-foreground/90">Skip the WhatsApp chaos.</span>
          </h1>
          {!user ? (
            <div className="flex gap-3">
              <Link href="/signup" className="btn-primary">
                Sign up
              </Link>
              <Link href="/login" className="btn-secondary bg-white/10 text-white hover:bg-white/20">
                Log in
              </Link>
            </div>
          ) : (
            <div className="flex gap-3">
              <Link href="/tournaments/new" className="btn-primary">
                Create a tournament
              </Link>
              <Link href="/battles/new" className="btn-secondary bg-white/10 text-white hover:bg-white/20">
                Open a Battle
              </Link>
            </div>
          )}
        </div>
      </GameArtTile>

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

      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-10">
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
                    <h2 className="text-xs font-bold tracking-widest text-muted uppercase">⚔️ Open Battles</h2>
                    <LiveCounter
                      label={openBattleCount === 1 ? "open Battle" : "open Battles"}
                      count={openBattleCount}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {battles.map((battle) => (
                      <Link key={battle.id} href={`/battles/${battle.id}`} className="group flex flex-col gap-2 overflow-hidden rounded-xl border border-border transition hover:border-border-strong">
                        <GameArtTile game={battle.game} className="h-20 w-full">
                          <span className="absolute top-2 right-2">
                            <StatusPill tone="live" pulse>
                              Open
                            </StatusPill>
                          </span>
                        </GameArtTile>
                        <div className="flex flex-col gap-1 bg-surface p-3">
                          <span className="font-medium">
                            {battle.format === "BEST_OF_3" ? "Best of 3" : "Single match"}
                            {battle.streamUrl && " · 📺"}
                          </span>
                          <span className="text-xs text-muted">opened by {battle.creator.displayName}</span>
                        </div>
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

        {/* Right column: Next Tournament spotlight, Live Now, Leaderboard */}
        <div className="flex flex-col gap-6">
          {nextTournament && (
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-bold tracking-widest text-muted uppercase">Next Tournament</h2>
              <Link
                href={`/tournaments/${nextTournament.id}`}
                className="flex flex-col overflow-hidden rounded-xl border border-border transition hover:border-border-strong"
              >
                <GameArtTile game={nextTournament.game} className="h-32 w-full" />
                <div className="flex flex-col gap-2 bg-surface p-4">
                  <span className="font-semibold">{nextTournament.name}</span>
                  <span className="text-xs text-muted">
                    {nextTournament.prizeAmount
                      ? `₦${(nextTournament.prizeAmount / 100).toLocaleString("en-NG")} prize pool`
                      : (nextTournament.prizeText ?? "No cash prize")}
                  </span>
                  <span className="text-xs text-muted">{formatCardDate(nextTournament.startAt)}</span>
                  <span className="btn-primary mt-1 w-full">Register Now</span>
                </div>
              </Link>
            </div>
          )}

          {liveNow.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-bold tracking-widest text-muted uppercase">Live Now</h2>
              <div className="grid grid-cols-2 gap-3">
                {liveNow.map((t) => (
                  <Link key={t.id} href={`/tournaments/${t.id}`} className="flex flex-col overflow-hidden rounded-xl border border-border">
                    <GameArtTile game={t.game} className="h-16 w-full">
                      <span className="absolute top-1.5 left-1.5">
                        <StatusPill tone="live" pulse size="sm">
                          Live
                        </StatusPill>
                      </span>
                    </GameArtTile>
                    <div className="bg-surface p-2 text-xs text-muted">
                      {t._count.registrations}/{t.participantCap} players
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {topLeaderboard.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-1 border-b border-border">
                <span className="border-b-2 border-brand px-2 py-1.5 text-xs font-semibold uppercase">Global</span>
                <span className="px-2 py-1.5 text-xs text-muted" title="Coming soon">
                  Friends
                </span>
                <span className="px-2 py-1.5 text-xs text-muted" title="Coming soon">
                  This Month
                </span>
              </div>
              <div className="card flex flex-col gap-2 p-3">
                {topLeaderboard.map((s, i) => (
                  <Link
                    key={s.userId}
                    href={`/players/${s.handle}`}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-hover"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span className="w-4 font-mono text-xs tabular-nums text-muted">{i + 1}</span>
                      {s.displayName}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-brand">{s.wins}W</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
