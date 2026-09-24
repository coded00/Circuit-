/**
 * Circuit — public tournament page (Build Plan P1-2, maps: TRN-2, TRN-3).
 * Registration/withdraw/cancel controls added in P2-1..P2-5.
 *
 * No login required to view — every field here must be visible to a
 * guest, per TRN-3's acceptance criteria. Viewer-specific actions
 * (register, withdraw, cancel) only render once we know who's looking.
 *
 * Redesigned around a photo hero + tab shell (Overview/Brackets/Rules/
 * Prizes/Participants) with a sticky registration card, per a supplied
 * reference layout — but every value on the page is still a real
 * Tournament field or a real query, including `teamSize` (players per
 * side, organizer-set — e.g. Call of Duty Mobile runs 5v5 in ranked
 * multiplayer but solo/duo in Tournament Mode). One thing the reference
 * implied that Circuit has no data for is deliberately not invented: a
 * "Platform/Mode/Map" game-details block (no such fields on Tournament —
 * organizer-typed game name only, nothing more granular).
 */

import { Suspense, cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Tv, Calendar, Users, Layers, Swords, Trophy, Wallet, ShieldCheck, Timer, MessageCircle } from "lucide-react";
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
import TournamentTabs, { type TournamentTab } from "./TournamentTabs";
import CancelButton from "./CancelButton";
import WithdrawButton from "./WithdrawButton";
import ClaimPrizeButton from "./ClaimPrizeButton";
import { buildMetadata, parseIdSegment, tournamentPath, gamePath, organiserPath, absoluteUrl, DEFAULT_DESCRIPTION } from "@/lib/seo";

