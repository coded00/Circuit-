/**
 * Circuit — dynamic XML sitemap. Real public content only: the handful of
 * static discovery routes, every real game (/games/[slug], gated the same
 * way the page itself is — see lib/games.ts), every organiser with a real
 * tournament (same gate as /organisers/[handle]), every genuinely public
 * (non-DRAFT, non-CANCELLED) tournament, and every open (not FRIENDS-only,
 * not cancelled) Battle. Nothing private — no /admin, /dashboard,
 * /account, /wallet, /notifications, /api — those are noindex'd at the
 * page level (see each route's own `robots` metadata) and never belong in
 * a sitemap regardless.
 *
 * A single flat file for now, not Next's generateSitemaps() chunking API —
 * tried that first, but this Next.js version calls the default export with
 * no `id` at all when generateSitemaps() returns exactly one page, which
 * isn't documented and isn't worth fighting blind. Correct and sufficient
 * at Circuit's real current + near-term tournament volume (nowhere near
 * Google's 50k-URLs-per-file limit); revisit true chunking once actual
 * tournament count approaches five figures.
 */

import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { SITE_URL, tournamentPath, battlePath, organiserPath, videoPath } from "@/lib/seo";
import { realGameNames } from "@/lib/games";
import { canonicalGamePath } from "@/lib/gameSeo";
import { isProfileIndexable } from "@/lib/profileSeo";
import { countryIsIndexable, gameCountryIsIndexable, gameIsIndexable, leaderboardIsIndexable, teamIsIndexable } from "@/lib/seoEligibility";
import { countrySlug } from "@/lib/countrySeo";
import { gameStandings } from "@/lib/standings";
import { LISTED_WHERE } from "@/lib/communityDirectory";

// Without this, Next prerenders sitemap.xml once at build time (it has no
// cookies()/headers() call to make it dynamic on its own) — a tournament
// created after that build wouldn't show up until the next deploy.
export const dynamic = "force-dynamic";

const TOURNAMENT_STATUSES = ["OPEN", "CLOSED", "LIVE", "COMPLETE"] as const;

