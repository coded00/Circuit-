/**
 * Circuit — public tournament page (Build Plan P1-2, maps: TRN-2, TRN-3).
 * Registration/withdraw/cancel controls added in P2-1..P2-5.
 *
 * No login required to view — every field here must be visible to a
 * guest, per TRN-3's acceptance criteria. Viewer-specific actions
 * (register, withdraw, cancel) only render once we know who's looking.
 *
 * Layout: a poster banner with the tournament's identity and a strip of
 * the four numbers people decide by (prize, entry, players, start); then
 * tabs (Overview — schedule, about, game and host · Participants ·
 * Bracket · Rules · Prizes · Community) beside a sticky registration
 * panel focused on price, slots and the one action that applies.
 * Every value is a real Tournament field or a real query — nothing
 * invented (no Platform/Mode/Map block: Circuit has no such fields).
 */

import { cache, ViewTransition } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Check, ChevronRight, MessageCircle, ShieldCheck, Timer, Trophy, Tv, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { teamEntryLabels } from "@/lib/teamEntries";
import { describePoints, effectiveTable } from "@/lib/lobbyScoring";
import { tournamentPrizeShares } from "@/lib/prizePlaces";
import { placeLabel, plannedShares, type PrizeShare } from "@/lib/prizes";
import { getCurrentUser } from "@/lib/session";
import { StatusPill, tournamentStatusInfo } from "@/components/StatusPill";
import { GameArtTile } from "@/components/GameArtTile";
import { tournamentArtName } from "@/lib/viewTransitions";
import { ShareButton } from "@/components/ShareButton";
import { openDueTournaments } from "@/lib/tournaments";
import { CapacityBar } from "@/components/CapacityBar";
import { CountdownTimer } from "@/components/CountdownTimer";
import { isStartingSoon } from "@/lib/tournamentTiming";
import Poller from "@/app/Poller";
import { getStructure } from "@/lib/competitionStructures";
import { Panel, PanelBody, PanelEmpty, PanelRows, panelRowClass } from "@/components/ui/Panel";
import { StatStrip } from "@/components/ui/StatStrip";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { SectionTabs, type SectionTab } from "@/components/ui/SectionTabs";
import CancelButton from "./CancelButton";
import WithdrawButton from "./WithdrawButton";
import UpdateForm from "./UpdateForm";
import DeleteUpdateButton from "./DeleteUpdateButton";
import ClaimPrizeButton from "./ClaimPrizeButton";
import { buildMetadata, parseIdSegment, tournamentPath, gamePath, organiserPath, absoluteUrl, DEFAULT_DESCRIPTION } from "@/lib/seo";

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

function formatDate(date: Date): string {
  return date.toLocaleString("en-NG", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
}

function formatLabel(format: string): string {
  return format
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// react's cache() dedupes this within a single request — generateMetadata
// and the page component below both call it, but it only hits the DB once.
const getTournament = cache(async (id: string) =>
  prisma.tournament.findUnique({
    where: { id },
    include: {
      organizer: { include: { user: { select: { handle: true, displayName: true, avatarUrl: true } } } },
      community: { select: { id: true, enabled: true } },
    },
  })
);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: rawId } = await params;
  const tournament = await getTournament(parseIdSegment(rawId));
  if (!tournament) return buildMetadata({ title: "Tournament not found", description: DEFAULT_DESCRIPTION, path: `/tournaments/${rawId}`, noindex: true });

  const prizeText = tournament.prizeAmount
    ? `₦${(tournament.prizeAmount / 100).toLocaleString("en-NG")} prize pool`
    : tournament.entryFee === 0
      ? "free entry"
      : `₦${(tournament.entryFee / 100).toLocaleString("en-NG")} entry`;
  const path = tournamentPath(tournament);

  return buildMetadata({
    title: `${tournament.name} — ${tournament.game} Tournament`,
    description: `Join ${tournament.name}, a ${tournament.game} tournament on Circuit. ${prizeText}. Register now and compete.`,
    path,
    image: tournament.posterUrl ?? undefined,
    imageAlt: `${tournament.name} tournament artwork`,
  });
}

