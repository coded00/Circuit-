/**
 * Circuit — the standings page of a lobby (battle royale) tournament:
 * leaderboard, rounds with posted results and flags, and the scoring
 * table. Shown at /tournaments/[id]/bracket in place of a bracket (and
 * on the admin bracket page). Data comes from loadLobby (src/lib/lobby.ts).
 *
 * Flags are only shown in full to the organizer, staff and the player
 * who raised them; everyone else sees that a round is under review.
 */

import Link from "next/link";
import { ArrowLeft, Crosshair, Crown, ImageIcon, Pencil } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { ShareButton } from "@/components/ShareButton";
import { StatusPill, type StatusTone } from "@/components/StatusPill";
import { describePoints } from "@/lib/lobbyScoring";
import { FLAG_ANSWER_HOURS, finaliseBlocker, type LobbyEntry, type LobbyFlagView, type LobbyView } from "@/lib/lobby";
import TournamentTabs, { type TournamentTab } from "../TournamentTabs";
import { FinaliseButton, FlagAnswer, FlagRoundForm } from "./LobbyActions";

type ViewTournament = {
  id: string;
  name: string;
  game: string;
  status: string;
  teamSize: string;
  posterUrl: string | null;
  rulesText: string | null;
  lobbyRounds: number | null;
  entryType: string;
};

type Viewer = { id: string; isStaff: boolean } | null;

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

const FLAG_STATUS: Record<LobbyFlagView["status"], { tone: StatusTone; label: string }> = {
  OPEN: { tone: "attention", label: "With organizer" },
  ESCALATED: { tone: "attention", label: "With Circuit staff" },
  RESOLVED: { tone: "complete", label: "Corrected" },
  DISMISSED: { tone: "neutral", label: "Results stand" },
};

function EntryName({ entry, you }: { entry: LobbyEntry; you: boolean }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
        <span className="truncate">{entry.name}</span>
        {entry.tag && <span className="font-mono text-[11px] text-muted">[{entry.tag}]</span>}
        {you && <span className="badge badge-open shrink-0">You</span>}
      </span>
      <span className="text-metadata truncate">
        {entry.roster.length > 0 ? entry.roster.map((m) => m.displayName).join(", ") : `@${entry.handle}`}
      </span>
    </div>
  );
}

