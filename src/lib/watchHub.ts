/**
 * Circuit — what Circuit Watch shows for a tournament: its channels and the matches being played.
 *
 * A channel is one stream a viewer can switch to without leaving the page: CH 01 is the tournament's main stage (if
 * it has one), and every player who added a stream gets a channel of their own. Players who are in a match right now
 * come first, so the first channels after the main stage are the matches being played. Circuit doesn't care where a
 * stream is hosted; each channel carries its platform, and an embed address when the platform can be embedded here.
 */
import type { StreamPlatform } from "@prisma/client";
import { prisma } from "@/lib/db";
import { teamEntryLabels } from "@/lib/teamEntries";
import { modeAllowsPlayerStreams, modeHasTournamentStream } from "@/lib/streams";
import { embedFor, type Embed } from "@/lib/streamEmbed";

const MAX_CHANNELS = 12;

export type WatchChannel = {
  id: string;
  number: number;
  kind: "MAIN" | "PLAYER";
  title: string;
  /** For a player: who they're playing right now, if anyone. */
  subtitle: string | null;
  platform: StreamPlatform | null;
  platformName: string | null;
  url: string;
  embed: Embed | null;
  /** The match this channel is playing, for the info panel. */
  matchId: string | null;
};

export type WatchMatch = {
  id: string;
  label: string;
  status: "UPCOMING" | "NEEDS_RESULT" | "DISPUTED";
  a: { name: string; channelId: string | null };
  b: { name: string; channelId: string | null };
};

export type WatchHub = {
  tournament: { id: string; name: string; game: string; status: string };
  channels: WatchChannel[];
  matches: WatchMatch[];
};

export async function loadWatchHub(tournamentId: string, parentHost: string): Promise<WatchHub | null> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, name: true, game: true, status: true, streamMode: true, streamUrl: true, streamPlatform: true, streamPlatformName: true },
  });
  if (!tournament || tournament.status === "DRAFT") return null;

  const [registrations, activeMatches, labels] = await Promise.all([
    modeAllowsPlayerStreams(tournament.streamMode)
      ? prisma.registration.findMany({
          where: { tournamentId, status: "CONFIRMED", streamUrl: { not: null } },
          orderBy: { createdAt: "asc" },
          select: { userId: true, streamPlatform: true, streamPlatformName: true, streamUrl: true, user: { select: { displayName: true } } },
        })
      : Promise.resolve([]),
    prisma.match.findMany({
      where: { tournamentId, status: { in: ["UPCOMING", "NEEDS_RESULT", "DISPUTED"] } },
      orderBy: [{ round: "asc" }, { createdAt: "asc" }],
      take: 24,
      select: { id: true, round: true, status: true, playerAId: true, playerBId: true, playerA: { select: { displayName: true } }, playerB: { select: { displayName: true } } },
    }),
    teamEntryLabels(tournamentId),
  ]);

  const nameOf = (userId: string, fallback: string) => labels.get(userId)?.teamName ?? fallback;
  const matchOfPlayer = new Map<string, (typeof activeMatches)[number]>();
  for (const m of activeMatches) {
    if (!matchOfPlayer.has(m.playerAId)) matchOfPlayer.set(m.playerAId, m);
    if (!matchOfPlayer.has(m.playerBId)) matchOfPlayer.set(m.playerBId, m);
  }

  // Players in a match come first, in the order their matches are played; the rest keep their registration order.
  const withStream = registrations.filter((r) => r.streamUrl);
  const playing = withStream.filter((r) => matchOfPlayer.has(r.userId)).sort((x, y) => (matchOfPlayer.get(x.userId)!.round ?? 0) - (matchOfPlayer.get(y.userId)!.round ?? 0));
  const idle = withStream.filter((r) => !matchOfPlayer.has(r.userId));

  const channels: WatchChannel[] = [];
  if (modeHasTournamentStream(tournament.streamMode) && tournament.streamUrl) {
    channels.push({
      id: "main",
      number: 1,
      kind: "MAIN",
      title: "Main stage",
      subtitle: "Official broadcast",
      platform: tournament.streamPlatform,
      platformName: tournament.streamPlatformName,
      url: tournament.streamUrl,
      embed: embedFor(tournament.streamPlatform, tournament.streamUrl, parentHost),
      matchId: null,
    });
  }
  for (const r of [...playing, ...idle]) {
    if (channels.length >= MAX_CHANNELS) break;
    const match = matchOfPlayer.get(r.userId);
    const opponent = match ? (match.playerAId === r.userId ? nameOf(match.playerBId, match.playerB.displayName) : nameOf(match.playerAId, match.playerA.displayName)) : null;
    channels.push({
      id: `p-${r.userId}`,
      number: channels.length + 1,
      kind: "PLAYER",
      title: nameOf(r.userId, r.user.displayName),
      subtitle: opponent && match ? `vs ${opponent} · Round ${match.round ?? "?"}` : null,
      platform: r.streamPlatform,
      platformName: r.streamPlatformName,
      url: r.streamUrl!,
      embed: embedFor(r.streamPlatform, r.streamUrl!, parentHost),
      matchId: match?.id ?? null,
    });
  }

  const channelOfPlayer = (userId: string) => channels.find((c) => c.id === `p-${userId}`)?.id ?? null;
  const matches: WatchMatch[] = activeMatches.slice(0, 12).map((m) => ({
    id: m.id,
    label: `Round ${m.round ?? "?"}`,
    status: m.status as WatchMatch["status"],
    a: { name: nameOf(m.playerAId, m.playerA.displayName), channelId: channelOfPlayer(m.playerAId) },
    b: { name: nameOf(m.playerBId, m.playerB.displayName), channelId: channelOfPlayer(m.playerBId) },
  }));

  return { tournament: { id: tournament.id, name: tournament.name, game: tournament.game, status: tournament.status }, channels, matches };
}
