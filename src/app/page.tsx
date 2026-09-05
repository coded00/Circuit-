/**
 * Circuit — homepage as a real discovery feed (maps: TRN-6/P1-4, BTL-2),
 * not a marketing page with a preview bolted on. Sectioned by timing and
 * status (start.gg's pattern) — Live Now, Starting Soon, Registration
 * Open, Recently Finished, plus a compact Battles strip. Fully
 * guest-browsable (ACC-1).
 *
 * Laid out stroke-for-stroke against the NEXA reference screenshot: a
 * left-aligned hero banner, a "Connect Your Accounts" row directly below
 * it, a horizontally-scrolling (carousel) card row per section, and a
 * right-hand column with a Next Tournament spotlight, Live Now grid, and
 * Leaderboard widget. The underlying data/sections are Circuit's own
 * (kept exactly as already built) — only the visual structure/positioning
 * matches the reference. Cards use GameArtTile's generated gradient art
 * (no real cover-art/photography source exists).
 */

import Link from "next/link";
import { Calendar, Users, Swords, Radio, Clock, ClipboardList, CheckCircle2, Tv, Trophy, type LucideIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { LiveCounter } from "@/components/LiveCounter";
import { StatusPill, tournamentStatusInfo } from "@/components/StatusPill";
import { GameArtTile } from "@/components/GameArtTile";
import { ConnectAccountsRow } from "@/components/ConnectAccountsRow";
import { HeroCarousel } from "@/components/HeroCarousel";
import { CardCarousel } from "@/components/CardCarousel";
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
  prizeAmount: number | null;
  prizeText: string | null;
  _count: { registrations: number };
};

function formatCardDate(date: Date): string {
  return date.toLocaleString("en-NG", { dateStyle: "medium" });
}

function formatNaira(kobo: number): string {
  return `₦ ${(kobo / 100).toLocaleString("en-NG")}`;
}

/** Red is reserved for true LIVE/broadcast indicators and alerts per the
 *  NEXA design brief — StatusPill's shared "live" tone stays green
 *  elsewhere (Battles' "Open" status, etc. — a different, non-broadcast
 *  meaning this pass doesn't touch), so this is a local, literal-LIVE-only
 *  badge rather than a change to the shared component's semantics. */
function LiveBadge() {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-status-cancelled/15 px-2.5 py-1 text-xs font-medium text-status-cancelled">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      Live
    </span>
  );
}

function PrizeOrEntry({ tournament }: { tournament: TournamentCard }) {
  if (tournament.prizeAmount) {
    return <span className="text-sm font-bold tabular-nums text-gold">{formatNaira(tournament.prizeAmount)} prize</span>;
  }
  return (
    <span className="text-sm font-bold tabular-nums text-brand">
      {tournament.entryFee === 0 ? "Free entry" : `${formatNaira(tournament.entryFee)} entry`}
    </span>
  );
}

/** A hero slide for one real live tournament — same cinematic-slide shape
 *  as the brand slide, background swapped for GameArtTile so each slide
 *  still reads as a distinct tournament rather than a repeated banner. */
function HeroTournamentSlide({ tournament }: { tournament: TournamentCard }) {
  return (
    <Link
      href={`/tournaments/${tournament.id}`}
      className="relative flex min-h-72 w-full flex-col justify-center overflow-hidden rounded-2xl"
    >
      <GameArtTile game={tournament.game} className="absolute inset-0" />
      <div className="relative z-10 flex flex-col items-start gap-3 p-8">
        <span className="absolute top-2 right-2">
          <LiveBadge />
        </span>
        <span className="text-xs font-semibold tracking-wide text-white/70 uppercase">{tournament.game}</span>
        <h2 className="max-w-md text-3xl leading-tight font-bold text-white sm:text-4xl">{tournament.name}</h2>
        <div className="flex items-center gap-4">
          <PrizeOrEntry tournament={tournament} />
          <span className="flex items-center gap-1.5 text-sm text-white/80">
            <Users size={14} />
            {tournament._count.registrations}/{tournament.participantCap} players
          </span>
        </div>
        <span className="btn-primary mt-1 whitespace-nowrap">View tournament</span>
      </div>
    </Link>
  );
}