export default async function TournamentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id: rawId } = await params;
  const id = parseIdSegment(rawId);
  await openDueTournaments();

  const tournament = await getTournament(id);
  if (!tournament) {
    notFound();
  }

  const isTeam = tournament.entryType === "TEAM";
  const isLobby = tournament.competitionStyle === "LOBBY";
  const isLeague = tournament.format === "LEAGUE";
  const isRoundRobin = tournament.format === "ROUND_ROBIN" || tournament.format === "SWISS" || isLeague;
  const bracketWord = isLobby || isRoundRobin ? "Standings" : "Bracket";
  const entrantWord = isTeam ? "teams" : "players";
  const [registrantCount, user, participants, teamLabels] = await Promise.all([
    prisma.registration.count({ where: { tournamentId: tournament.id, status: "CONFIRMED" } }),
    getCurrentUser(),
    prisma.registration.findMany({
      where: { tournamentId: tournament.id, status: "CONFIRMED" },
      orderBy: { createdAt: "asc" },
      take: 50,
      include: { user: { select: { displayName: true, handle: true, avatarUrl: true } } },
    }),
    isTeam ? teamEntryLabels(tournament.id) : Promise.resolve(new Map() as Awaited<ReturnType<typeof teamEntryLabels>>),
  ]);

  const myRegistration = user
    ? await prisma.registration.findUnique({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: user.id } },
      })
    : null;

  const { tab: requestedTab } = await searchParams;
  const now = new Date();
  const isOrganizer = user !== null && tournament.organizerId === user.id;
  const updates = await prisma.tournamentUpdate.findMany({ where: { tournamentId: tournament.id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, body: true, createdAt: true } });
  // Same cancel guard as dashboard/tournaments/[id]/page.tsx and the
  // cancel route itself: no working-looking button that would just 409.
  const pastCancellationLock = !!(tournament.cancellationLockAt && now >= tournament.cancellationLockAt);
  const cancellable =
    tournament.status !== "CANCELLED" &&
    tournament.status !== "COMPLETE" &&
    !tournament.fundsFrozen &&
    (!pastCancellationLock || !!user?.isStaff);
  const registrationOpen =
    tournament.status !== "CANCELLED" &&
    now >= tournament.registrationOpenAt &&
    now < tournament.registrationCloseAt &&
    registrantCount < tournament.participantCap;
  const status = tournamentStatusInfo(tournament.status);
  const structure = getStructure(tournament.format);
  const formatText = structure?.label ?? formatLabel(tournament.format);
  const competitionRows = [
    { label: "Game mode", value: tournament.modeName ?? tournament.teamSize },
    ...(tournament.formatName ? [{ label: "Format", value: tournament.formatName }] : []),
    {
      label: "Entry",
      value: tournament.entryType === "TEAM" ? `Teams of ${tournament.playersPerTeam}` : "Individual — 1 player",
    },
    ...(tournament.competitionStyle === "HEAD_TO_HEAD" ? [{ label: "Matches", value: `${tournament.playersPerTeam}v${tournament.playersPerTeam}` }] : []),
    ...(isLobby
      ? [
          {
            label: "Rounds",
            value:
              tournament.lobbyGroups && tournament.lobbyQualifiers
                ? `${tournament.lobbyGroups} groups × ${tournament.lobbyRounds ?? 1} rounds, then the top ${tournament.lobbyQualifiers} of each play a ${tournament.lobbyFinalRounds ?? 1}-round final`
                : `${tournament.lobbyRounds ?? 1} in one lobby`,
          },
          { label: "Scoring", value: describePoints(effectiveTable(tournament)) },
        ]
      : []),
    { label: "How it's run", value: structure ? `${structure.label} — ${structure.description}` : formatText },
  ];
  const hasBracket = tournament.status === "LIVE" || tournament.status === "COMPLETE";
  // A real countdown only makes sense before the bracket actually starts.
  const startingSoon = !hasBracket && tournament.status !== "CANCELLED" && isStartingSoon(tournament.startAt, now);
  const communityVisible = Boolean(tournament.community?.enabled || isOrganizer);

  // Split prizes (src/lib/prizes.ts): every paid place claims its own share.
  let myShare: PrizeShare | null = null;
  let prizeResults: { share: PrizeShare; name: string; claimed: boolean }[] = [];
  if (tournament.status === "COMPLETE" && tournament.prizeAmount && tournament.prizeAmount > 0) {
    const [shares, payouts] = await Promise.all([
      tournamentPrizeShares(tournament),
      prisma.escrowTransaction.findMany({ where: { tournamentId: tournament.id, type: "PRIZE_PAYOUT", status: { in: ["PENDING", "COMPLETE"] } } }),
    ]);
    const people = await prisma.user.findMany({ where: { id: { in: shares.map((x) => x.userId) } }, select: { id: true, displayName: true } });
    const nameOf = new Map(people.map((x) => [x.id, teamLabels.get(x.id)?.teamName ?? x.displayName]));
    // Payouts from before split prizes carry no userId — they were the champion's.
    const claimed = (share: PrizeShare) => payouts.some((x) => x.userId === share.userId || (x.userId === null && share.place === 1));
    prizeResults = shares.map((share) => ({ share, name: nameOf.get(share.userId) ?? "Unknown", claimed: claimed(share) }));
    const mine = prizeResults.find((x) => x.share.userId === user?.id);
    myShare = mine && !mine.claimed ? mine.share : null;
  }
  const canClaimPrize = !!myShare;

  const aboutText = `${tournament.name} is a ${formatText.toLowerCase()} ${tournament.game} tournament for up to ${tournament.participantCap} ${entrantWord} (${tournament.teamSize}). ${
    tournament.prizeAmount
      ? `Compete for a ${formatNaira(tournament.prizeAmount)} prize pool.`
      : tournament.entryFee === 0
        ? "Free to enter."
        : `${formatNaira(tournament.entryFee)} entry fee.`
  }`;

  // Real data only — every field below is a genuine Tournament (or
  // OrganizerProfile/User) column.
  const canonicalUrl = absoluteUrl(tournamentPath(tournament));
  const eventJsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: tournament.name,
    description: aboutText,
    startDate: tournament.startAt.toISOString(),
    eventStatus: `https://schema.org/${tournament.status === "CANCELLED" ? "EventCancelled" : "EventScheduled"}`,
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    location: { "@type": "VirtualLocation", url: canonicalUrl },
    url: canonicalUrl,
    // Uploaded posters are site-relative (/api/images/...); structured data needs an absolute URL.
    image: tournament.posterUrl ? (tournament.posterUrl.startsWith("/") ? absoluteUrl(tournament.posterUrl) : tournament.posterUrl) : undefined,
    organizer: {
      "@type": "Person",
      name: tournament.organizer.user.displayName,
      url: absoluteUrl(organiserPath(tournament.organizer.user.handle)),
    },
    offers: {
      "@type": "Offer",
      price: (tournament.entryFee / 100).toString(),
      priceCurrency: "NGN",
      url: canonicalUrl,
      availability: registrationOpen ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
    },
  };

  // --- Schedule: registration opens → closes → tournament starts ---------
  const schedule = [
    { label: now < tournament.registrationOpenAt ? "Registration opens" : "Registration opened", at: tournament.registrationOpenAt },
    { label: now < tournament.registrationCloseAt ? "Registration closes" : "Registration closed", at: tournament.registrationCloseAt },
    {
      label: tournament.status === "COMPLETE" ? "Tournament finished" : hasBracket ? "Tournament live" : "Tournament starts",
      at: tournament.startAt,
    },
  ];
  const nextStep = tournament.status === "CANCELLED" ? -1 : schedule.findIndex((s) => now < s.at);

  const prizeOrEntry = tournament.prizeAmount
    ? { label: "Prize pool", value: formatNaira(tournament.prizeAmount), gold: true }
    : { label: "Prize pool", value: "—", gold: false };

  const tabs: SectionTab[] = [
    {
      key: "overview",
      label: "Overview",
      content: (
        <div className="flex flex-col gap-6">
          <Panel title="Schedule">
            <ol className="flex flex-col border-t border-border px-5 py-4">
              {schedule.map((step, i) => {
                const done = tournament.status !== "CANCELLED" && (nextStep === -1 ? true : i < nextStep);
                const current = i === nextStep;
                return (
                  <li key={step.label} className="relative flex gap-3 pb-5 last:pb-0">
                    {i < schedule.length - 1 && <span aria-hidden className="absolute top-5 bottom-0 left-[9px] w-px bg-border" />}
                    <span
                      className={`relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                        done ? "bg-accent-volt text-accent-volt-foreground" : current ? "border-2 border-accent-volt bg-surface" : "border border-border-strong bg-surface"
                      }`}
                    >
                      {done && <Check size={11} strokeWidth={3} />}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
                      <span className={`text-sm ${current ? "font-semibold" : done ? "" : "text-muted"}`}>{step.label}</span>
                      <span className="text-stat text-xs text-muted">{formatDate(step.at)}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Panel>

          <Panel title="About">
            <PanelBody className="flex flex-col gap-3">
              <p className="text-sm text-foreground/85">{aboutText}</p>
              {tournament.prizeText && <p className="text-sm text-muted">{tournament.prizeText}</p>}
            </PanelBody>
          </Panel>

          <Panel title="Format">
            <PanelBody>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {competitionRows.map((row) => (
                  <div key={row.label} className="flex flex-col gap-0.5">
                    <dt className="font-mono text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">{row.label}</dt>
                    <dd className="text-sm">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </PanelBody>
          </Panel>

          <Panel title="Game & host">
            <PanelRows>
              <Link href={gamePath(tournament.game)} className={panelRowClass}>
                <GameArtTile game={tournament.game} className="h-11 w-11 shrink-0 rounded-[10px]" hideLabel imgWidth={120} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{tournament.game}</span>
                  <span className="text-metadata">More {tournament.game} tournaments</span>
                </div>
                <ChevronRight size={15} className="shrink-0 text-muted" />
              </Link>
              <Link href={organiserPath(tournament.organizer.user.handle)} className={panelRowClass}>
                <PlayerAvatar person={tournament.organizer.user} size="md" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {tournament.organizer.user.displayName}
                    {tournament.organizer.verified && <ShieldCheck size={14} className="shrink-0 text-accent-blue" aria-label="Verified organiser" />}
                  </span>
                  <span className="text-metadata truncate">Organiser · @{tournament.organizer.user.handle}</span>
                </div>
                <ChevronRight size={15} className="shrink-0 text-muted" />
              </Link>
            </PanelRows>
          </Panel>
        </div>
      ),
    },
    {
      key: "participants",
      label: "Participants",
      count: registrantCount,
      content: (
        <Panel title="Participants" meta={`${registrantCount}/${tournament.participantCap}`}>
          {participants.length === 0 ? (
            <PanelEmpty>{isTeam ? "No teams have entered yet. Be the first." : "No one has registered yet. Be the first."}</PanelEmpty>
          ) : (
            <div className="grid grid-cols-1 border-t border-border sm:grid-cols-2">
              {participants.map((p, i) => {
                const team = teamLabels.get(p.userId);
                if (team) {
                  return (
                    <div key={p.userId} className="flex flex-col gap-2 border-b border-border px-5 py-3 sm:odd:border-r">
                      <div className="flex items-center gap-3">
                        <span className="w-6 shrink-0 text-right font-mono text-xs text-muted tabular-nums">{i + 1}</span>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-semibold">
                            {team.teamName}
                            {team.tag && <span className="ml-1 font-mono text-xs text-muted">[{team.tag}]</span>}
                          </span>
                          <span className="text-metadata truncate">
                            Captain{" "}
                            <Link href={`/players/${p.user.handle}`} className="hover:text-foreground">
                              @{p.user.handle}
                            </Link>
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pl-9">
                        {team.roster.map((m) => (
                          <Link
                            key={m.handle}
                            href={`/players/${m.handle}`}
                            className="rounded-full border border-border px-2 py-0.5 text-xs text-muted transition-colors hover:border-border-hover hover:text-foreground"
                          >
                            {m.displayName}
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                }
                return (
                <Link
                  key={p.userId}
                  href={`/players/${p.user.handle}`}
                  className="flex items-center gap-3 border-b border-border px-5 py-3 transition-colors hover:bg-surface-elevated/60 sm:odd:border-r"
                >
                  <span className="w-6 shrink-0 text-right font-mono text-xs text-muted tabular-nums">{i + 1}</span>
                  <PlayerAvatar person={p.user} size="sm" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{p.user.displayName}</span>
                    <span className="text-metadata truncate">@{p.user.handle}</span>
                  </div>
                </Link>
                );
              })}
            </div>
          )}
        </Panel>
      ),
    },
    {
      key: "bracket",
      label: bracketWord,
      content: (
        <Panel title={bracketWord}>
          <PanelBody className="flex flex-col items-start gap-3">
            {hasBracket ? (
              <>
                <p className="text-sm text-muted">
                  {isLobby
                    ? tournament.status === "COMPLETE"
                      ? "Results are final. See the leaderboard and every round."
                      : "The lobby is live. The leaderboard updates as each round's results are posted."
                    : isRoundRobin
                      ? tournament.format === "SWISS"
                        ? "Swiss rounds are live — each round is drawn when the last one finishes."
                        : isLeague
                          ? "The league is live — follow the table and play each matchday's fixture before its deadline."
                          : "Everyone plays everyone — follow the standings as matches finish."
                      : "The bracket is live. Follow every round as results come in."}
                </p>
                <Link href={`/tournaments/${tournament.id}/bracket`} className="btn-primary">
                  {isLobby || isRoundRobin ? "Open standings" : "Open bracket"}
                </Link>
              </>
            ) : isRoundRobin ? (
              <p className="text-sm text-muted">
                {isLeague
                  ? `When registration closes on ${formatDate(tournament.registrationCloseAt)}, every fixture is drawn — everyone plays everyone${tournament.leagueLegs === 2 ? " twice, home and away" : " once"}, a matchday every ${tournament.leagueMatchdayDays ?? 7} days. ${tournament.leagueWinPoints ?? 3} points for a win${tournament.leagueDrawPoints != null ? `, ${tournament.leagueDrawPoints} for a draw` : " (no draws)"}; the top of the table takes it.`
                  : tournament.format === "SWISS"
                  ? `When registration closes on ${formatDate(tournament.registrationCloseAt)}, round 1 is drawn. Each round pairs players on the same record — never the same opponent twice — and the most wins after the last round takes it.`
                  : `When registration closes on ${formatDate(tournament.registrationCloseAt)}, every pairing is drawn at once — everyone plays everyone, in any order. Most wins takes it.`}
              </p>
            ) : isLobby ? (
              <p className="text-sm text-muted">
                {tournament.lobbyGroups && tournament.lobbyQualifiers
                  ? `When registration closes on ${formatDate(tournament.registrationCloseAt)}, entries are split into ${tournament.lobbyGroups} group lobbies. The top ${tournament.lobbyQualifiers} of each group play the final, where points start fresh.`
                  : `Everyone plays ${tournament.lobbyRounds ?? 1} round${tournament.lobbyRounds === 1 ? "" : "s"} in one lobby once registration closes on ${formatDate(tournament.registrationCloseAt)}. Points add up across rounds into one leaderboard.`}
              </p>
            ) : (
              <p className="text-sm text-muted">
                The bracket is generated when registration closes on {formatDate(tournament.registrationCloseAt)} and players are seeded.
              </p>
            )}
          </PanelBody>
        </Panel>
      ),
    },
    {
      key: "rules",
      label: "Rules",
      content: (
        <Panel title="Rules">
          <PanelBody>
            {tournament.rulesText ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/85">{tournament.rulesText}</p>
            ) : (
              <p className="text-sm text-muted">The organiser hasn&apos;t published rules for this tournament yet.</p>
            )}
          </PanelBody>
        </Panel>
      ),
    },
    {
      key: "prizes",
      label: "Prizes",
      content: (
        <Panel title="Prizes">
          <PanelBody className="flex flex-col gap-2">
            {tournament.prizeAmount ? (
              <>
                <span className="text-eyebrow text-muted">Prize pool</span>
                <span className="text-stat text-4xl leading-none text-gold">{formatNaira(tournament.prizeAmount)}</span>
                {tournament.prizeText && <p className="mt-1 text-sm text-muted">{tournament.prizeText}</p>}
                {tournament.prizeSplit.length > 0 && (
                  <ul className="mt-2 flex flex-col divide-y divide-border rounded-[10px] border border-border">
                    {(prizeResults.length
                      ? prizeResults.map((x) => ({
                          key: x.share.userId,
                          place: `${placeLabel(x.share.place)}${x.share.sharedWith > 1 ? " (shared)" : ""}`,
                          who: x.name,
                          amount: x.share.amount,
                          claimed: x.claimed,
                        }))
                      : plannedShares(tournament.prizeAmount, tournament.prizeSplit).map((x) => ({
                          key: String(x.place),
                          place: `${placeLabel(x.place)} · ${x.percent}%`,
                          who: null as string | null,
                          amount: x.amount,
                          claimed: false,
                        }))
                    ).map((row) => (
                      <li key={row.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="flex min-w-0 flex-col">
                          <span className="font-semibold">{row.place}</span>
                          {row.who && <span className="truncate text-xs text-muted">{row.who}</span>}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {row.who && <span className={`text-xs ${row.claimed ? "text-success" : "text-muted"}`}>{row.claimed ? "Claimed" : "Unclaimed"}</span>}
                          <span className="font-mono text-sm font-bold text-gold">{formatNaira(row.amount)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-xs text-muted">
                  {tournament.prizeSplit.length > 0
                    ? `Each place claims its own share once ${isLobby ? "the results are finalised" : isRoundRobin ? "every match is played" : "the final is confirmed"}.${
                        tournament.format === "KNOCKOUT" && tournament.prizeSplit.length >= 3 ? " The two semi-final losers share 3rd." : ""
                      } Ties split the places they cover.`
                    : `Paid to the champion's payout account once ${isLobby ? "the results are finalised" : isRoundRobin ? "every match is played" : "the final is confirmed"}.`}
                </p>
              </>
            ) : tournament.prizeText ? (
              <p className="text-sm text-foreground/85">{tournament.prizeText}</p>
            ) : (
              <p className="text-sm text-muted">No cash prize for this one — bragging rights only.</p>
            )}
          </PanelBody>
        </Panel>
      ),
    },
    {
      key: "updates",
      label: "Updates",
      count: updates.length,
      content: (
        <Panel title="Updates" meta={updates.length || undefined}>
          {isOrganizer && <UpdateForm tournamentId={tournament.id} entrants={registrantCount} />}
          {updates.length === 0 ? (
            <PanelEmpty>
              {isOrganizer ? "Nothing posted yet. Updates you post are sent to everyone who's entered." : "The organiser hasn't posted any updates yet."}
            </PanelEmpty>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {updates.map((u) => (
                <li key={u.id} className="flex items-start gap-3 px-5 py-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{u.body}</p>
                    <time dateTime={u.createdAt.toISOString()} className="text-metadata" suppressHydrationWarning>
                      {formatDate(u.createdAt)} · {formatTime(u.createdAt)}
                    </time>
                  </div>
                  {(isOrganizer || user?.isStaff) && <DeleteUpdateButton tournamentId={tournament.id} updateId={u.id} />}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ),
    },
    // Hidden for a non-organizer if the community was never enabled —
    // nothing to see there. The organizer still sees it, to reach Edit.
    ...(communityVisible
      ? [
          {
            key: "community",
            label: "Community",
            content: (
              <Panel title="Community">
                <PanelBody className="flex flex-col items-start gap-3">
                  {tournament.community?.enabled ? (
                    <>
                      <p className="text-sm text-muted">
                        Chat with other players — general, announcements, matches and results.
                      </p>
                      <Link href={`/tournaments/${tournament.id}/community`} className="btn-primary">
                        <MessageCircle size={14} />
                        Open community
                      </Link>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted">This tournament doesn&apos;t have a community yet.</p>
                      <Link href={`/tournaments/${tournament.id}/edit`} className="btn-secondary">
                        Enable from Edit
                      </Link>
                    </>
                  )}
                </PanelBody>
              </Panel>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }} />
      {/* Poller-driven refresh keeps capacity, FULL state and status live
          while someone else registers with this page open. */}
      <Poller />

      <header data-surface="dark" className="overflow-hidden rounded-[var(--radius-hero)] border border-border bg-surface">
        <div className="relative aspect-[5/2] w-full sm:aspect-[4/1]">
          {/* Same name as the card/row art it was opened from — morphs between them. */}
          <ViewTransition name={tournamentArtName(tournament.id)} share="tournament-morph" default="none">
            <GameArtTile game={tournament.game} posterUrl={tournament.posterUrl} fill hideLabel imgWidth={1400} />
          </ViewTransition>
          <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2">
            <StatusPill tone={status.tone} pulse={status.pulse} solid size="md">
              {status.label}
            </StatusPill>
            {startingSoon && (
              <span className="badge bg-black/70 text-white backdrop-blur-sm">
                <Timer size={11} />
                Starts in <CountdownTimer target={tournament.startAt.toISOString()} />
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
          <div className="flex min-w-0 flex-col gap-2">
            <span className="text-xs text-muted">
              <Link href={gamePath(tournament.game)} className="font-medium text-foreground/80 transition hover:text-accent-volt">
                {tournament.game}
              </Link>{" "}
              · {formatText} · {tournament.teamSize}
            </span>
            <h1 className="font-display text-3xl leading-none font-bold tracking-tight uppercase sm:text-[40px]">{tournament.name}</h1>
            <span className="flex items-center gap-1.5 text-sm text-muted">
              Hosted by
              <Link href={organiserPath(tournament.organizer.user.handle)} className="font-medium text-foreground/85 transition hover:text-accent-volt">
                {tournament.organizer.user.displayName}
              </Link>
              {tournament.organizer.verified && <ShieldCheck size={14} className="text-accent-blue" aria-label="Verified organiser" />}
            </span>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {hasBracket && (
              <Link href={`/tournaments/${tournament.id}/bracket`} className="btn-secondary">
                <Trophy size={14} />
                {bracketWord}
              </Link>
            )}
            {tournament.streamUrl && (
              <a href={tournament.streamUrl} target="_blank" rel="noreferrer" className="btn-secondary">
                <Tv size={14} />
                Watch
              </a>
            )}
            <ShareButton variant="compact" title={`${tournament.name} on Circuit`} url={canonicalUrl} />
          </div>
        </div>

        <StatStrip
          stats={[
            { label: prizeOrEntry.label, value: prizeOrEntry.value, valueClassName: prizeOrEntry.gold ? "text-gold" : "text-muted" },
            {
              label: "Entry",
              value: tournament.entryFee === 0 ? "Free" : formatNaira(tournament.entryFee),
              valueClassName: tournament.entryFee === 0 ? "text-success" : "",
            },
            {
              label: isTeam ? "Teams" : "Players",
              value: (
                <>
                  {registrantCount}
                  <span className="text-muted">/{tournament.participantCap}</span>
                </>
              ),
              sub: registrantCount >= tournament.participantCap ? "Full" : `${tournament.participantCap - registrantCount} spots left`,
            },
            { label: hasBracket ? "Started" : "Starts", value: formatShortDate(tournament.startAt), sub: formatTime(tournament.startAt) },
          ]}
        />
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px] min-[1140px]:lg:grid-cols-[minmax(0,1fr)_340px]">
        <SectionTabs tabs={tabs} initialTab={requestedTab} label="Tournament sections" idPrefix="tournament" />

        <aside className="order-first flex h-fit flex-col gap-4 lg:sticky lg:top-[76px] lg:order-none">
          <Panel title="Registration">
            <PanelBody className="flex flex-col gap-4">
              <div className="flex items-end justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-eyebrow text-muted">Entry</span>
                  <span className={`text-stat text-3xl leading-none ${tournament.entryFee === 0 ? "text-success" : ""}`}>
                    {tournament.entryFee === 0 ? "Free" : formatNaira(tournament.entryFee)}
                  </span>
                </div>
                <span className="flex items-center gap-1.5 text-sm text-muted">
                  <Users size={14} />
                  <span className="text-stat text-foreground">{registrantCount}</span>/{tournament.participantCap}
                </span>
              </div>
              <CapacityBar registered={registrantCount} cap={tournament.participantCap} className="h-1.5" />

              {tournament.status === "CANCELLED" ? (
                <p className="alert alert-danger">This tournament has been cancelled. Paid entries have been refunded.</p>
              ) : isOrganizer ? (
                <div className="flex flex-col gap-2">
                  <Link href={`/dashboard/tournaments/${tournament.id}`} className="btn-primary w-full">
                    Manage tournament
                  </Link>
                  {now < tournament.registrationCloseAt && (
                    <Link href={`/tournaments/${tournament.id}/edit`} className="btn-secondary w-full">
                      Edit
                    </Link>
                  )}
                  {cancellable && <CancelButton tournamentId={tournament.id} />}
                </div>
              ) : myRegistration?.status === "CONFIRMED" ? (
                <div className="flex flex-col gap-3 rounded-[var(--radius-md)] bg-success/10 p-3">
                  <p className="flex items-center gap-2 text-sm font-medium text-success">
                    <Check size={15} strokeWidth={3} />
                    You&apos;re in
                  </p>
                  {tournament.status !== "COMPLETE" && (
                    <ul className="ml-4 list-disc space-y-1 text-xs leading-relaxed text-muted">
                      <li>
                        {hasBracket
                          ? "It's underway. Open the Bracket tab to find your match."
                          : `It starts ${formatDate(tournament.startAt)}. We'll notify you the moment your match is ready.`}
                      </li>
                      <li>Each match has a code. Show it in your proof screenshot when you report the result.</li>
                    </ul>
                  )}
                  {now < tournament.registrationCloseAt && tournament.status !== "LIVE" && tournament.status !== "COMPLETE" && (
                    <WithdrawButton registrationId={myRegistration.id} />
                  )}
                </div>
              ) : myRegistration?.status === "PENDING_PAYMENT" ? (
                <p className="alert alert-warning">
                  Your payment is processing.{" "}
                  <Link href={`/tournaments/${tournament.id}/register/callback?ref=${myRegistration.paymentRef}`} className="font-medium underline">
                    Check status
                  </Link>
                </p>
              ) : registrationOpen ? (
                <div className="flex flex-col gap-2">
                  <Link href={`/tournaments/${tournament.id}/register`} className="btn-primary w-full">
                    Register
                  </Link>
                  <p className="text-center text-xs text-muted">
                    Closes in{" "}
                    <span className="text-stat">
                      <CountdownTimer target={tournament.registrationCloseAt.toISOString()} zeroLabel="a moment" />
                    </span>
                    {tournament.entryFee > 0 ? " · Card or wallet" : ""}
                  </p>
                </div>
              ) : now >= tournament.registrationOpenAt && now < tournament.registrationCloseAt && registrantCount >= tournament.participantCap ? (
                <p className="rounded-[var(--radius-md)] bg-accent-orange-soft p-3 text-sm font-medium text-accent-orange">
                  Registration is full.
                </p>
              ) : (
                <p className="rounded-[var(--radius-md)] bg-surface-elevated p-3 text-sm text-muted">
                  {now < tournament.registrationOpenAt ? `Registration opens ${formatDate(tournament.registrationOpenAt)}.` : "Registration is closed."}
                </p>
              )}
            </PanelBody>
          </Panel>

          {canClaimPrize && myShare && (
            <ClaimPrizeButton
              tournamentId={tournament.id}
              label={prizeResults.length > 1 ? `Claim ${formatNaira(myShare.amount)} — ${placeLabel(myShare.place)} place` : undefined}
            />
          )}

          <p className="flex items-start gap-2 px-1 text-xs text-muted">
            <ShieldCheck size={13} className="mt-px shrink-0" />
            {isLobby
              ? "The organiser posts placements and kills after each round. Flags go to the organiser, then Circuit staff."
              : "Both players report every result. Disputes go to the organiser, then Circuit staff."}
          </p>
        </aside>
      </div>
    </div>
  );
}
