/**
 * Circuit Video Feed — importing clips from the curated YouTube channels
 * (src/lib/youtube-channels.ts). Every import lands as DRAFT: staff
 * choose what goes live from Admin → Content (the product rule is that
 * Circuit controls which external content appears). Re-running is safe —
 * videos are matched by their YouTube URL and skipped if already imported.
 *
 * A clip is tagged with a catalog game when its title names one, so the
 * feed's Games tab and "Following" (favourite games) can use it.
 */

import { prisma } from "@/lib/db";
import { slugify } from "@/lib/seo";
import { getUploadsPlaylistId, listRecentShorts, youtubeWatchUrl } from "@/lib/youtube";
import { YOUTUBE_CHANNELS } from "@/lib/youtube-channels";

const MAX_PER_CHANNEL = 25;

export type IngestResult = { created: number; skipped: number; failedChannels: string[] };

export async function ingestYouTubeShorts(): Promise<IngestResult> {
  if (!process.env.YOUTUBE_API_KEY) throw new Error("YOUTUBE_API_KEY is not set.");
  const games = await prisma.game.findMany({ where: { enabled: true }, select: { name: true } });
  // Longest names first, so "EA FC 26" wins over a shorter overlapping name.
  const gameNames = games.map((g) => g.name).sort((a, b) => b.length - a.length);
  const guessGame = (title: string) => gameNames.find((name) => title.toLowerCase().includes(name.toLowerCase())) ?? null;

  const result: IngestResult = { created: 0, skipped: 0, failedChannels: [] };
  const perChannel = await Promise.all(
    YOUTUBE_CHANNELS.map(async (channel) => {
      try {
        const playlistId = await getUploadsPlaylistId(channel.handleOrId);
        if (!playlistId) throw new Error("no uploads playlist");
        return { channel, shorts: await listRecentShorts(playlistId, MAX_PER_CHANNEL) };
      } catch {
        result.failedChannels.push(channel.name);
        return { channel, shorts: [] };
      }
    })
  );

  const all = perChannel.flatMap(({ channel, shorts }) => shorts.map((s) => ({ ...s, author: channel.name, sourceUrl: youtubeWatchUrl(s.videoId) })));
  const existing = new Set(
    (await prisma.video.findMany({ where: { sourceUrl: { in: all.map((s) => s.sourceUrl) } }, select: { sourceUrl: true } })).map((v) => v.sourceUrl)
  );
  for (const short of all) {
    if (existing.has(short.sourceUrl)) {
      result.skipped++;
      continue;
    }
    const base = slugify(short.title).slice(0, 60) || short.videoId.toLowerCase();
    const taken = await prisma.video.findUnique({ where: { slug: base }, select: { id: true } });
    await prisma.video.create({
      data: {
        slug: taken ? `${base}-${short.videoId.slice(0, 6).toLowerCase()}` : base,
        source: "YOUTUBE",
        title: short.title.slice(0, 200),
        description: short.description.slice(0, 500) || null,
        thumbnailUrl: short.thumbnailUrl,
        sourceUrl: short.sourceUrl,
        sourceAuthor: short.author,
        game: guessGame(short.title),
        status: "DRAFT",
        publishedAt: new Date(short.publishedAt),
      },
    });
    existing.add(short.sourceUrl);
    result.created++;
  }
  return result;
}