const STATIC_ROUTES: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/compete", changeFrequency: "hourly", priority: 0.9 },
  { path: "/activity", changeFrequency: "hourly", priority: 0.6 },
  { path: "/leaderboard", changeFrequency: "daily", priority: 0.6 },
  { path: "/battles", changeFrequency: "hourly", priority: 0.7 },
  { path: "/calendar", changeFrequency: "daily", priority: 0.6 },
  { path: "/communities", changeFrequency: "daily", priority: 0.6 },
  { path: "/watch", changeFrequency: "hourly", priority: 0.6 },
  { path: "/marketplace", changeFrequency: "daily", priority: 0.5 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [tournaments, battles, gameNames, organizedByCounts, videos, communities, optedInPlayers, teams, completedForGames, countryTournamentCounts, countryPlayerCounts, gameCountryCounts] = await Promise.all([
    prisma.tournament.findMany({
      where: { status: { in: [...TOURNAMENT_STATUSES] } },
      select: { id: true, name: true, game: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.battle.findMany({
      where: { visibility: "OPEN", status: { not: "CANCELLED" } },
      select: { id: true, game: true, createdAt: true },
    }),
    realGameNames(),
    // Only organizers with >=1 real tournament get a public page — same
    // gate the page itself (organisers/[handle]/page.tsx) enforces.
    prisma.organizerProfile.findMany({
      where: { tournaments: { some: {} } },
      select: { user: { select: { handle: true } } },
    }),
    prisma.video.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true, createdAt: true },
    }),
    // Listed communities only (invite-only ones are private).
    prisma.community.findMany({ where: LISTED_WHERE, select: { slug: true, lastActivityAt: true, createdAt: true } }),
    // Players who opted in to being found on Google; the rest of the rule (adult, played) is checked below.
    prisma.user.findMany({
      where: { searchEngineIndexable: true, isSuspended: false, deletionRequestedAt: null, dateOfBirth: { not: null } },
      select: { id: true, handle: true, dateOfBirth: true, searchEngineIndexable: true, isSuspended: true, deletionRequestedAt: true },
      take: 5000,
    }),
    prisma.team.findMany({
      where: { registrations: { some: {} } },
      select: { id: true, name: true, _count: { select: { registrations: true, members: { where: { accepted: true } } } } },
      take: 5000,
    }),
    prisma.tournament.findMany({ where: { status: "COMPLETE" }, select: { game: true, _count: { select: { registrations: { where: { status: "CONFIRMED" } } } } } }),
    prisma.tournament.groupBy({ by: ["country"], where: { country: { not: null }, status: { in: [...TOURNAMENT_STATUSES] } }, _count: { _all: true } }),
    prisma.user.groupBy({ by: ["country"], where: { country: { not: null } }, _count: { _all: true } }),
    prisma.tournament.groupBy({ by: ["game", "country"], where: { country: { not: null }, status: { in: [...TOURNAMENT_STATUSES] } }, _count: { _all: true } }),
  ]);
  const playedIds = new Set(
    (
      await prisma.match.findMany({
        where: { OR: [{ playerAId: { in: optedInPlayers.map((p) => p.id) } }, { playerBId: { in: optedInPlayers.map((p) => p.id) } }] },
        select: { playerAId: true, playerBId: true },
      })
    ).flatMap((m) => [m.playerAId, m.playerBId]),
  );
  const playerEntries: MetadataRoute.Sitemap = optedInPlayers
    .filter((p) => isProfileIndexable(p, playedIds.has(p.id)))
    .map((p) => ({ url: `${SITE_URL}/players/${p.handle}`, changeFrequency: "weekly", priority: 0.4 }));

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency,
    priority,
  }));

  const battleEntries: MetadataRoute.Sitemap = battles.map((b) => ({
    url: `${SITE_URL}${battlePath(b)}`,
    lastModified: b.createdAt,
    changeFrequency: "daily",
    priority: 0.5,
  }));

  const tournamentEntries: MetadataRoute.Sitemap = tournaments.map((t) => ({
    url: `${SITE_URL}${tournamentPath(t)}`,
    lastModified: t.updatedAt,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  // A game appears once, at its canonical address, and only once it has enough activity (src/lib/seoEligibility.ts).
  const publicCountByGame = new Map<string, number>();
  for (const t of tournaments) publicCountByGame.set(t.game, (publicCountByGame.get(t.game) ?? 0) + 1);
  const bigCompletedByGame = new Map<string, number>();
  for (const t of completedForGames) if (t._count.registrations >= 8) bigCompletedByGame.set(t.game, (bigCompletedByGame.get(t.game) ?? 0) + 1);
  const indexableGames = gameNames.filter((name) => gameIsIndexable({ publicTournaments: publicCountByGame.get(name) ?? 0, completedWithEightEntrants: bigCompletedByGame.get(name) ?? 0 }));
  const gamePaths = [...new Set(await Promise.all(indexableGames.map((name) => canonicalGamePath(name))))];
  const gameEntries: MetadataRoute.Sitemap = gamePaths.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  // A game's leaderboard page, once ten players are ranked.
  const boardEntries: MetadataRoute.Sitemap = [];
  for (const name of gameNames) {
    if (!leaderboardIsIndexable((await gameStandings(name)).length)) continue;
    boardEntries.push({ url: `${SITE_URL}/leaderboard/${(await canonicalGamePath(name)).replace("/games/", "")}`, changeFrequency: "daily", priority: 0.6 });
  }

  // Country pages (and a game within a country) once there's enough real activity there.
  const playersByCountry = new Map(countryPlayerCounts.map((c) => [c.country, c._count._all]));
  const countryEntries: MetadataRoute.Sitemap = countryTournamentCounts
    .filter((c) => c.country && countryIsIndexable({ publicTournaments: c._count._all, players: playersByCountry.get(c.country) ?? 0 }))
    .map((c) => ({ url: `${SITE_URL}/countries/${countrySlug(c.country!)}`, changeFrequency: "daily", priority: 0.6 }));
  const gameCountryEntries: MetadataRoute.Sitemap = [];
  for (const row of gameCountryCounts) {
    if (!row.country || !gameCountryIsIndexable(row._count._all)) continue;
    gameCountryEntries.push({ url: `${SITE_URL}${await canonicalGamePath(row.game)}/${countrySlug(row.country)}`, changeFrequency: "daily", priority: 0.6 });
  }

  const teamEntries: MetadataRoute.Sitemap = teams
    .filter((t) => teamIsIndexable({ acceptedMembers: t._count.members, tournamentEntries: t._count.registrations }))
    .map((t) => ({ url: `${SITE_URL}/teams/${t.id}`, changeFrequency: "weekly", priority: 0.4 }));

  const organiserEntries: MetadataRoute.Sitemap = organizedByCounts.map((o) => ({
    url: `${SITE_URL}${organiserPath(o.user.handle)}`,
    changeFrequency: "weekly",
    priority: 0.4,
  }));

  const videoEntries: MetadataRoute.Sitemap = videos.map((v) => ({
    url: `${SITE_URL}${videoPath(v)}`,
    lastModified: v.createdAt,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  const communityEntries: MetadataRoute.Sitemap = communities.map((c) => ({
    url: `${SITE_URL}/communities/${c.slug}`,
    lastModified: c.lastActivityAt ?? c.createdAt,
    changeFrequency: "daily",
    priority: 0.5,
  }));

  return [...staticEntries, ...gameEntries, ...organiserEntries, ...battleEntries, ...tournamentEntries, ...videoEntries, ...communityEntries, ...playerEntries, ...boardEntries, ...teamEntries, ...countryEntries, ...gameCountryEntries];
}
