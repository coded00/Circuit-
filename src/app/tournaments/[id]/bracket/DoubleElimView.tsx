/**
 * Circuit — a double elimination tournament's page: the winners' bracket,
 * the losers' bracket and the grand final as columns of match cards.
 * Shown at /tournaments/[id]/bracket (and the admin bracket page) in place
 * of the knockout tree. Data is the Bracket row's structure
 * (src/lib/doubleElim.ts) plus the matches' status.
 */

import Link from "next/link";
import { ArrowLeft, Share2, Swords } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { ShareButton } from "@/components/ShareButton";
import { StatusPill, matchStatusInfo } from "@/components/StatusPill";
import { doubleElimPlacements, nodeLabel, type DENode, type DEStructure } from "@/lib/doubleElim";
import TournamentTabs, { type TournamentTab } from "../TournamentTabs";

type ViewTournament = { id: string; name: string; game: string; status: string; teamSize: string; posterUrl: string | null; rulesText: string | null };
type Person = { id: string; displayName: string; handle: string };

function Slot({ id, name, won, you, pending }: { id: string | null; name: string; won: boolean; you: boolean; pending: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-2 px-3 py-1.5 text-sm ${won ? "font-bold" : id ? "font-medium" : "text-muted"}`}>
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        <span className="truncate">{name}</span>
        {you && <span className="badge badge-open shrink-0">You</span>}
      </span>
      {won && !pending && <span className="text-[10px] font-bold tracking-wide text-success uppercase">Won</span>}
    </div>
  );
}

export function DoubleElimView({
  tournament,
  structure,
  people,
  statuses,
  viewerId,
  backHref,
  matchHrefBase,
  shareUrl,
}: {
  tournament: ViewTournament;
  structure: DEStructure;
  /** Display names by user id (team names for team entries). */
  people: Person[];
  statuses: Record<string, string>;
  viewerId: string | null;
  backHref: string;
  matchHrefBase: string;
  shareUrl?: string;
}) {
  const person = new Map(people.map((p) => [p.id, p]));
  const nameOf = (id: string | null, n: DENode, side: "a" | "b") => {
    if (id) return person.get(id)?.displayName ?? "Unknown";
    const src = side === "a" ? n.a : n.b;
    if (n.resolved || src.kind === "seed") return "Bye";
    return "TBD";
  };
  // Only real matches (played or still to come): byes resolve on their own
  // and aren't shown, nor is the reset unless it's being played.
  const shown = (n: DENode) => !(n.resolved && !n.matchId) && !(n.id === "GF2" && !n.matchId);
  const card = (n: DENode) => {
    const status = n.matchId ? matchStatusInfo(statuses[n.matchId] ?? "UPCOMING") : null;
    const mine = !!viewerId && (n.playerAId === viewerId || n.playerBId === viewerId);
    const body = (
      <div className={`card flex flex-col divide-y divide-border p-0 ${mine && !n.resolved ? "border-accent-volt/50" : ""}`}>
        <div className="flex items-center justify-between gap-2 px-3 py-1.5">
          <span className="text-eyebrow text-muted">{nodeLabel(structure, n)}</span>
          {status ? (
            <StatusPill tone={status.tone} pulse={status.pulse}>
              {status.label}
            </StatusPill>
          ) : n.resolved && (n.playerAId || n.playerBId) ? (
            <span className="text-[10px] font-semibold text-muted uppercase">Bye</span>
          ) : null}
        </div>
        <Slot id={n.playerAId} name={nameOf(n.playerAId, n, "a")} won={!!n.winnerId && n.winnerId === n.playerAId} you={!!viewerId && n.playerAId === viewerId} pending={!n.resolved} />
        <Slot id={n.playerBId} name={nameOf(n.playerBId, n, "b")} won={!!n.winnerId && n.winnerId === n.playerBId} you={!!viewerId && n.playerBId === viewerId} pending={!n.resolved} />
      </div>
    );
    return n.matchId ? (
      <Link key={n.id} href={`${matchHrefBase}/${n.matchId}`} className="block transition hover:opacity-90">
        {body}
      </Link>
    ) : (
      <div key={n.id}>{body}</div>
    );
  };
  const columns = (bracket: "W" | "L") => {
    const rounds = [...new Set(structure.nodes.filter((n) => n.bracket === bracket).map((n) => n.round))].sort((a, b) => a - b);
    return (
      <div className="scrollbar-hide flex gap-4 overflow-x-auto pb-2">
        {rounds.map((r) => {
          const list = structure.nodes.filter((n) => n.bracket === bracket && n.round === r && shown(n));
          if (list.length === 0) return null;
          return (
            <div key={r} className="flex w-56 shrink-0 flex-col justify-around gap-3">
              {list.map(card)}
            </div>
          );
        })}
      </div>
    );
  };
  const finals = structure.nodes.filter((n) => (n.bracket === "GF" || n.bracket === "GF2") && shown(n));
  const { first, second, third } = doubleElimPlacements(structure);
  const champion = first ? person.get(first) : undefined;
  const myNext = viewerId ? structure.nodes.find((n) => n.matchId && !n.resolved && (n.playerAId === viewerId || n.playerBId === viewerId)) : undefined;

  const tabs: TournamentTab[] = [
    { key: "winners", label: "Winners bracket", content: columns("W") },
    { key: "losers", label: "Losers bracket", content: structure.loserRounds ? columns("L") : <p className="card text-center text-muted">With two entries, the first match&apos;s loser goes straight to the grand final.</p> },
    {
      key: "final",
      label: "Grand final",
      content: (
        <div className="flex max-w-sm flex-col gap-3">
          {finals.map(card)}
          <p className="text-xs text-muted">
            The winners&apos; bracket champion only needs to win once. If the losers&apos; bracket champion wins, the bracket resets and one more match decides it.
          </p>
        </div>
      ),
    },
  ];

  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <header data-surface="dark" className="flex flex-col gap-4 rounded-[var(--radius-hero)] border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="flex min-w-0 items-center gap-4">
          <GameArtTile game={tournament.game} posterUrl={tournament.posterUrl} className="hidden h-16 w-24 shrink-0 rounded-[10px] sm:block" hideLabel imgWidth={240} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <Link href={backHref} className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition hover:text-foreground">
              <ArrowLeft size={15} />
              <span className="truncate">{tournament.name}</span>
            </Link>
            <h1 className="font-display text-3xl leading-none font-bold tracking-tight uppercase sm:text-4xl">Bracket</h1>
            <span className="text-xs text-muted">
              {tournament.game} · Double elimination · {tournament.teamSize} · {people.length} entries
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <TournamentTabs tabs={tabs} trailing={shareUrl ? <ShareButton key="share" title={`${tournament.name} bracket on Circuit`} url={shareUrl} /> : undefined} />
        <aside className="flex h-fit flex-col gap-4 lg:sticky lg:top-[76px]">
          <section className={`card flex flex-col items-center gap-2 p-6 text-center ${champion ? "border-gold/40" : ""}`}>
            <span className="text-eyebrow text-gold">Champion</span>
            <span className="font-display text-2xl font-bold tracking-tight uppercase">{champion?.displayName ?? "TBD"}</span>
            {champion && <span className="text-xs text-muted">@{champion.handle}</span>}
            {champion && (second || third) && (
              <p className="text-xs text-muted">
                {second && `2nd ${person.get(second)?.displayName ?? ""}`}
                {third && ` · 3rd ${person.get(third)?.displayName ?? ""}`}
              </p>
            )}
            {!champion && <p className="text-xs text-muted">Decided in the grand final. Lose twice and you&apos;re out.</p>}
            {champion && (
              <Link href={`/share/champion/${tournament.id}`} className="btn-secondary w-full text-sm">
                <Share2 size={13} />
                Share champion card
              </Link>
            )}
          </section>
          {myNext && (
            <Link href={`${matchHrefBase}/${myNext.matchId}`} className="card flex items-center gap-3 p-4 hover:border-border-hover">
              <Swords size={18} className="shrink-0 text-accent-volt" />
              <div className="flex min-w-0 flex-col">
                <span className="text-eyebrow text-muted">Your next match · {nodeLabel(structure, myNext)}</span>
                <span className="truncate text-sm font-semibold">
                  vs {person.get(myNext.playerAId === viewerId ? myNext.playerBId! : myNext.playerAId!)?.displayName}
                </span>
              </div>
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
