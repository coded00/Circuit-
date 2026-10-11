/**
 * Circuit — streaming, independent of where the video is hosted. A tournament has a stream mode (who streams: the
 * tournament, its players, both, nobody) and, when it has a main broadcast, one stream of its own; each player may
 * add their own. A stream is a platform plus a channel address, never a platform-specific handle, so Twitch,
 * YouTube, Kick and any other site are handled the same way, and a Circuit-run stream can be added later without
 * reshaping anything (StreamPlatform.CIRCUIT is reserved for that).
 *
 * The address is checked against the platform that was chosen: a link labelled "Twitch" has to be on twitch.tv,
 * so a stream label can't be used to dress up a link to somewhere else. Only https addresses are accepted.
 */
import type { StreamMode, StreamPlatform } from "@prisma/client";

/** What a person can choose today. CIRCUIT exists in the data model but is not offered yet. */
export const SELECTABLE_PLATFORMS = ["TWITCH", "YOUTUBE", "KICK", "OTHER"] as const;
export type SelectablePlatform = (typeof SELECTABLE_PLATFORMS)[number];

export const PLATFORM_LABEL: Record<StreamPlatform, string> = {
  TWITCH: "Twitch",
  YOUTUBE: "YouTube",
  KICK: "Kick",
  OTHER: "Other",
  CIRCUIT: "Circuit",
};

export const PLATFORM_PLACEHOLDER: Record<SelectablePlatform, string> = {
  TWITCH: "https://twitch.tv/yourchannel",
  YOUTUBE: "https://youtube.com/@yourchannel/live",
  KICK: "https://kick.com/yourchannel",
  OTHER: "https://…",
};

export const STREAM_MODES: { value: StreamMode; label: string; description: string; recommended?: boolean }[] = [
  {
    value: "TOURNAMENT_AND_PLAYERS",
    label: "Tournament + player streams",
    description: "A main stream for the tournament, and players can add their own channels when they register.",
    recommended: true,
  },
  { value: "TOURNAMENT_ONLY", label: "Tournament stream only", description: "One channel for the tournament's main broadcast." },
  { value: "PLAYERS_ONLY", label: "Player streams only", description: "Players can add their own channels when they register. There's no main broadcast." },
  { value: "NONE", label: "No stream", description: "This tournament won't have a livestream." },
];

export const modeHasTournamentStream = (mode: StreamMode) => mode === "TOURNAMENT_AND_PLAYERS" || mode === "TOURNAMENT_ONLY";
export const modeAllowsPlayerStreams = (mode: StreamMode) => mode === "TOURNAMENT_AND_PLAYERS" || mode === "PLAYERS_ONLY";

export function parseStreamMode(value: unknown): StreamMode | null {
  return STREAM_MODES.find((m) => m.value === value)?.value ?? null;
}

const HOSTS: Record<Exclude<SelectablePlatform, "OTHER">, string[]> = {
  TWITCH: ["twitch.tv", "www.twitch.tv", "m.twitch.tv"],
  YOUTUBE: ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"],
  KICK: ["kick.com", "www.kick.com"],
};

/** The platform an address belongs to (OTHER if it isn't one we know). */
export function detectPlatform(url: string): StreamPlatform {
  try {
    const host = new URL(url).hostname.toLowerCase();
    for (const [platform, hosts] of Object.entries(HOSTS)) if (hosts.includes(host)) return platform as StreamPlatform;
  } catch {
    /* not a URL */
  }
  return "OTHER";
}

export type ParsedStream = { platform: StreamPlatform; platformName: string | null; url: string };
export type StreamResult = { ok: true; stream: ParsedStream | null } | { ok: false; error: string };

const NAME_PATTERN = /^[\p{L}\p{N} ._-]{2,30}$/u;

/**
 * Validates one stream as typed into a form. No address means no stream (ok, null). If the platform is left out
 * it is worked out from the address, which is how a link entered before platforms existed is still understood.
 */
