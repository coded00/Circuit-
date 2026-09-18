// Circuit Video Feed — YouTube ingestion (Phase 3).
//
// Pulls the latest short-form uploads from the curated channel list below
// (kept in sync with src/lib/youtube-channels.ts — duplicated here in
// plain JS the same way scripts/seed-videos.mjs duplicates slugify(),
// since this script runs directly under `node`, not through Next's TS
// pipeline) and inserts them as `Video` rows with `source: "YOUTUBE"`.
//
// Every ingested row lands as `status: "DRAFT"` — nothing from YouTube
// reaches the public feed until an admin explicitly publishes it (the
// product spec is explicit that admin controls which external content
// appears; there's no admin UI for this yet, so for now that means
// flipping the row to PUBLISHED directly, e.g. via Prisma Studio).
//
// Requires YOUTUBE_API_KEY in the environment. Safe to re-run: videos
// already ingested (matched by sourceUrl) are skipped, not duplicated.
//
// Run: node scripts/ingest-youtube.mjs

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const API_BASE = "https://www.googleapis.com/youtube/v3";
const MAX_SHORT_SECONDS = 180; // YouTube's current Shorts ceiling (raised from 60s)
const MAX_PER_CHANNEL = 25;

const YOUTUBE_CHANNELS = [
  { name: "Gameranx", handleOrId: "@gameranxTV" },
  { name: "IGN", handleOrId: "@IGN" },
  { name: "GameSpot", handleOrId: "@gamespot" },
  { name: "Spawn Wave", handleOrId: "@SpawnWave" },
  { name: "Chuster", handleOrId: "UCKEiTu4t6o2Y9hnqOS-GUgw" },
  { name: "Daily Dose of Gaming", handleOrId: "@Daily.Dose.Of.Gaming." },
  { name: "Highlight Reel", handleOrId: "@HighlightReel" },
  { name: "The Game Awards", handleOrId: "@thegameawards" },
  { name: "PlayStation", handleOrId: "@PlayStation" },
  { name: "Xbox", handleOrId: "@xbox" },
];

function apiKey() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    console.error("YOUTUBE_API_KEY is not set. Add it to .env and try again.");
    process.exit(1);
  }
  return key;
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube API request failed (${res.status}): ${body.slice(0, 500)}`);
  }
  return res.json();
}

function parseIsoDuration(iso) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || "");
  if (!match) return 0;
  const [, h, m, s] = match;
  return (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0);
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function getUploadsPlaylistId(handleOrId, key) {
  const isRawId = handleOrId.startsWith("UC");
  const param = isRawId ? `id=${encodeURIComponent(handleOrId)}` : `forHandle=${encodeURIComponent(handleOrId.replace(/^@/, ""))}`;
  const data = await getJson(`${API_BASE}/channels?part=contentDetails&${param}&key=${key}`);
  return data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;
}

async function listRecentShorts(playlistId, key, maxResults) {
  const playlistData = await getJson(
    `${API_BASE}/playlistItems?part=contentDetails&playlistId=${encodeURIComponent(playlistId)}&maxResults=${maxResults}&key=${key}`
  );
  const videoIds = (playlistData.items ?? []).map((i) => i.contentDetails?.videoId).filter(Boolean);
  if (videoIds.length === 0) return [];

  const videoData = await getJson(`${API_BASE}/videos?part=snippet,contentDetails&id=${videoIds.join(",")}&key=${key}`);
  return (videoData.items ?? [])
    .map((item) => ({
      videoId: item.id,
      title: item.snippet?.title ?? "Untitled",
      description: item.snippet?.description ?? "",
      thumbnailUrl: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
      publishedAt: item.snippet?.publishedAt ?? new Date().toISOString(),
      durationSeconds: parseIsoDuration(item.contentDetails?.duration),
    }))
    .filter((v) => v.durationSeconds > 0 && v.durationSeconds <= MAX_SHORT_SECONDS);
}

async function main() {
  const key = apiKey();
  let created = 0;
  let skipped = 0;

  for (const channel of YOUTUBE_CHANNELS) {
    console.log(`\n${channel.name} (${channel.handleOrId})`);
    let playlistId;
    try {
      playlistId = await getUploadsPlaylistId(channel.handleOrId, key);
    } catch (err) {
      console.error(`  channel lookup failed: ${err.message}`);
      continue;
    }
    if (!playlistId) {
      console.error("  could not resolve uploads playlist — check the handle/id");
      continue;
    }

    let shorts;
    try {
      shorts = await listRecentShorts(playlistId, key, MAX_PER_CHANNEL);
    } catch (err) {
      console.error(`  video list failed: ${err.message}`);
      continue;
    }
    console.log(`  ${shorts.length} short(s) found`);

    for (const short of shorts) {
      const sourceUrl = `https://www.youtube.com/shorts/${short.videoId}`;
      const existing = await prisma.video.findFirst({ where: { sourceUrl } });
      if (existing) {
        skipped += 1;
        continue;
      }

      const base = slugify(short.title) || short.videoId;
      const slugTaken = await prisma.video.findUnique({ where: { slug: base } });
      const slug = slugTaken ? `${base}-${short.videoId.slice(0, 6).toLowerCase()}` : base;

      await prisma.video.create({
        data: {
          slug,
          source: "YOUTUBE",
          title: short.title,
          description: short.description.slice(0, 500) || null,
          thumbnailUrl: short.thumbnailUrl,
          sourceUrl,
          sourceAuthor: channel.name,
          status: "DRAFT",
          publishedAt: new Date(short.publishedAt),
        },
      });
      created += 1;
    }
  }

  console.log(`\nDone. Created ${created}, skipped ${skipped} already-ingested.`);
  console.log("All new rows are status: DRAFT — publish the ones you want live before they show in the feed.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
