/**
 * Circuit — the signed-in player's own strip at the top of Home. Returning
 * players see what needs them: matches to play or report, tournaments
 * they're in, an unpaid entry. A brand-new player sees a short, real
 * setup checklist (only the steps they haven't done) and a way into their
 * first tournament. Everything here is read from their own records.
 */

import Link from "next/link";
import type { User } from "@prisma/client";
import { ArrowRight, Check, Circle } from "lucide-react";
import { prisma } from "@/lib/db";
import { Panel, PanelRows, panelRowClass } from "@/components/ui/Panel";
import { StatusPill } from "@/components/StatusPill";
import { tournamentPath } from "@/lib/seo";

const SHORT_DATE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };

export async function YourCircuit({ user }: { user: User }) {
  const [matches, entries, unpaid, everPlayed] = await Promise.all([
    prisma.match.findMany({
      where: { OR: [{ playerAId: user.id }, { playerBId: user.id }], status: { not: "COMPLETE" } },
      orderBy: { createdAt: "asc" },
      take: 3,
      select: {
        id: true,
        status: true,
        round: true,
        tournament: { select: { name: true, game: true } },
        battle: { select: { game: true } },
        playerAId: true,
        playerA: { select: { handle: true } },
        playerB: { select: { handle: true } },
      },
    }),
    prisma.registration.findMany({
      where: { userId: user.id, status: "CONFIRMED", tournament: { status: { in: ["OPEN", "CLOSED", "LIVE"] } } },
      orderBy: { tournament: { startAt: "asc" } },
      take: 3,
      select: { id: true, tournament: { select: { id: true, name: true, game: true, status: true, startAt: true } } },
    }),
    prisma.registration.findMany({
      where: { userId: user.id, status: "PENDING_PAYMENT", tournament: { status: "OPEN" } },
      take: 2,
      select: { id: true, tournament: { select: { id: true, name: true } } },
    }),
    prisma.registration.count({ where: { userId: user.id, status: { in: ["CONFIRMED", "REFUNDED"] } } }),
  ]);

  const hasActivity = matches.length > 0 || entries.length > 0 || unpaid.length > 0;

  if (hasActivity) {
    return (
      <Panel title="Your Circuit">
        <PanelRows>
          {matches.map((m) => {
            const opponent = m.playerAId === user.id ? m.playerB.handle : m.playerA.handle;
            const label = m.status === "DISPUTED" ? "Disputed" : m.status === "NEEDS_RESULT" ? "Report result" : "Ready to play";
            return (
              <Link key={m.id} href={`/matches/${m.id}`} className={`${panelRowClass} py-3`}>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">vs @{opponent}</span>
                  <span className="text-metadata truncate">{m.tournament ? `${m.tournament.name}${m.round ? ` · Round ${m.round}` : ""}` : `${m.battle?.game ?? "Challenge"}`}</span>
                </div>
                <StatusPill tone={m.status === "DISPUTED" ? "attention" : "open"}>{label}</StatusPill>
              </Link>
            );
          })}
          {unpaid.map((r) => (
            <Link key={r.id} href={tournamentPath(r.tournament)} className={`${panelRowClass} py-3`}>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold">{r.tournament.name}</span>
                <span className="text-metadata">Your entry isn&apos;t paid yet</span>
              </div>
              <StatusPill tone="attention">Finish payment</StatusPill>
            </Link>
          ))}
          {entries.map((r) => (
            <Link key={r.id} href={tournamentPath(r.tournament)} className={`${panelRowClass} py-3`}>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold">{r.tournament.name}</span>
                <span className="text-metadata truncate" suppressHydrationWarning>
                  {r.tournament.game} · {r.tournament.status === "LIVE" ? "Live now" : `Starts ${r.tournament.startAt.toLocaleString("en-NG", SHORT_DATE)}`}
                </span>
              </div>
              <StatusPill tone={r.tournament.status === "LIVE" ? "live" : "open"} pulse={r.tournament.status === "LIVE"}>
                {r.tournament.status === "LIVE" ? "Live" : "Registered"}
              </StatusPill>
            </Link>
          ))}
        </PanelRows>
      </Panel>
    );
  }

  // New player (or between tournaments): the setup steps still open.
  const steps = [
    { done: !!user.emailVerifiedAt, label: "Verify your email", href: "/account" },
    { done: !!user.avatarUrl, label: "Add a profile photo", href: "/account" },
    { done: user.favoriteGames.length > 0, label: "Pick the games you play", href: "/welcome?again=1" },
  ];
  const open = steps.filter((s) => !s.done);

  return (
    <Panel title={everPlayed > 0 ? "Your Circuit" : "Get started"}>
      <div className="flex flex-col gap-4 px-5 pb-5">
        <p className="text-sm text-muted">
          {everPlayed > 0 ? "You're not in a tournament right now. Find your next one." : "Enter your first tournament to start building your record."}
        </p>
        {open.length > 0 && (
          <ul className="flex flex-col gap-2">
            {steps.map((s) => (
              <li key={s.label}>
                {s.done ? (
                  <span className="flex items-center gap-2.5 text-sm text-muted line-through">
                    <Check size={16} className="text-success" aria-hidden /> {s.label}
                  </span>
                ) : (
                  <Link href={s.href} className="flex items-center gap-2.5 text-sm font-medium hover:text-accent-blue">
                    <Circle size={16} className="text-muted-strong" aria-hidden /> {s.label}
                    <ArrowRight size={14} className="ml-auto text-muted" aria-hidden />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        <Link href="/compete" className="btn-primary h-11 w-fit gap-2 px-5">
          Find a tournament <ArrowRight size={16} />
        </Link>
      </div>
    </Panel>
  );
}
