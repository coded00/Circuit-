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

import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Check, ChevronRight, MessageCircle, ShieldCheck, Timer, Trophy, Tv, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { StatusPill, tournamentStatusInfo } from "@/components/StatusPill";
import { GameArtTile } from "@/components/GameArtTile";
import { ShareButton } from "@/components/ShareButton";
import { openDueTournaments } from "@/lib/tournaments";
import { CapacityBar } from "@/components/CapacityBar";
import { CountdownTimer } from "@/components/CountdownTimer";
import { isStartingSoon } from "@/lib/tournamentTiming";
import Poller from "@/app/Poller";
import { Panel, PanelBody, PanelEmpty, PanelRows, panelRowClass } from "@/components/ui/Panel";
import { StatStrip } from "@/components/ui/StatStrip";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { SectionTabs, type SectionTab } from "@/components/ui/SectionTabs";
import CancelButton from "./CancelButton";
import WithdrawButton from "./WithdrawButton";
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

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseIdSegment(rawId);
  await openDueTournaments();

  const tournament = await getTournament(id);
  if (!tournament) {
    notFound();
  }

  const [registrantCount, user, participants] = await Promise.all([
    prisma.registration.count({ where: { tournamentId: tournament.id, status: "CONFIRMED" } }),
    getCurrentUser(),
    prisma.registration.findMany({
      where: { tournamentId: tournament.id, status: "CONFIRMED" },
      orderBy: { createdAt: "asc" },
      take: 50,
      include: { user: { select: { displayName: true, handle: true, avatarUrl: true } } },
    }),
  ]);

  const myRegistration = user
    ? await prisma.registration.findUnique({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: user.id } },
      })
    : null;

  const now = new Date();
  const isOrganizer = user !== null && tournament.organizerId === user.id;
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
  const formatText = formatLabel(tournament.format);
  const hasBracket = tournament.status === "LIVE" || tournament.status === "COMPLETE";
  // A real countdown only makes sense before the bracket actually starts.
  const startingSoon = !hasBracket && tournament.status !== "CANCELLED" && isStartingSoon(tournament.startAt, now);
  const communityVisible = Boolean(tournament.community?.enabled || isOrganizer);

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

  const aboutText = `${tournament.name} is a ${formatText.toLowerCase()} ${tournament.game} tournament for up to ${tournament.participantCap} players (${tournament.teamSize}). ${
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
            <PanelEmpty>No one has registered yet. Be the first.</PanelEmpty>
          ) : (
            <div className="grid grid-cols-1 border-t border-border sm:grid-cols-2">
              {participants.map((p, i) => (
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
              ))}
            </div>
          )}
        </Panel>
      ),
    },
    {
      key: "bracket",
      label: "Bracket",
      content: (
        <Panel title="Bracket">
          <PanelBody className="flex flex-col items-start gap-3">
            {hasBracket ? (
              <>
                <p className="text-sm text-muted">The bracket is live. Follow every round as results come in.</p>
                <Link href={`/tournaments/${tournament.id}/bracket`} className="btn-primary">
                  Open bracket
                </Link>
              </>
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
                <p className="mt-1 text-xs text-muted">Paid to the champion&apos;s payout account once the final is confirmed.</p>
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }} />
      {/* Poller-driven refresh keeps capacity, FULL state and status live
          while someone else registers with this page open. */}
      <Poller />

      <header data-surface="dark" className="overflow-hidden rounded-[var(--radius-hero)] border border-border bg-surface">
        <div className="relative aspect-[5/2] w-full sm:aspect-[4/1]">
          <GameArtTile game={tournament.game} posterUrl={tournament.posterUrl} fill hideLabel imgWidth={1400} />
          <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2">
            {/* Dark backing so the soft-tinted pill stays legible on any poster. */}
            <span className="rounded-full bg-black/70 backdrop-blur-sm">
              <StatusPill tone={status.tone} pulse={status.pulse}>
                {status.label}
              </StatusPill>
            </span>
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
                Bracket
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
              label: "Players",
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <SectionTabs tabs={tabs} label="Tournament sections" idPrefix="tournament" />

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
                    {tournament.entryFee > 0 ? " · Paystack or Flutterwave" : ""}
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

          {canClaimPrize && <ClaimPrizeButton tournamentId={tournament.id} />}

          <p className="flex items-start gap-2 px-1 text-xs text-muted">
            <ShieldCheck size={13} className="mt-px shrink-0" />
            Both players report every result. Disputes go to the organiser, then Circuit staff.
          </p>
        </aside>
      </div>
    </div>
  );
}