export function LobbyStandings({
  tournament,
  view,
  viewer,
  viewerInTournament,
  isManager,
  backHref,
  resultsHrefBase,
  shareUrl,
  now = new Date(),
}: {
  tournament: ViewTournament;
  view: LobbyView;
  viewer: Viewer;
  /** The viewer plays in this tournament (an entry's user or on a roster) — they can flag rounds. */
  viewerInTournament: boolean;
  /** Organizer or staff — can enter results and finalise. */
  isManager: boolean;
  backHref: string;
  /** `${resultsHrefBase}/${roundNumber}` is the results entry page. */
  resultsHrefBase: string;
  shareUrl?: string;
  now?: Date;
}) {
  const entryById = new Map(view.entries.map((e) => [e.registrationId, e]));
  const mine = new Set(
    view.entries.filter((e) => viewer && (e.userId === viewer.id)).map((e) => e.registrationId)
  );
  const posted = view.rounds.filter((r) => r.status === "POSTED");
  const live = tournament.status === "LIVE";
  const complete = tournament.status === "COMPLETE";
  const leader = view.board[0] && view.board[0].played > 0 ? entryById.get(view.board[0].registrationId) : undefined;
  const champion = view.winner;
  const topKills = [...view.board].sort((a, b) => b.kills - a.kills)[0];
  const topFragger = topKills && topKills.kills > 0 ? entryById.get(topKills.registrationId) : undefined;
  const nextRound = view.rounds.find((r) => r.status === "PENDING");
  const waitingFlags = view.rounds.flatMap((r) => r.flags).filter((f) => f.status === "OPEN" || f.status === "ESCALATED");
  const unit = tournament.entryType === "TEAM" ? "teams" : "players";

  const leaderboard = (
    <section className="card overflow-hidden p-0">
      {posted.length === 0 && (
        <p className="border-b border-border px-5 py-3 text-sm text-muted">
          {live ? "No results yet — standings fill in as each round is posted." : "Standings appear once the lobby starts."}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="text-eyebrow w-12 px-4 py-2.5 text-muted">#</th>
              <th className="text-eyebrow px-2 py-2.5 text-muted">{tournament.entryType === "TEAM" ? "Team" : "Player"}</th>
              {view.rounds.map((r) => (
                <th key={r.number} className="text-eyebrow hidden w-12 px-1 py-2.5 text-center text-muted md:table-cell" title={`Round ${r.number}`}>
                  R{r.number}
                </th>
              ))}
              <th className="text-eyebrow w-12 px-1 py-2.5 text-center text-muted" title="Rounds won">
                W
              </th>
              <th className="text-eyebrow w-14 px-1 py-2.5 text-center text-muted">Kills</th>
              <th className="text-eyebrow w-16 px-4 py-2.5 text-right text-muted">Pts</th>
            </tr>
          </thead>
          <tbody>
            {view.board.map((row) => {
              const entry = entryById.get(row.registrationId);
              if (!entry) return null;
              const isWinner = champion?.registrationId === row.registrationId;
              return (
                <tr key={row.registrationId} className={`border-b border-border last:border-b-0 ${mine.has(row.registrationId) ? "bg-accent-volt/5" : ""}`}>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted tabular-nums">
                    {isWinner ? <Crown size={15} className="text-gold" aria-label="Champion" /> : posted.length ? row.rank : "–"}
                  </td>
                  <td className="max-w-0 px-2 py-2.5">
                    <EntryName entry={entry} you={mine.has(row.registrationId)} />
                  </td>
                  {view.rounds.map((r) => {
                    const cell = row.rounds[r.number];
                    return (
                      <td key={r.number} className="hidden px-1 py-2.5 text-center font-mono text-xs tabular-nums md:table-cell" title={cell?.placement ? `${ordinal(cell.placement)} · ${cell.kills} kills` : undefined}>
                        {r.status !== "POSTED" ? <span className="text-muted-strong">·</span> : cell?.placement ? cell.points : <span className="text-muted">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-1 py-2.5 text-center font-mono text-xs tabular-nums">{row.wins || ""}</td>
                  <td className="px-1 py-2.5 text-center font-mono text-xs tabular-nums">{row.kills}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm font-bold tabular-nums">{row.total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-5 py-2.5 text-xs text-muted">
        Ties break on rounds won, then placement points, then kills, then the better place in the latest round.
      </p>
    </section>
  );

  const rounds = (
    <div className="flex flex-col gap-3">
      {view.rounds.length === 0 && <p className="card text-center text-muted">Rounds are created when registration closes.</p>}
      {view.rounds.map((round) => {
        const results = [...round.results].sort((a, b) => (a.placement ?? 999) - (b.placement ?? 999));
        const visibleFlags = round.flags.filter((f) => isManager || viewer?.isStaff || f.user.id === viewer?.id);
        const hiddenOpen = round.flags.filter((f) => !visibleFlags.includes(f) && (f.status === "OPEN" || f.status === "ESCALATED")).length;
        return (
          <section key={round.number} className="card flex flex-col gap-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <h3 className="font-display text-lg font-bold tracking-tight uppercase">Round {round.number}</h3>
                <StatusPill tone={round.status === "POSTED" ? "complete" : live ? "live" : "neutral"}>
                  {round.status === "POSTED" ? "Results posted" : live ? "Waiting for results" : "Not started"}
                </StatusPill>
              </div>
              <div className="flex items-center gap-3">
                {round.proofUrl && (
                  <a href={round.proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-blue hover:underline">
                    <ImageIcon size={13} /> Screenshot
                  </a>
                )}
                {isManager && live && (
                  <Link href={`${resultsHrefBase}/${round.number}`} className="btn-secondary h-8 px-3 text-xs">
                    <Pencil size={12} />
                    {round.status === "POSTED" ? "Edit results" : "Enter results"}
                  </Link>
                )}
              </div>
            </div>

            {round.status === "POSTED" && (
              <ol className="flex flex-col divide-y divide-border rounded-[10px] border border-border">
                {results.map((r) => {
                  const entry = entryById.get(r.registrationId);
                  if (!entry) return null;
                  return (
                    <li key={r.registrationId} className={`flex items-center gap-3 px-3 py-2 ${r.placement ? "" : "opacity-60"}`}>
                      <span className="w-9 shrink-0 font-mono text-xs font-semibold tabular-nums">{r.placement ? ordinal(r.placement) : "DNP"}</span>
                      <div className="min-w-0 flex-1">
                        <EntryName entry={entry} you={mine.has(r.registrationId)} />
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 font-mono text-xs text-muted tabular-nums">
                        <Crosshair size={12} /> {r.kills}
                      </span>
                      <span className="w-10 shrink-0 text-right font-mono text-sm font-bold tabular-nums">{r.points}</span>
                    </li>
                  );
                })}
              </ol>
            )}

            {hiddenOpen > 0 && <p className="text-xs text-muted">A player has flagged these results — they&apos;re being reviewed.</p>}
            {visibleFlags.map((flag) => {
              const status = FLAG_STATUS[flag.status];
              const canAnswer = (flag.status === "OPEN" && isManager) || (flag.status === "ESCALATED" && !!viewer?.isStaff);
              const unanswered = flag.status === "OPEN" && now.getTime() - flag.createdAt.getTime() >= FLAG_ANSWER_HOURS * 3600e3;
              const canEscalate = live && flag.user.id === viewer?.id && !flag.escalatedAt && (flag.status === "DISMISSED" || unanswered);
              return (
                <div key={flag.id} className="flex flex-col gap-2 rounded-[10px] border border-dashed border-border-strong p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted">
                      Flag from <span className="font-semibold text-foreground">{flag.user.displayName}</span> ·{" "}
                      {flag.createdAt.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                    <StatusPill tone={status.tone}>{status.label}</StatusPill>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{flag.reason}</p>
                  {flag.response && (
                    <p className="border-l-2 border-border-strong pl-3 text-sm text-muted">
                      <span className="font-semibold text-foreground">{flag.escalatedAt && flag.status !== "ESCALATED" ? "Circuit staff" : "Organizer"}:</span> {flag.response}
                    </p>
                  )}
                  {flag.status === "OPEN" && flag.user.id === viewer?.id && !unanswered && (
                    <p className="text-xs text-muted">If the organizer doesn&apos;t answer within {FLAG_ANSWER_HOURS} hours you can take it to Circuit staff.</p>
                  )}
                  <FlagAnswer flagId={flag.id} canAnswer={canAnswer} canEscalate={canEscalate} />
                </div>
              );
            })}

            {live && round.status === "POSTED" && viewerInTournament && <FlagRoundForm tournamentId={tournament.id} roundNumber={round.number} />}
          </section>
        );
      })}
    </div>
  );

  const scoring = (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-col gap-3 p-5">
        <h3 className="text-eyebrow text-muted">Points</h3>
        <div className="flex flex-wrap gap-2">
          {view.table.placementPoints.map((pts, i) => (
            <span key={i} className="flex flex-col items-center rounded-[10px] border border-border px-3 py-1.5">
              <span className="font-mono text-[11px] text-muted">{ordinal(i + 1)}</span>
              <span className="font-mono text-sm font-bold">{pts}</span>
            </span>
          ))}
          <span className="flex flex-col items-center rounded-[10px] border border-accent-blue/40 px-3 py-1.5">
            <span className="font-mono text-[11px] text-muted">Per kill</span>
            <span className="font-mono text-sm font-bold">{view.table.killPoints}</span>
          </span>
        </div>
        <p className="text-sm text-muted">
          {describePoints(view.table)}. Places below {ordinal(view.table.placementPoints.length)} score kills only; an entry that doesn&apos;t play a round scores nothing for it.
          Set for this format by Circuit, so every {tournament.game} lobby of this kind scores the same.
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
    { key: "standings", label: "Standings", content: leaderboard },
    { key: "rounds", label: `Rounds${view.rounds.length ? ` · ${posted.length}/${view.rounds.length}` : ""}`, content: rounds },
    { key: "scoring", label: "Scoring", content: scoring },
  ];
  const headline = champion ?? leader;

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
            <h1 className="font-display text-3xl leading-none font-bold tracking-tight uppercase sm:text-4xl">Standings</h1>
            <span className="text-xs text-muted">
              {tournament.game} · {tournament.teamSize} · {view.entries.length} {unit} · {view.rounds.length || tournament.lobbyRounds || 0} rounds
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <TournamentTabs tabs={tabs} trailing={shareUrl ? <ShareButton key="share" title={`${tournament.name} standings on Circuit`} url={shareUrl} /> : undefined} />

        <aside className="flex h-fit flex-col gap-4 lg:sticky lg:top-[76px]">
          <section className={`card flex flex-col items-center gap-2 p-6 text-center ${champion ? "border-gold/40" : ""}`}>
            <span className="text-eyebrow text-gold">{champion ? "Champion" : "Leader"}</span>
            <span className="font-display text-2xl font-bold tracking-tight uppercase">{headline?.name ?? "TBD"}</span>
            {headline && <span className="text-xs text-muted">@{headline.handle}</span>}
            {headline && (
              <span className="text-stat text-sm text-gold">{view.board.find((r) => r.registrationId === headline.registrationId)?.total ?? 0} pts</span>
            )}
            <p className="text-xs text-muted">
              {champion
                ? "Top of the leaderboard when results were finalised."
                : complete
                  ? "Results are final."
                  : `Decided after ${view.rounds.length || tournament.lobbyRounds || "all"} rounds, once the organizer finalises.`}
            </p>
          </section>

          {topFragger && (
            <section className="card flex items-center gap-3 p-4">
              <Crosshair size={22} className="shrink-0 text-accent-blue" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-eyebrow text-accent-blue">Most kills</span>
                <span className="truncate text-sm font-semibold">{topFragger.name}</span>
                <span className="text-stat text-xs text-muted">{topKills.kills} kills</span>
              </div>
            </section>
          )}

          {isManager && live && (
            <section className="card flex flex-col gap-3 p-4">
              <span className="text-eyebrow text-muted">Organizer</span>
              {nextRound ? (
                <Link href={`${resultsHrefBase}/${nextRound.number}`} className="btn-secondary h-10 text-sm">
                  <Pencil size={14} /> Enter round {nextRound.number} results
                </Link>
              ) : (
                <p className="text-sm text-muted">All {view.rounds.length} rounds are posted.</p>
              )}
              {waitingFlags.length > 0 && (
                <p className="text-sm text-danger">
                  {waitingFlags.length} flag{waitingFlags.length === 1 ? "" : "s"} waiting — see the Rounds tab.
                </p>
              )}
              <FinaliseButton tournamentId={tournament.id} blocker={finaliseBlocker(view, now)} />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