function TournamentGrid({ tournaments }: { tournaments: TournamentCard[] }) {
  return (
    <CardCarousel>
      {tournaments.map((tournament) => {
        const status = tournamentStatusInfo(tournament.status);
        return (
          <Link
            key={tournament.id}
            href={`/tournaments/${tournament.id}`}
            className="flex w-64 shrink-0 snap-start flex-col gap-2 overflow-hidden rounded-xl border border-border shadow-lg shadow-black/30 transition hover:border-border-strong"
          >
            <GameArtTile game={tournament.game} className="h-32 w-full">
              <span className="absolute top-2 right-2">
                {tournament.status === "LIVE" ? <LiveBadge /> : (
                  <StatusPill tone={status.tone} pulse={status.pulse}>
                    {status.label}
                  </StatusPill>
                )}
              </span>
            </GameArtTile>
            <div className="flex flex-col gap-1.5 bg-surface p-3">
              <span className="truncate font-semibold">{tournament.name}</span>
              <span className="truncate text-xs text-muted">{tournament.game}</span>
              <PrizeOrEntry tournament={tournament} />
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <Calendar size={12} />
                {formatCardDate(tournament.startAt)}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <Users size={12} />
                {tournament._count.registrations}/{tournament.participantCap} players
                {tournament.streamUrl && <Tv size={12} />}
              </span>
            </div>
          </Link>
        );
      })}
    </CardCarousel>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  viewAllHref,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  viewAllHref?: string;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Icon size={17} className="text-muted" />
          {title}
        </h2>
        {viewAllHref && (
          <Link href={viewAllHref} className="text-xs font-medium text-brand hover:underline">
            View All →
          </Link>
        )}
      </div>
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

  // Hero is a carousel: slide 0 is always Circuit's own brand pitch;
  // additional slides are real LIVE tournaments (capped at 3) rather than
  // invented promotional content — nothing to show, no extra slides.
  const heroBrandSlide = (
    <div
      className="relative flex min-h-72 w-full flex-col justify-center overflow-hidden rounded-2xl p-8"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 650px 500px at 88% 20%, rgba(124,58,237,0.45), transparent 65%)," +
          "radial-gradient(ellipse 450px 400px at 15% 90%, rgba(37,42,90,0.5), transparent 70%)," +
          "linear-gradient(135deg, #0b0d10, #140f1f 55%, #1a0f24)",
      }}
    >
      <div className="relative z-10 flex flex-col items-start gap-4">
        <LiveCounter label="competing right now" count={liveTournamentCount} />
        <h1 className="max-w-md text-4xl leading-[1.05] font-bold tracking-tight text-white sm:text-5xl">
          Play.
          <br />
          Compete.
          <br />
          Get Paid.
        </h1>
        <p className="max-w-xs text-sm text-white/80">
          Find a tournament. Join a Battle. Skip the WhatsApp chaos.
        </p>
        {!user ? (
          <div className="flex flex-wrap gap-3">
            <Link href="/signup" className="btn-primary whitespace-nowrap">
              Sign up
            </Link>
            <Link href="/login" className="btn-secondary gap-1.5 bg-white/10 whitespace-nowrap text-white hover:bg-white/20">
              Log in
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            <Link href="/tournaments/new" className="btn-primary whitespace-nowrap">
              Create a tournament
            </Link>
            <Link href="/battles/new" className="btn-secondary gap-1.5 bg-white/10 whitespace-nowrap text-white hover:bg-white/20">
              <Swords size={14} />
              Open a Battle
            </Link>
          </div>
        )}
      </div>
    </div>
  );

  const heroSlides = [
    heroBrandSlide,
    ...liveTournaments.slice(0, 3).map((t) => <HeroTournamentSlide key={t.id} tournament={t} />),
  ];

  return (
    <div className="flex w-full flex-1 flex-col gap-10 px-6 py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        {/* Hero row — its own explicit container, exactly two divs:
            the carousel (80%) and the Next Tournament card (20%), not
            reliant on the content grid below happening to line up. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[80%_20%]">
          <div>
            <HeroCarousel slides={heroSlides} />
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            {nextTournament && (
              <>
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Trophy size={15} className="text-muted" />
                  Next Tournament
                </h2>
                <Link
                  href={`/tournaments/${nextTournament.id}`}
                  className="flex flex-col overflow-hidden rounded-xl border border-border shadow-lg shadow-black/30 transition hover:border-border-strong"
                >
                  <GameArtTile game={nextTournament.game} className="h-32 w-full">
                    {nextTournament.status === "LIVE" && (
                      <span className="absolute top-2 right-2">
                        <LiveBadge />
                      </span>
                    )}
                  </GameArtTile>
                  <div className="flex flex-col gap-2 bg-surface p-4">
                    <span className="font-semibold">{nextTournament.name}</span>
                    <div>
                      <div className={`text-2xl font-bold tabular-nums ${nextTournament.prizeAmount ? "text-gold" : "text-brand"}`}>
                        {nextTournament.prizeAmount ? formatNaira(nextTournament.prizeAmount) : formatNaira(nextTournament.entryFee)}
                      </div>
                      <div className="text-xs text-muted">
                        {nextTournament.prizeAmount ? "Prize pool" : nextTournament.entryFee === 0 ? "Free entry" : "Entry fee"}
                      </div>
                    </div>
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <Calendar size={12} />
                      {formatCardDate(nextTournament.startAt)}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <Users size={12} />
                      {nextTournament._count.registrations}/{nextTournament.participantCap} players
                    </span>
                    <span className="btn-primary mt-1 w-full">Register Now</span>
                  </div>
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Content row — a separate 2-column grid for everything else,
            independent of the hero row above. */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-10">
          <ConnectAccountsRow />

          <form className="flex w-full max-w-md gap-2">
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
              <Section icon={Radio} title="Live now" count={liveTournaments.length}>
                <TournamentGrid tournaments={liveTournaments} />
              </Section>

              <Section icon={Clock} title="Starting soon" count={startingSoon.length}>
                <TournamentGrid tournaments={startingSoon} />
              </Section>

              <Section icon={ClipboardList} title="Registration open" count={registrationOpen.length}>
                <TournamentGrid tournaments={registrationOpen} />
              </Section>

              <Section icon={CheckCircle2} title="Recently finished" count={recentlyFinished.length}>
                <TournamentGrid tournaments={recentlyFinished} />
              </Section>

              {battles.length > 0 && (
                <section className="flex min-w-0 flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-base font-semibold">
                      <Swords size={17} className="text-muted" />
                      Open Battles
                    </h2>
                    <div className="flex items-center gap-3">
                      <LiveCounter
                        label={openBattleCount === 1 ? "open Battle" : "open Battles"}
                        count={openBattleCount}
                      />
                      <Link href="/battles" className="text-xs font-medium text-brand hover:underline">
                        View All →
                      </Link>
                    </div>
                  </div>
                  <CardCarousel>
                    {battles.map((battle) => (
                      <Link
                        key={battle.id}
                        href={`/battles/${battle.id}`}
                        className="flex w-64 shrink-0 snap-start flex-col gap-2 overflow-hidden rounded-xl border border-border shadow-lg shadow-black/30 transition hover:border-border-strong"
                      >
                        <GameArtTile game={battle.game} className="h-28 w-full">
                          <span className="absolute top-2 right-2">
                            <StatusPill tone="live" pulse>
                              Open
                            </StatusPill>
                          </span>
                        </GameArtTile>
                        <div className="flex flex-col gap-1.5 bg-surface p-3">
                          <span className="flex items-center gap-1.5 font-semibold">
                            {battle.format === "BEST_OF_3" ? "Best of 3" : "Single match"}
                            {battle.streamUrl && <Tv size={13} className="text-muted" />}
                          </span>
                          <span className="text-xs text-muted">opened by {battle.creator.displayName}</span>
                        </div>
                      </Link>
                    ))}
                  </CardCarousel>
                </section>
              )}
            </>
          )}
        </div>

        {/* Right column: Live Now, Leaderboard (Next Tournament now lives
            in the dedicated hero row above) */}
        <div className="flex min-w-0 flex-col gap-6">
          {liveNow.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Radio size={15} className="text-muted" />
                Live Now
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {liveNow.map((t) => (
                  <Link key={t.id} href={`/tournaments/${t.id}`} className="overflow-hidden rounded-xl border border-border shadow-lg shadow-black/30">
                    <GameArtTile game={t.game} className="h-24 w-full">
                      <span className="absolute top-1.5 left-1.5">
                        <LiveBadge />
                      </span>
                      <span className="absolute right-1.5 bottom-6 left-1.5 truncate text-[10px] text-white/90">
                        {t._count.registrations}/{t.participantCap} players
                      </span>
                    </GameArtTile>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {topLeaderboard.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Trophy size={15} className="text-muted" />
                Leaderboard
              </h2>
              <div className="flex gap-1 border-b border-border">
                <span className="border-b-2 border-brand px-2 py-1.5 text-xs font-semibold">Global</span>
                <span className="px-2 py-1.5 text-xs text-muted" title="Coming soon">
                  Friends
                </span>
                <span className="px-2 py-1.5 text-xs text-muted" title="Coming soon">
                  This Month
                </span>
              </div>
              <div className="card flex flex-col gap-1 p-3">
                {topLeaderboard.map((s, i) => (
                  <Link
                    key={s.userId}
                    href={`/players/${s.handle}`}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-hover"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span className="w-4 font-mono text-xs tabular-nums text-muted">{i + 1}</span>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface-hover text-xs font-semibold text-muted">
                        {s.displayName.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="truncate">{s.displayName}</span>
                    </span>
                    <span className="font-mono text-xs font-semibold tabular-nums text-brand">{s.wins}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