export function parseStream(input: { platform?: unknown; platformName?: unknown; url?: unknown }): StreamResult {
  const rawUrl = typeof input.url === "string" ? input.url.trim() : "";
  if (!rawUrl) return { ok: true, stream: null };
  if (rawUrl.length > 300) return { ok: false, error: "That channel address is too long." };

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: "Enter the channel address in full, starting with https://" };
  }
  if (parsed.protocol !== "https:") return { ok: false, error: "The channel address must start with https://" };
  if (parsed.username || parsed.password) return { ok: false, error: "That channel address isn't valid." };

  const chosen = input.platform === undefined || input.platform === null || input.platform === "" ? detectPlatform(rawUrl) : input.platform;
  if (!SELECTABLE_PLATFORMS.includes(chosen as SelectablePlatform)) return { ok: false, error: "Choose Twitch, YouTube, Kick or Other." };
  const platform = chosen as SelectablePlatform;

  if (platform !== "OTHER") {
    if (!HOSTS[platform].includes(parsed.hostname.toLowerCase())) {
      return { ok: false, error: `That doesn't look like a ${PLATFORM_LABEL[platform]} address. It should be on ${HOSTS[platform][0]}.` };
    }
    return { ok: true, stream: { platform, platformName: null, url: parsed.href } };
  }

  const name = typeof input.platformName === "string" ? input.platformName.trim() : "";
  if (!NAME_PATTERN.test(name)) return { ok: false, error: "Enter the name of your streaming platform (2 to 30 characters)." };
  return { ok: true, stream: { platform: "OTHER", platformName: name, url: parsed.href } };
}

/** "Twitch", "YouTube", or the name someone gave for Other. */
export function platformDisplayName(platform: StreamPlatform | null, platformName: string | null): string {
  if (!platform) return "Stream";
  return platform === "OTHER" ? platformName || "Stream" : PLATFORM_LABEL[platform];
}

/** The channel a stream address points at, for showing next to the platform ("yourchannel", "@yourchannel"). */
export function channelName(platform: StreamPlatform | null, url: string): string | null {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (platform === "TWITCH" || platform === "KICK") return parts[0] ?? null;
    if (platform === "YOUTUBE") {
      if (parsed.hostname === "youtu.be") return null; // a single video, not a channel
      const handle = parts.find((p) => p.startsWith("@"));
      if (handle) return handle;
      if (parts[0] === "channel" || parts[0] === "c" || parts[0] === "user") return parts[1] ?? null;
      return null;
    }
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** One line for a "Watch" button or a player's stream link: "Twitch · yourchannel". */
export function streamSummary(platform: StreamPlatform | null, platformName: string | null, url: string): string {
  const where = platformDisplayName(platform, platformName);
  const channel = channelName(platform, url);
  return channel ? `${where} · ${channel}` : where;
}

type TournamentStreamBody = { streamMode?: unknown; streamPlatform?: unknown; streamPlatformName?: unknown; streamUrl?: unknown };
export type TournamentStreamData = { streamMode: StreamMode; streamUrl: string | null; streamPlatform: StreamPlatform | null; streamPlatformName: string | null };

/**
 * Turns the stream fields of a create or edit request into what is stored. The mode decides what is kept: a mode
 * without a tournament broadcast clears the main stream. A request that only sends an address (an older form)
 * is read as "this tournament has a main stream" so it keeps working.
 */
export function resolveTournamentStream(body: TournamentStreamBody, currentMode: StreamMode | null = null): { ok: true; data: TournamentStreamData } | { ok: false; error: string } {
  const sentMode = body.streamMode === undefined ? null : parseStreamMode(body.streamMode);
  if (body.streamMode !== undefined && !sentMode) return { ok: false, error: "Choose how the tournament will be streamed." };
  const hasUrl = typeof body.streamUrl === "string" && body.streamUrl.trim() !== "";
  const mode: StreamMode = sentMode ?? (hasUrl ? (currentMode && modeHasTournamentStream(currentMode) ? currentMode : "TOURNAMENT_ONLY") : (currentMode ?? "NONE"));

  if (!modeHasTournamentStream(mode)) return { ok: true, data: { streamMode: mode, streamUrl: null, streamPlatform: null, streamPlatformName: null } };
  const parsed = parseStream({ platform: body.streamPlatform, platformName: body.streamPlatformName, url: body.streamUrl });
  if (!parsed.ok) return parsed;
  // The address can be added later: until it is, the tournament simply shows no Watch link.
  return { ok: true, data: { streamMode: mode, streamUrl: parsed.stream?.url ?? null, streamPlatform: parsed.stream?.platform ?? null, streamPlatformName: parsed.stream?.platformName ?? null } };
}
