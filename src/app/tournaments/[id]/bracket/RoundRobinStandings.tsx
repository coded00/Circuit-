/**
 * Circuit — a round robin or Swiss tournament's page: the standings
 * table, every match grouped by round (with Swiss byes), and the rules. Shown at /tournaments/[id]/bracket
 * (and the admin bracket page) in place of a knockout tree. Data from
 * loadRoundRobin (src/lib/roundRobinStandings.ts).
 */

import Link from "next/link";
import { ArrowLeft, Crown, Share2, Swords } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { ShareButton } from "@/components/ShareButton";
import { StatusPill, matchStatusInfo } from "@/components/StatusPill";
import type { RoundRobinView, SwissView } from "@/lib/roundRobinStandings";
import TournamentTabs, { type TournamentTab } from "../TournamentTabs";

type ViewTournament = { id: string; name: string; game: string; status: string; teamSize: string; posterUrl: string | null; rulesText: string | null; entryType: string };

export function RoundRobinStandings({
  tournament,
  view,
  viewerId,
  backHref,
  matchHrefBase,
  shareUrl,
}: {
  tournament: ViewTournament;
  view: RoundRobinView | SwissView;
  viewerId: string | null;
  backHref: string;
  matchHrefBase: string;
  shareUrl?: string;
}) {
  const entry = new Map(view.entries.map((e) => [e.userId, e]));
  const name = (id: string) => entry.get(id)?.name ?? "Unknown";
  const champion = view.outcome.state === "DECIDED" ? entry.get(view.outcome.winnerId) : undefined;
  const leaderRow = view.table[0] && view.table[0].played > 0 ? view.table[0] : undefined;
  // Several level on top: no single leader to name.
  const tiedOnTop = leaderRow ? view.table.filter((row) => row.rank === leaderRow.rank).length : 0;
  const headline = champion ?? (leaderRow && tiedOnTop === 1 ? entry.get(leaderRow.entryId) : undefined);
  const done = view.matches.filter((m) => m.complete).length;
  const myOpen = viewerId ? view.matches.filter((m) => !m.complete && (m.playerAId === viewerId || m.playerBId === viewerId)) : [];
  const unit = tournament.entryType === "TEAM" ? "Team" : "Player";
  const swiss = view.kind === "SWISS" ? view : null;
  const byesIn = (round: number) => swiss?.byes.filter((b) => b.round === round) ?? [];

  const standings = (
    <section className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="text-eyebrow w-12 px-4 py-2.5 text-muted">#</th>
              <th className="text-eyebrow px-2 py-2.5 text-muted">{unit}</th>
              <th className="text-eyebrow w-12 px-1 py-2.5 text-center text-muted" title="Played">P</th>
              <th className="text-eyebrow w-12 px-1 py-2.5 text-center text-muted" title="Wins">W</th>
              <th className="text-eyebrow w-12 px-1 py-2.5 text-center text-muted" title="Losses">L</th>
              {swiss && (
                <th className="text-eyebrow w-12 px-1 py-2.5 text-center text-muted" title="Buchholz. Your opponents' combined wins">
                  Bh
                </th>
              )}
              <th className="text-eyebrow w-16 px-4 py-2.5 text-right text-muted" title="Score difference">+/-</th>
            </tr>
          </thead>
          <tbody>
            {view.table.map((row) => {
              const e = entry.get(row.entryId);
              if (!e) return null;
              const you = row.entryId === viewerId;
              return (
                <tr key={row.entryId} className={`border-b border-border last:border-b-0 ${you ? "bg-accent-volt/5" : ""}`}>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted tabular-nums">
                    {champion?.userId === row.entryId ? <Crown size={15} className="text-gold" aria-label="Champion" /> : done ? row.rank : "–"}
                  </td>
                  <td className="max-w-0 px-2 py-2.5">
                    <span className="flex items-center gap-1.5 truncate font-semibold">
                      <span className="truncate">{e.name}</span>
                      {e.tag && <span className="font-mono text-[11px] text-muted">[{e.tag}]</span>}
                      {you && <span className="badge badge-open shrink-0">You</span>}
                    </span>
                    <span className="text-metadata">@{e.handle}</span>
                  </td>
                  <td className="px-1 py-2.5 text-center font-mono text-xs tabular-nums">{row.played}</td>
                  <td className="px-1 py-2.5 text-center font-mono text-sm font-bold tabular-nums">{row.wins}</td>
                  <td className="px-1 py-2.5 text-center font-mono text-xs tabular-nums">{row.losses}</td>
                  {swiss && <td className="px-1 py-2.5 text-center font-mono text-xs tabular-nums">{"buchholz" in row ? row.buchholz : ""}</td>}
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">{row.diff > 0 ? `+${row.diff}` : row.diff}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-5 py-2.5 text-xs text-muted">
        {swiss
          ? "Most wins takes it (a bye counts as a win). Ties break on Buchholz (the combined wins of everyone you played), then score difference. If first place is still level after the last round, the top two play a decider."
          : `Most wins takes it. Ties break on head-to-head results between the tied ${unit.toLowerCase()}s, then score difference. If first place is still level, the top two play a decider.`}
      </p>
    </section>
  );

  const rounds = [...new Set(view.matches.map((m) => (m.decider ? "decider" : String(m.round))))];
  const matches = (
    <div className="flex flex-col gap-4">
      {rounds.map((key) => {
        const list = view.matches.filter((m) => (key === "decider" ? m.decider : !m.decider && String(m.round) === key));
        return (
          <section key={key} className="flex flex-col gap-2">
            <h3 className="text-eyebrow text-muted">{key === "decider" ? "Decider: tie for first" : `Round ${key}`}</h3>
            {!swiss || key === "decider" ? null : byesIn(Number(key)).map((b) => (
              <div key={`bye-${b.userId}`} className="card-row flex items-center justify-between gap-3 p-3 opacity-80">
                <span className="truncate text-sm font-medium">{name(b.userId)}</span>
                <span className="text-[11px] font-semibold text-muted uppercase">Bye. Counts as a win</span>
              </div>
            ))}
            {list.map((m) => {
              const status = matchStatusInfo(m.status);
              const mine = m.playerAId === viewerId || m.playerBId === viewerId;
              return (
                <Link key={m.id} href={`${matchHrefBase}/${m.id}`} className={`card-row flex items-center justify-between gap-3 p-3 ${mine ? "border-accent-volt/40" : ""}`}>
                  <span className="min-w-0 truncate text-sm">
                    <span className={m.winnerId === m.playerAId ? "font-bold" : "font-medium"}>{name(m.playerAId)}</span>
                    <span className="text-muted"> vs </span>
                    <span className={m.winnerId === m.playerBId ? "font-bold" : "font-medium"}>{name(m.playerBId)}</span>
                    {m.score && <span className="ml-2 font-mono text-xs text-muted">{m.score}</span>}
                  </span>
                  <StatusPill tone={status.tone} pulse={status.pulse}>
                    {status.label}
                  </StatusPill>
                </Link>
              );
            })}
          </section>
        );
      })}
    </div>
  );

  const about = (
    <div className="flex flex-col gap-4">
      <section className="widget flex flex-col gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">How it works</h3>
        <p className="text-sm text-muted">
          {swiss
            ? `${view.totalRounds} rounds. Each round pairs players on the same record, never the same opponent twice; the next round is drawn as soon as every match of the current one is done. With an odd number of players, one sits out each round with a bye (counted as a win, at most once each).`
            : `Everyone plays everyone once — ${view.matches.filter((m) => !m.decider).length} matches over ${view.totalRounds} rounds. Play your matches in any order.`}{" "}
          Each match is ready-up, report and proof like any Circuit match, with disputes going to the organiser, then Circuit staff.
        </p>
      </section>
      {tournament.rulesText && (
        <section className="widget flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Rules</h3>
          <p className="text-sm whitespace-pre-wrap text-muted">{tournament.rulesText}</p>
        </section>
      )}
    </div>
  );

  const tabs: TournamentTab[] = [
    { key: "standings", label: "Standings", content: standings },
    { key: "matches", label: `Matches · ${done}/${view.matches.length}`, content: matches },
    { key: "about", label: "About", content: about },
  ];

  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <header data-surface="dark" className="flex flex-col gap-4 cut-lg [--cut-line:var(--border)] border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="flex min-w-0 items-center gap-4">
          <GameArtTile game={tournament.game} posterUrl={tournament.posterUrl} className="hidden h-16 w-24 shrink-0 cut-avatar sm:block" hideLabel imgWidth={240} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <Link href={backHref} className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition hover:text-foreground">
              <ArrowLeft size={15} />
              <span className="truncate">{tournament.name}</span>
            </Link>
            <h1 className="font-display text-3xl leading-none font-bold tracking-tight uppercase sm:text-4xl">Standings</h1>
            <span className="text-xs text-muted">
              {tournament.game} · {swiss ? "Swiss" : "Round robin"} · {tournament.teamSize} · {view.entries.length} {unit.toLowerCase()}s · {view.totalRounds} rounds
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <TournamentTabs tabs={tabs} trailing={shareUrl ? <ShareButton key="share" title={`${tournament.name} standings on Circuit`} url={shareUrl} /> : undefined} />

        <aside className="flex h-fit flex-col gap-4 lg:sticky lg:top-[76px]">
          <section className={`card flex flex-col items-center gap-2 p-6 text-center ${champion ? "border-gold/40" : ""}`}>
            <span className="text-eyebrow text-gold">{champion ? "Champion" : "Leader"}</span>
            <span className="font-display text-2xl font-bold tracking-tight uppercase">{headline?.name ?? (tiedOnTop > 1 ? `${tiedOnTop}-way tie` : "TBD")}</span>
            {headline && <span className="text-xs text-muted">@{headline.handle}</span>}
            <p className="text-xs text-muted">
              {champion
                ? view.decider
                  ? "Won the decider after finishing level on top."
                  : swiss
                    ? `Most wins after ${swiss.totalRounds} Swiss rounds.`
                    : "Most wins when every match was played."
                : view.decider
                  ? `${name(view.decider.playerAId)} and ${name(view.decider.playerBId)} are level on top. The decider settles it.`
                  : swiss
                    ? `Round ${swiss.currentRound} of ${swiss.totalRounds} · ${done} of ${view.matches.length} matches played.`
                    : `${done} of ${view.matches.length} matches played.`}
            </p>
            {champion && (
              <Link href={`/share/champion/${tournament.id}`} className="btn-secondary w-full text-sm">
                <Share2 size={13} />
                Share champion card
              </Link>
            )}
          </section>

          {myOpen.length > 0 && (
            <section className="card flex flex-col gap-2 p-4">
              <span className="text-eyebrow text-muted">Your matches to play</span>
              {myOpen.map((m) => (
                <Link key={m.id} href={`${matchHrefBase}/${m.id}`} className="flex items-center gap-2 text-sm font-medium hover:text-accent-volt">
                  <Swords size={14} className="shrink-0 text-muted" />
                  <span className="truncate">vs {name(m.playerAId === viewerId ? m.playerBId : m.playerAId)}</span>
                  {m.decider && <span className="badge badge-open shrink-0">Decider</span>}
                </Link>
              ))}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
