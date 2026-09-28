/**
 * Circuit — admin tournament detail/manage (native to the admin shell).
 * Same real data the organizer's own `/dashboard/tournaments/[id]` shows
 * (registrants, escrow, disputes, bracket status) — deliberately not a
 * redirect out to that page, or to the public `/tournaments/[id]`: an
 * admin clicking something in the control center should stay in the
 * control center, not land back in the player-facing app's own chrome.
 * Bracket and dispute ruling are both admin-native now too
 * (`/admin/competitions/[id]/bracket`, `/admin/matches/[id]`). "View
 * public page" is the one remaining explicit, clearly-labeled exception
 * — opens in a new tab.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowUpRight, Download, Snowflake } from "lucide-react";
import { prisma } from "@/lib/db";
import { describeSplit, prizePayoutSummary } from "@/lib/prizes";
import { getStructure } from "@/lib/competitionStructures";
import { EmptyState, naira, PageHeader, Panel, RegistrationBadge, Section, StatStrip, StatusBadge, TournamentStatusBadge } from "@/components/admin/ui";
import { RowLink } from "@/components/admin/ui-client";
import { AdminCancelTournament } from "@/components/admin/AdminCancelTournament";
import { FreezeFundsControl } from "@/components/admin/FreezeFundsControl";

function formatDateTime(date: Date): string {
  return date.toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export default async function AdminCompetitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({ where: { id }, include: { organizer: { select: { user: { select: { displayName: true } } } } } });
  if (!tournament) notFound();
  const organizerName = tournament.organizer.user.displayName;

  const [registrations, escrowTxns, openDisputes, bracket, latestFreezeAction] = await Promise.all([
    prisma.registration.findMany({
      where: { tournamentId: id },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, displayName: true, handle: true } } },
    }),
    prisma.escrowTransaction.findMany({ where: { tournamentId: id }, orderBy: { createdAt: "asc" } }),
    prisma.dispute.findMany({
      where: { status: { in: ["OPEN", "ORGANIZER_REVIEW"] }, match: { tournamentId: id } },
      include: {
        match: { include: { playerA: { select: { displayName: true } }, playerB: { select: { displayName: true } } } },
      },
    }),
    prisma.bracket.findUnique({ where: { tournamentId: id } }),
    // Freeze reason isn't duplicated onto Tournament itself — the most
    // recent freeze/unfreeze audit-log row is the source of truth for
    // "why," same reasoning as the schema field's own comment.
    prisma.auditLogEntry.findFirst({
      where: { targetType: "Tournament", targetId: id, action: { in: ["tournament.freezeFunds", "tournament.unfreezeFunds"] } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const collected = escrowTxns.filter((t) => t.type === "ENTRY_FEE" && t.status === "COMPLETE").reduce((s, t) => s + t.amount, 0);
  const platformFee = escrowTxns.filter((t) => t.type === "PLATFORM_FEE" && t.status === "COMPLETE").reduce((s, t) => s + t.amount, 0);
  const organizerRevenueSettled = escrowTxns.filter((t) => t.type === "ORGANIZER_REVENUE" && t.status === "COMPLETE").reduce((s, t) => s + t.amount, 0);
  const organizerRevenuePending = escrowTxns.filter((t) => t.type === "ORGANIZER_REVENUE" && t.status === "PENDING").reduce((s, t) => s + t.amount, 0);
  const refunded = escrowTxns.filter((t) => t.type === "REFUND").reduce((s, t) => s + t.amount, 0);
  const payoutSummary = prizePayoutSummary(escrowTxns, tournament.prizeSplit);
  // Matches tournaments/[id]/cancel/route.ts's own guard exactly — that
  // route stopped blocking cancellation once startAt passes (a live
  // tournament can still be voided/refunded), but this button's own
  // visibility condition was never updated to match, so it kept hiding
  // itself past startAt even though the API underneath would have
  // allowed the call. Found while wiring the freeze-funds condition in.
  const cancellable = tournament.status !== "CANCELLED" && tournament.status !== "COMPLETE" && !tournament.fundsFrozen;
  const freezeReason =
    tournament.fundsFrozen && latestFreezeAction?.action === "tournament.freezeFunds"
      ? ((latestFreezeAction.metadata as { reason?: string } | null)?.reason ?? null)
      : null;

  const structure = getStructure(tournament.format);
  const standingsLabel = tournament.competitionStyle === "LOBBY" || ["ROUND_ROBIN", "SWISS"].includes(tournament.format) ? "Standings" : "Bracket";
  const started = tournament.status === "LIVE" || tournament.status === "COMPLETE";
  const confirmed = registrations.filter((r) => r.status === "CONFIRMED").length;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/competitions", label: "Competitions" }}
        title={tournament.name}
        meta={
          <>
            <TournamentStatusBadge status={tournament.status} />
            {tournament.fundsFrozen && <StatusBadge tone="attention">Funds frozen</StatusBadge>}
            <span>
              {tournament.game} · {structure?.label ?? tournament.format} · {tournament.teamSize}
            </span>
          </>
        }
        actions={
          <>
            <Link href={`/tournaments/${id}`} target="_blank" className="btn-ghost">
              Public page <ArrowUpRight size={14} />
            </Link>
            {(bracket || started) && (
              <Link href={`/admin/competitions/${id}/bracket`} className="btn-secondary">
                {standingsLabel}
              </Link>
            )}
            <Link href={`/admin/competitions/${id}/edit`} className="btn-secondary">
              Edit
            </Link>
            {cancellable && <AdminCancelTournament tournamentId={id} paidEntries={registrations.filter((r) => r.status === "CONFIRMED" && tournament.entryFee > 0).length} />}
          </>
        }
      />

      {tournament.fundsFrozen && (
        <div className="flex items-start gap-3 rounded-[10px] border border-gold/30 bg-gold/[0.06] px-4 py-3">
          <Snowflake size={16} className="mt-0.5 shrink-0 text-gold" />
          <div className="flex flex-col gap-0.5 text-[13px]">
            <span className="font-medium text-foreground">Funds frozen — prize claims and cancel-with-refund are blocked.</span>
            {freezeReason && <span className="text-muted">Reason: {freezeReason}</span>}
          </div>
        </div>
      )}

      {openDisputes.length > 0 && (
        <Section title="Disputes waiting on the organizer" description="Staff can rule once a dispute escalates, or open the match to review it.">
          <Panel padded={false}>
            {openDisputes.map((dispute) => (
              <Link
                key={dispute.id}
                href={`/admin/matches/${dispute.matchId}`}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 text-[13px] transition-colors last:border-b-0 hover:bg-surface-elevated sm:px-5"
              >
                <span className="flex items-center gap-2.5 truncate">
                  <AlertTriangle size={14} className="shrink-0 text-gold" />
                  {dispute.match.playerA.displayName} vs {dispute.match.playerB.displayName}
                </span>
                <span className="shrink-0 text-muted">Review →</span>
              </Link>
            ))}
          </Panel>
        </Section>
      )}

      <StatStrip
        stats={[
          { label: "Entry fees collected", value: naira(collected), hint: `${confirmed} confirmed of ${tournament.participantCap}` },
          { label: "Platform fee", value: naira(platformFee) },
          {
            label: "Organizer revenue",
            value: naira(organizerRevenueSettled),
            hint: organizerRevenuePending > 0 ? `${naira(organizerRevenuePending)} pending settlement` : undefined,
            tone: "attention",
          },
          { label: "Refunded", value: naira(refunded) },
          {
            label: "Prize payout",
            value: <span className="text-[15px]">{tournament.status === "COMPLETE" ? payoutSummary : tournament.prizeAmount ? "After it finishes" : "No cash prize"}</span>,
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Section
          title={`Entries · ${registrations.length}`}
          actions={
            registrations.length > 0 && (
              <a href={`/api/tournaments/${id}/registrants.csv`} className="btn-ghost !min-h-8 !px-2.5 !text-[12px]">
                <Download size={13} /> Export CSV
              </a>
            )
          }
        >
          {registrations.length === 0 ? (
            <EmptyState title="No entries yet" description="Players who register appear here with their payment status." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{tournament.entryType === "TEAM" ? "Team / captain" : "Player"}</th>
                    <th>In-game ID</th>
                    <th>Status</th>
                    <th className="text-right">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {registrations.map((reg) => (
                    <RowLink key={reg.id} href={`/admin/users/${reg.user.id}`}>
                      <td>
                        <Link href={`/admin/users/${reg.user.id}`} className="flex min-w-0 flex-col leading-tight">
                          <span className="truncate font-medium text-foreground">{reg.teamName ?? reg.user.displayName}</span>
                          <span className="truncate text-[12px] text-muted">
                            {reg.teamName ? `Captain ${reg.user.displayName} · ` : ""}@{reg.user.handle}
                          </span>
                        </Link>
                      </td>
                      <td className="font-code text-[12px] text-muted">{reg.inGameId}</td>
                      <td>
                        <RegistrationBadge status={reg.status} />
                      </td>
                      <td className="text-right text-muted">{formatDateTime(reg.createdAt)}</td>
                    </RowLink>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <div className="flex flex-col gap-8">
          <Section title="Details">
            <Panel>
              <dl className="flex flex-col gap-3 text-[13px]">
                {[
                  ["Organizer", tournament.organizerId ? <Link key="o" href={`/admin/users/${tournament.organizerId}`} className="hover:underline">{organizerName}</Link> : "—"],
                  ["Entry fee", tournament.entryFee ? naira(tournament.entryFee) : "Free"],
                  ["Prize", tournament.prizeAmount ? `${naira(tournament.prizeAmount)} · ${describeSplit(tournament.prizeSplit)}` : (tournament.prizeText ?? "None")],
                  ["Registration", `${formatDateTime(tournament.registrationOpenAt)} → ${formatDateTime(tournament.registrationCloseAt)}`],
                  ["Starts", formatDateTime(tournament.startAt)],
                  [
                    "Cancellation lock",
                    tournament.cancellationLockAt
                      ? `${formatDateTime(tournament.cancellationLockAt)}${new Date() >= tournament.cancellationLockAt ? " · passed (staff only)" : ""}`
                      : "None",
                  ],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex flex-col gap-0.5">
                    <dt className="text-[12px] text-muted">{label}</dt>
                    <dd className="text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </Section>

          <Section title="Fund controls" description="Freezing blocks prize claims and cancel-with-refund until unfrozen. Use it while investigating, not routinely.">
            <Panel>
              <FreezeFundsControl tournamentId={id} fundsFrozen={tournament.fundsFrozen} freezeReason={freezeReason} />
            </Panel>
          </Section>
        </div>
      </div>
    </>
  );
}
