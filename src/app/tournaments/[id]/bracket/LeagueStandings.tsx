/**
 * Circuit — a league's page: the points table, every fixture grouped by
 * matchday with its play-by date, and the rules. Shown at
 * /tournaments/[id]/bracket (and the admin bracket page) in place of a
 * knockout tree. Data from loadLeague (src/lib/leagueStandings.ts).
 */

import Link from "next/link";
import { ArrowLeft, CalendarClock, Crown, Share2, Swords } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { InfoTip } from "@/components/InfoTip";
import { ShareButton } from "@/components/ShareButton";
import { StatusPill, matchStatusInfo } from "@/components/StatusPill";
import type { LeagueView } from "@/lib/leagueStandings";
import TournamentTabs, { type TournamentTab } from "../TournamentTabs";
import { AwardResultButton } from "./AwardResultButton";

type ViewTournament = { id: string; name: string; game: string; status: string; teamSize: string; posterUrl: string | null; rulesText: string | null; entryType: string };

const dueLabel = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" });

export function LeagueStandings({
  tournament,
  view,
  viewerId,
  isOrganizer,
  backHref,
  matchHrefBase,
  shareUrl,
}: {
  tournament: ViewTournament;
  view: LeagueView;
  viewerId: string | null;
  /** The viewer runs this league and can settle overdue fixtures. */
  isOrganizer: boolean;
  backHref: string;
  matchHrefBase: string;
  shareUrl?: string;
}) {
  const entry = new Map(view.entries.map((e) => [e.userId, e]));
  const name = (id: string) => entry.get(id)?.name ?? "Unknown";
  const { rules } = view;
  const draws = rules.drawPoints !== null;
  const champion = view.outcome.state === "DECIDED" ? entry.get(view.outcome.winnerId) : undefined;
  const leaderRow = view.table[0] && view.table[0].played > 0 ? view.table[0] : undefined;
  const tiedOnTop = leaderRow ? view.table.filter((row) => row.rank === leaderRow.rank).length : 0;
  const headline = champion ?? (leaderRow && tiedOnTop === 1 ? entry.get(leaderRow.entryId) : undefined);
  const regular = view.matches.filter((m) => !m.decider);
  const done = regular.filter((m) => m.complete).length;
  const overdue = (m: (typeof view.matches)[number]) => m.overdue;
  const overdueCount = regular.filter(overdue).length;
  const myOpen = viewerId ? view.matches.filter((m) => !m.complete && (m.playerAId === viewerId || m.playerBId === viewerId)) : [];
  const unit = tournament.entryType === "TEAM" ? "Team" : "Player";

  const standings = (
    <section className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm sm:min-w-[460px]">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="text-eyebrow w-9 pr-1 pl-3 py-2.5 text-muted sm:w-12 sm:px-4">#</th>
              <th className="text-eyebrow px-2 py-2.5 text-muted">{unit}</th>
              <th className="text-eyebrow w-10 px-1 py-2.5 text-center text-muted" title="Played">P</th>
              <th className="text-eyebrow w-10 px-1 py-2.5 text-center text-muted" title="Won">W</th>
              {draws && <th className="text-eyebrow w-10 px-1 py-2.5 text-center text-muted" title="Drawn">D</th>}
              <th className="text-eyebrow hidden w-10 px-1 py-2.5 text-center text-muted sm:table-cell" title="Lost">L</th>
              <th className="text-eyebrow hidden w-12 px-1 py-2.5 text-center text-muted sm:table-cell" title="Goal/score difference">+/-</th>
              <th className="text-eyebrow w-12 py-2.5 pr-3 pl-1 text-right text-muted sm:w-14 sm:px-4" title="Points">Pts</th>
            </tr>
          </thead>
          <tbody>
            {view.table.map((row) => {
              const e = entry.get(row.entryId);
              if (!e) return null;
              const you = row.entryId === viewerId;
              return (
                <tr key={row.entryId} className={`border-b border-border last:border-b-0 ${you ? "bg-accent-volt/5" : ""}`}>
                  <td className="py-2.5 pr-1 pl-3 font-mono text-xs text-muted tabular-nums sm:px-4">
                    {champion?.userId === row.entryId ? <Crown size={15} className="text-gold" aria-label="Champion" /> : done > 0 ? row.rank : "–"}
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
                  <td className="px-1 py-2.5 text-center font-mono text-xs tabular-nums">{row.wins}</td>
                  {draws && <td className="px-1 py-2.5 text-center font-mono text-xs tabular-nums">{row.draws}</td>}
                  <td className="hidden px-1 py-2.5 text-center font-mono text-xs tabular-nums sm:table-cell">{row.losses}</td>
                  <td className="hidden px-1 py-2.5 text-center font-mono text-xs tabular-nums sm:table-cell">{row.gd > 0 ? `+${row.gd}` : row.gd}</td>
                  <td className="py-2.5 pr-3 pl-1 text-right font-mono text-sm font-bold tabular-nums sm:px-4">{row.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-4 py-2.5 text-xs text-muted sm:px-5">
        {rules.winPoints} point{rules.winPoints === 1 ? "" : "s"} for a win{draws ? `, ${rules.drawPoints} for a draw` : ""}, 0 for a loss. Level on points? Head-to-head results
        between the tied {unit.toLowerCase()}s come first, then score difference, then score for. If first place is still level, the top two play a decider.
      </p>
    </section>
  );

  const matchdays = [...new Set(view.matches.map((m) => (m.decider ? "decider" : String(m.round))))];
  const fixtures = (
    <div className="flex flex-col gap-5">
      {isOrganizer && overdueCount > 0 && (
        <p className="rounded-none border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <strong>{overdueCount} fixture{overdueCount === 1 ? " is" : "s are"} past {overdueCount === 1 ? "its" : "their"} matchday deadline.</strong> Give the players a nudge, or settle them below so the table can finish.
        </p>
      )}
      {matchdays.map((key) => {
        const list = view.matches.filter((m) => (key === "decider" ? m.decider : !m.decider && String(m.round) === key));
        const deadline = key === "decider" ? null : view.deadlines[Number(key) - 1];
        return (
          <section key={key} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-eyebrow text-muted">{key === "decider" ? "Decider: tie for first" : `Matchday ${key}${view.legs === 2 ? (Number(key) > view.totalRounds / 2 ? " · second leg" : " · first leg") : ""}`}</h3>
              {deadline && (
                <span className="flex items-center gap-1 text-xs text-muted">
                  <CalendarClock size={12} /> Play by {dueLabel(deadline)}
                </span>
              )}
            </div>
            {list.map((m) => {
              const status = matchStatusInfo(m.status);
              const mine = m.playerAId === viewerId || m.playerBId === viewerId;
              const late = overdue(m);
              return (
                <div key={m.id} className="flex flex-col gap-2">
                  <Link href={`${matchHrefBase}/${m.id}`} className={`card-row flex items-center justify-between gap-3 p-3 ${mine ? "border-accent-volt/40" : ""}`}>
                    <span className="min-w-0 truncate text-sm">
                      <span className={m.winnerId === m.playerAId ? "font-bold" : "font-medium"}>{name(m.playerAId)}</span>
                      <span className="text-muted"> vs </span>
                      <span className={m.winnerId === m.playerBId ? "font-bold" : "font-medium"}>{name(m.playerBId)}</span>
                      {m.score && <span className="ml-2 font-mono text-xs text-muted">{m.score}{m.draw ? " · draw" : ""}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {late && <span className="badge badge-danger">Overdue</span>}
                      <StatusPill tone={status.tone} pulse={status.pulse}>
                        {status.label}
                      </StatusPill>
                    </span>
                  </Link>
                  {isOrganizer && late && (
                    <div className="flex justify-end">
                      <AwardResultButton
                        matchId={m.id}
                        playerA={{ id: m.playerAId, name: name(m.playerAId) }}
                        playerB={{ id: m.playerBId, name: name(m.playerBId) }}
                        drawAllowed={draws}
                      />
                    </div>
                  )}
                </div>
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
          Everyone plays everyone {view.legs === 2 ? "twice (home and away)" : "once"}: {regular.length} matches over {view.totalRounds} matchdays. Each matchday has a play-by date; play your fixture any
          time before then. Every match is ready-up, report and proof like any Circuit match, with disputes going to the organiser, then Circuit staff.
        </p>
        <p className="text-sm text-muted">
          {rules.winPoints} point{rules.winPoints === 1 ? "" : "s"} for a win{draws ? `, ${rules.drawPoints} for a draw` : ". Draws aren't possible in this league"}, 0 for a loss. The {unit.toLowerCase()} on
          top of the table when every match is done takes it. If a fixture isn&apos;t played by its deadline, the organiser can settle it so the table can finish.
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
    { key: "standings", label: "Table", content: standings },
    { key: "fixtures", label: `Fixtures · ${done}/${regular.length}`, content: fixtures },
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
            <h1 className="flex items-center gap-2 font-display text-3xl leading-none font-bold tracking-tight uppercase sm:text-4xl">
              League table
              <InfoTip align="start" text="Everyone plays everyone and earns points for results. The best record over the whole season wins. A bad day doesn't knock you out." />
            </h1>
            <span className="text-xs text-muted">
              {tournament.game} · League{view.legs === 2 ? " (home and away)" : ""} · {tournament.teamSize} · {view.entries.length} {unit.toLowerCase()}s · {view.totalRounds} matchdays
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <TournamentTabs tabs={tabs} trailing={shareUrl ? <ShareButton key="share" title={`${tournament.name} league table on Circuit`} url={shareUrl} /> : undefined} />

        <aside className="flex h-fit flex-col gap-4 lg:sticky lg:top-[76px]">
          <section className={`card flex flex-col items-center gap-2 p-6 text-center ${champion ? "border-gold/40" : ""}`}>
            <span className="text-eyebrow text-gold">{champion ? "Champion" : "Leader"}</span>
            <span className="font-display text-2xl font-bold tracking-tight uppercase">{headline?.name ?? (tiedOnTop > 1 ? `${tiedOnTop}-way tie` : "TBD")}</span>
            {headline && <span className="text-xs text-muted">@{headline.handle}</span>}
            <p className="text-xs text-muted">
              {champion
                ? view.decider
                  ? "Won the decider after finishing level on top."
                  : "Top of the table when every match was played."
                : view.decider
                  ? `${name(view.decider.playerAId)} and ${name(view.decider.playerBId)} are level on top. The decider settles it.`
                  : `${done} of ${regular.length} matches played.`}
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
              <span className="text-eyebrow text-muted">Your fixtures to play</span>
              {myOpen.map((m) => (
                <Link key={m.id} href={`${matchHrefBase}/${m.id}`} className="flex flex-col gap-0.5 text-sm font-medium hover:text-accent-volt">
                  <span className="flex items-center gap-2">
                    <Swords size={14} className="shrink-0 text-muted" />
                    <span className="truncate">vs {name(m.playerAId === viewerId ? m.playerBId : m.playerAId)}</span>
                    {m.decider && <span className="badge badge-open shrink-0">Decider</span>}
                    {overdue(m) && <span className="badge badge-danger shrink-0">Overdue</span>}
                  </span>
                  {m.deadline && <span className="pl-6 text-xs font-normal text-muted">Matchday {m.round} · play by {dueLabel(m.deadline)}</span>}
                </Link>
              ))}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
