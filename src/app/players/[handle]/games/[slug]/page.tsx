/**
 * Circuit — one player's profile in one game: record, form, streaks,
 * Challenge rank, match history, tournaments and the achievements those
 * support. Everything on it is derived from confirmed results; nothing is
 * self-reported. See src/lib/playerGameProfile.ts.
 */

import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Lock } from "lucide-react";
import { prisma } from "@/lib/db";
import { getPlayerGameProfile, resolveGameSlug } from "@/lib/playerGameProfile";
import { ArenaBackdrop } from "@/components/ArenaBackdrop";
import { FormChips, RESULT_CHIP_CLASS } from "@/components/ui/FormChips";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel, PanelEmpty } from "@/components/ui/Panel";
import { StatusPill, tournamentStatusInfo } from "@/components/StatusPill";
import { tournamentPath } from "@/lib/seo";

type Params = { handle: string; slug: string };

const RESULT_LABEL = { W: "Win", L: "Loss", D: "Draw", VOID: "Void" } as const;

// One lookup per request: the page and its metadata both need it, and keying on the two
// strings (not the params object) is what lets React reuse the first answer.
const loadByName = cache(async (handle: string, slug: string) => {
  const player = await prisma.user.findUnique({ where: { handle }, select: { id: true, handle: true, displayName: true, favoriteGames: true } });
  if (!player) return null;
  const game = await resolveGameSlug(player.id, player.favoriteGames, slug);
  if (!game) return null;
  return { player, game };
});

const load = ({ handle, slug }: Params) => loadByName(handle, slug);

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const found = await load(await params);
  if (!found) return { title: "Player not found" };
  return { title: `${found.player.displayName} in ${found.game} | Circuit`, description: `${found.player.displayName}'s ${found.game} record, match history and tournaments on Circuit.` };
}

export default async function PlayerGamePage({ params }: { params: Promise<Params> }) {
  const found = await load(await params);
  if (!found) notFound();
  const { player, game } = found;
  const g = await getPlayerGameProfile(player.id, game);
  const unlocked = g.achievements.filter((a) => a.unlocked).length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <Link href={`/players/${player.handle}`} className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition hover:text-foreground">
        <ArrowLeft size={15} /> {player.displayName}
      </Link>

      <header data-surface="dark" className="relative isolate overflow-hidden rounded-[var(--radius-hero)] border border-border">
        <ArenaBackdrop game={game} art={0.6} fade="right" />
        <div className="flex flex-col gap-1.5 p-6 sm:p-9">
          <span className="text-eyebrow text-accent-volt">@{player.handle}</span>
          <h1 className="font-display text-4xl leading-none font-bold tracking-tight uppercase sm:text-5xl">{game}</h1>
          <p className="text-sm text-muted">{player.displayName}&apos;s record, from confirmed results.</p>
        </div>
        <StatStrip
          stats={[
            {
              label: "Record",
              value: (
                <>
                  <span className="text-success">{g.wins}</span>
                  <span className="px-1 text-muted">–</span>
                  <span>{g.losses}</span>
                  {g.draws > 0 && (
                    <>
                      <span className="px-1 text-muted">–</span>
                      <span className="text-muted">{g.draws}</span>
                    </>
                  )}
                </>
              ),
              sub: `${g.played} ${g.played === 1 ? "match" : "matches"}${g.draws > 0 ? " · W–L–D" : ""}`,
            },
            { label: "Win rate", value: g.winRate === null ? "—" : `${g.winRate}%`, sub: g.played === 0 ? "No matches yet" : `Best run: ${g.bestWinRun}W` },
            {
              label: "Streak",
              value: g.streak ? (
                <span className={g.streak.result === "W" ? "text-success" : "text-danger"}>
                  {g.streak.result}
                  {g.streak.count}
                </span>
              ) : (
                "—"
              ),
              sub: g.streak ? (g.streak.result === "W" ? "Winning run" : "Losing run") : "Current run",
            },
            { label: "Challenge rank", value: g.rank ? `#${g.rank}` : "—", sub: g.rank ? `in ${game}` : "Unranked" },
          ]}
        />
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          {g.form.length > 0 && (
            <Panel title="Recent form" meta={`Last ${g.form.length}`}>
              <div className="border-t border-border px-5 py-4">
                <FormChips form={g.form} size="md" />
              </div>
            </Panel>
          )}

          <Panel title="Match history" meta={g.matches.length || undefined}>
            {g.matches.length === 0 ? (
              <PanelEmpty>No confirmed {game} matches yet.</PanelEmpty>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {g.matches.map((m) => (
                  <li key={m.id}>
                    <Link href={`/matches/${m.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-elevated/60">
                      <span className={`badge ${RESULT_CHIP_CLASS[m.result]}`}>{RESULT_LABEL[m.result]}</span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">vs {m.opponent.displayName}</span>
                        <span className="text-metadata truncate">
                          {m.context}
                          {m.score ? ` · ${m.score}` : ""}
                        </span>
                      </span>
                      <time dateTime={m.at.toISOString()} className="shrink-0 text-xs text-muted" suppressHydrationWarning>
                        {m.at.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                      </time>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Panel title="Achievements" meta={`${unlocked}/${g.achievements.length}`}>
            <ul className="divide-y divide-border border-t border-border">
              {g.achievements.map((a) => (
                <li key={a.key} className="flex items-center gap-3 px-5 py-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${a.unlocked ? "bg-accent-volt text-accent-volt-foreground" : "bg-surface-elevated text-muted"}`}>
                    <span className="sr-only">{a.unlocked ? "Unlocked:" : "Locked:"}</span>
                    {a.unlocked ? <Check size={16} strokeWidth={3} aria-hidden /> : <Lock size={14} aria-hidden />}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={`truncate text-sm font-medium ${a.unlocked ? "" : "text-muted"}`}>{a.label}</span>
                    <span className="text-metadata truncate">{a.unlocked ? a.description : `${Math.min(a.current, a.target)}/${a.target} · ${a.description}`}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Tournaments" meta={g.tournaments.length || undefined}>
            {g.tournaments.length === 0 ? (
              <PanelEmpty>No {game} tournaments entered.</PanelEmpty>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {g.tournaments.map((t) => {
                  const status = tournamentStatusInfo(t.status);
                  return (
                    <li key={t.id}>
                      <Link href={tournamentPath(t)} className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-elevated/60">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.name}</span>
                        <StatusPill tone={status.tone} pulse={status.pulse}>
                          {status.label}
                        </StatusPill>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