function formatNaira(kobo: number): string {
  return `₦ ${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

function formatDate(date: Date): string {
  return date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { dateStyle: "medium" });
}

function formatLabel(format: string): string {
  return format
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function FactCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="widget flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-blue-soft text-accent-blue">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-eyebrow">{label}</span>
        <span className="truncate text-sm font-semibold">{value}</span>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-muted">
        {icon}
        {label}
      </span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

// react's cache() dedupes this within a single request — generateMetadata
// and the page component below both call it, but it only hits the DB once.
const getTournament = cache(async (id: string) =>
  prisma.tournament.findUnique({
    where: { id },
    include: {
      organizer: { include: { user: { select: { handle: true, displayName: true } } } },
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

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
      include: { user: { select: { displayName: true, handle: true } } },
    }),
  ]);

  const myRegistration = user
    ? await prisma.registration.findUnique({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: user.id } },
      })
    : null;

  const now = new Date();
  const isOrganizer = user !== null && tournament.organizerId === user.id;
  // V1 audit follow-up: this page's own cancel button used to have no
  // gating at all beyond "not already cancelled" — an organizer past the
  // cancellation lock, or with funds frozen, would still see a working-
  // looking button that would just 409 on click. Same guard as
  // dashboard/tournaments/[id]/page.tsx and the cancel route itself.
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
  // A real countdown only makes sense before the bracket actually starts —
  // once it's LIVE/COMPLETE/CANCELLED, "starting in" is no longer true.
  const startingSoon =
    !hasBracket && tournament.status !== "CANCELLED" && isStartingSoon(tournament.startAt, now);

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

  const aboutText = `Join ${tournament.name}, a ${formatText.toLowerCase()} tournament for ${tournament.game}. ${
    tournament.prizeAmount
      ? `Compete for a ${formatNaira(tournament.prizeAmount)} prize pool.`
      : tournament.entryFee === 0
        ? "Free to enter, no cost to compete."
        : `${formatNaira(tournament.entryFee)} entry fee.`
  }`;

  // Real data only, per the "no fake ratings/reviews/prices/dates" rule —
  // every field below is a genuine Tournament (or OrganizerProfile/User)
  // column.
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

  const tabs: TournamentTab[] = [
    {
      key: "overview",
      label: "Overview",
      content: (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-section-heading">About This Tournament</h2>
            <p className="text-sm text-muted">{aboutText}</p>
            <p className="text-metadata">
              Registration {now < tournament.registrationOpenAt ? "opens" : "opened"}{" "}
              {formatDate(tournament.registrationOpenAt)} · closes {formatDate(tournament.registrationCloseAt)}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FactCard icon={<Layers size={16} />} label="Format" value={formatText} />
            <FactCard icon={<Swords size={16} />} label="Team Size" value={tournament.teamSize} />
            <FactCard
              icon={<Users size={16} />}
              label="Registration"
              value={`${registrantCount} / ${tournament.participantCap} players`}
            />
            <FactCard
              icon={<Trophy size={16} />}
              label={tournament.prizeAmount ? "Prize Pool" : "Entry"}
              value={
                tournament.prizeAmount
                  ? formatNaira(tournament.prizeAmount)
                  : tournament.entryFee === 0
                    ? "Free"
                    : formatNaira(tournament.entryFee)
              }
            />
          </div>
          <div className="flex flex-col gap-3 border-t border-border pt-6">
            <h2 className="text-section-heading">Game</h2>
            <Link href={gamePath(tournament.game)} className="card card-hover flex items-center gap-4">
              <GameArtTile game={tournament.game} className="h-20 w-20 shrink-0 rounded-[var(--radius-md)]" hideLabel />
              <div className="flex min-w-0 flex-col">
                <span className="text-card-title truncate">{tournament.game}</span>
                <p className="text-metadata">
                  {formatText} · {tournament.teamSize} tournament
                </p>
                <p className="mt-1 text-xs font-medium text-accent-blue">See all {tournament.game} tournaments →</p>
              </div>
            </Link>
          </div>
          <div className="flex flex-col gap-3 border-t border-border pt-6">
            <h2 className="text-section-heading">Organizer</h2>
            <Link href={organiserPath(tournament.organizer.user.handle)} className="card-row flex items-center gap-3 p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-elevated text-xs font-semibold text-muted">
                {tournament.organizer.user.displayName.slice(0, 1).toUpperCase()}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{tournament.organizer.user.displayName}</span>
                <span className="text-metadata truncate">@{tournament.organizer.user.handle}</span>
              </div>
              {tournament.organizer.verified && <ShieldCheck size={14} className="shrink-0 text-accent-blue" />}
            </Link>
          </div>
        </div>
      ),
    },
    {
      key: "brackets",
      label: "Brackets",
      content: (
        <div className="card flex flex-col items-center gap-3 py-12 text-center">
          {hasBracket ? (
            <>
              <Trophy size={28} className="text-gold" />
              <p className="max-w-sm text-sm text-muted">
                The bracket is live. Follow every round as results come in.
              </p>
              <Link href={`/tournaments/${tournament.id}/bracket`} className="btn-primary">
                View Full Bracket →
              </Link>
            </>
          ) : (
            <>
              <Layers size={28} className="text-muted" />
              <p className="max-w-sm text-sm text-muted">
                The bracket will be generated once registration closes and players are seeded.
              </p>
            </>
          )}
        </div>
      ),
    },
    {
      key: "rules",
      label: "Rules",
      content: (
        <div className="card">
          {tournament.rulesText ? (
            <p className="text-sm whitespace-pre-wrap text-muted">{tournament.rulesText}</p>
          ) : (
            <p className="text-sm text-muted">The organizer hasn&apos;t published rules for this tournament yet.</p>
          )}
        </div>
      ),
    },
    {
      key: "prizes",
      label: "Prizes",
      content: (
        <div className="card flex flex-col gap-3">
          {tournament.prizeAmount ? (
            <>
              <span className="text-eyebrow">Prize Pool</span>
              <span className="font-display text-3xl font-bold text-gold">{formatNaira(tournament.prizeAmount)}</span>
              {tournament.prizeText && <p className="text-sm text-muted">{tournament.prizeText}</p>}
            </>
          ) : tournament.prizeText ? (
            <p className="text-sm text-muted">{tournament.prizeText}</p>
          ) : (
            <p className="text-sm text-muted">No cash prize for this tournament: bragging rights only.</p>
          )}
        </div>
      ),
    },
    {
      key: "participants",
      label: "Participants",
      content:
        participants.length === 0 ? (
          <p className="card text-center text-sm text-muted">No one has registered yet. Be the first.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {participants.map((p) => (
              <Link
                key={p.userId}
                href={`/players/${p.user.handle}`}
                className="card-row flex items-center gap-3 p-3"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-elevated text-xs font-semibold text-muted">
                  {p.user.displayName.slice(0, 1).toUpperCase()}
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{p.user.displayName}</span>
                  <span className="text-metadata truncate">@{p.user.handle}</span>
                </div>
              </Link>
            ))}
          </div>
        ),
    },
    // Hidden entirely for a non-organizer if the community was never
    // enabled — nothing to see, and no "enable" control they can use
    // anyway. The organizer still sees it (even disabled) so Edit is
    // reachable from a natural place instead of only from the sidebar.
    ...(tournament.community?.enabled || isOrganizer
      ? [
          {
            key: "community",
            label: "Community",
            content: (
              <div className="card flex flex-col items-center gap-3 py-12 text-center">
                {tournament.community?.enabled ? (
                  <>
                    <MessageCircle size={28} className="text-accent-blue" />
                    <p className="max-w-sm text-sm text-muted">
                      Chat with other players about this tournament — general, announcements, matches, and results.
                    </p>
                    <Link href={`/tournaments/${tournament.id}/community`} className="btn-primary">
                      Open Community →
                    </Link>
                  </>
                ) : (
                  <>
                    <MessageCircle size={28} className="text-muted" />
                    <p className="max-w-sm text-sm text-muted">
                      This tournament doesn&apos;t have a community yet.
                    </p>
                    <Link href={`/tournaments/${tournament.id}/edit`} className="btn-secondary">
                      Enable from Edit
                    </Link>
                  </>
                )}
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }} />
      {/* Real "live" page — a Poller-driven refresh is what makes the
          capacity flash, FULL state, and status pill above genuinely
          respond to someone else registering while this page is open,
          not just on the next full page load. */}
      <Poller />
      <div
        data-surface="dark"
        className="relative flex min-h-[260px] w-full flex-col justify-end overflow-hidden rounded-[var(--radius-hero)] border border-border p-6 sm:min-h-[300px] sm:p-8"
      >
        <GameArtTile game={tournament.game} posterUrl={tournament.posterUrl} fill hideLabel imgWidth={1200} />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ backgroundImage: "linear-gradient(0deg, var(--background) 12%, transparent 65%)" }}
        />
        <div className="relative z-10 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill tone={status.tone} pulse={status.pulse}>
              {status.label}
            </StatusPill>
            {startingSoon && (
              <span className="badge badge-attention">
                <Timer size={11} />
                Starting in <CountdownTimer target={tournament.startAt.toISOString()} />
              </span>
            )}
            {hasBracket && (
              <Link
                href={`/tournaments/${tournament.id}/bracket`}
                className="text-sm font-medium text-accent-blue hover:underline"
              >
                View bracket →
              </Link>
            )}
            {tournament.streamUrl && (
              <a
                href={tournament.streamUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-blue hover:underline"
              >
                <Tv size={14} />
                Watch stream
              </a>
            )}
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {tournament.name}
          </h1>
          <p className="text-sm text-foreground/70">{tournament.game}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="badge badge-neutral bg-surface-elevated/80 text-foreground">
              <Layers size={12} />
              {formatText}
            </span>
            <span className="badge badge-neutral bg-surface-elevated/80 text-foreground">
              <Swords size={12} />
              {tournament.teamSize}
            </span>
            <span className="badge badge-neutral bg-surface-elevated/80 text-foreground">
              <Calendar size={12} />
              {formatShortDate(tournament.startAt)}
            </span>
            <span className="badge badge-neutral bg-surface-elevated/80 text-foreground">
              <Users size={12} />
              {registrantCount} / {tournament.participantCap} Players
            </span>
            <span className="badge badge-neutral bg-surface-elevated/80 text-foreground">
              <Trophy size={12} />
              {tournament.prizeAmount
                ? `${formatNaira(tournament.prizeAmount)} Prize Pool`
                : tournament.entryFee === 0
                  ? "Free Entry"
                  : `${formatNaira(tournament.entryFee)} Entry`}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        {/* Reserves real space so the tab bar + content pane resolving
            (TournamentTabs needs a boundary for useSearchParams) doesn't
            shift everything below it down — fallback={null} had nothing
            to reserve with. */}
        <Suspense
          fallback={
            <div className="flex min-w-0 flex-col gap-6">
              <div className="flex items-center gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-8 w-24 rounded-[8px]" />
                ))}
              </div>
              <div className="skeleton h-64 w-full rounded-[12px]" />
            </div>
          }
        >
          <TournamentTabs tabs={tabs} />
        </Suspense>

        <aside className="flex h-fit flex-col gap-4 lg:sticky lg:top-[76px]">
          <div className="card flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
                <Trophy size={20} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <h2 className="text-card-title">Register for Tournament</h2>
                <p className="text-metadata">Secure your spot and be part of the action.</p>
              </div>
              <ShareButton
                variant="compact"
                title={`${tournament.name} on Circuit`}
                url={canonicalUrl}
              />
            </div>

            <div className="flex flex-col gap-2.5 border-t border-border pt-4">
              <InfoRow icon={<Trophy size={14} />} label="Tournament" value={tournament.name} />
              <InfoRow icon={<Layers size={14} />} label="Game" value={tournament.game} />
              <InfoRow icon={<Calendar size={14} />} label="Date" value={formatShortDate(tournament.startAt)} />
              <InfoRow icon={<Layers size={14} />} label="Format" value={formatText} />
              <InfoRow icon={<Swords size={14} />} label="Team Size" value={tournament.teamSize} />
              <InfoRow icon={<Users size={14} />} label="Players" value={`${tournament.participantCap} max`} />
              <InfoRow
                icon={<Wallet size={14} />}
                label="Entry Fee"
                value={tournament.entryFee === 0 ? "Free" : formatNaira(tournament.entryFee)}
              />
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-4">
              {tournament.status === "CANCELLED" ? (
                <p className="alert alert-danger">
                  This tournament has been cancelled. Paid entries have been refunded.
                </p>
              ) : isOrganizer ? (
                <div className="flex flex-col gap-2">
                  <Link href={`/dashboard/tournaments/${tournament.id}`} className="btn-secondary w-full">
                    Manage
                  </Link>
                  {now < tournament.registrationCloseAt && (
                    <Link href={`/tournaments/${tournament.id}/edit`} className="btn-ghost w-full">
                      Edit
                    </Link>
                  )}
                  {cancellable && <CancelButton tournamentId={tournament.id} />}
                </div>
              ) : myRegistration?.status === "CONFIRMED" ? (
                <div className="alert alert-success flex-col items-stretch gap-3">
                  <p>You&apos;re registered for this tournament.</p>
                  {now < tournament.registrationCloseAt &&
                    tournament.status !== "LIVE" &&
                    tournament.status !== "COMPLETE" && <WithdrawButton registrationId={myRegistration.id} />}
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
                <>
                  <Link href={`/tournaments/${tournament.id}/register`} className="btn-primary w-full">
                    Register Now →
                  </Link>
                  <CapacityBar registered={registrantCount} cap={tournament.participantCap} className="h-1" />
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    <ShieldCheck size={12} className="shrink-0" />
                    {tournament.entryFee === 0
                      ? "No payment required, free to enter."
                      : "Secure payment via Paystack or Flutterwave."}
                  </p>
                </>
              ) : now >= tournament.registrationOpenAt &&
                now < tournament.registrationCloseAt &&
                registrantCount >= tournament.participantCap ? (
                <div className="alert alert-warning flex-col items-stretch gap-2">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <Users size={14} className="shrink-0" />
                    Registration is full — {tournament.participantCap}/{tournament.participantCap} players.
                  </p>
                  <CapacityBar registered={registrantCount} cap={tournament.participantCap} className="h-1" />
                </div>
              ) : (
                <p className="text-center text-sm text-muted">
                  {now < tournament.registrationOpenAt ? "Registration hasn't opened yet." : "Registration is closed."}
                </p>
              )}
            </div>
          </div>

          {canClaimPrize && <ClaimPrizeButton tournamentId={tournament.id} />}

          <div className="card flex items-start gap-3 bg-surface-elevated">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent-blue" />
            <div className="flex flex-col gap-0.5">
              <span className="text-card-title">Fair Play Guaranteed</span>
              <p className="text-metadata">
                Results are reported by both players and verified. Disputes go to the organizer, then Circuit
                staff.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
