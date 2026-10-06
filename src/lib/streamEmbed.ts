/**
 * Circuit — turning a stream's channel address into something that can play inside Circuit Watch.
 *
 * The player's address is always BUILT from a channel name or video id that has passed a strict pattern, on a fixed
 * player host. The address a person typed is never used as an iframe source: a stream link can say anything, so
 * only the validated part of it is carried over. An address that can't be embedded (an unknown platform, a YouTube
 * @handle, which YouTube won't embed) returns null and Watch offers an "Open on <platform>" link instead.
 */
import type { StreamPlatform } from "@prisma/client";

const TWITCH_CHANNEL = /^[A-Za-z0-9_]{3,25}$/;
const KICK_CHANNEL = /^[A-Za-z0-9_-]{3,25}$/;
const YOUTUBE_VIDEO = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
/** Twitch's `parent` is the domain of the page showing the player: a hostname and nothing else. */
const HOSTNAME = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i;
/** Twitch paths that are pages, not channels. */
const TWITCH_RESERVED = new Set(["videos", "directory", "downloads", "jobs", "turbo", "settings", "subscriptions", "wallet", "p", "popout", "embed"]);

export type Embed = { src: string; title: string };

/**
 * `parentHost` is the hostname Circuit is being served from ("circuit.eduvrse.co", "localhost"); Twitch refuses to
 * play on a page whose domain isn't named as the parent.
 */
export function embedFor(platform: StreamPlatform | null, url: string, parentHost: string): Embed | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  const parts = parsed.pathname.split("/").filter(Boolean);

  if (platform === "TWITCH" && host === "twitch.tv") {
    const channel = parts[0];
    if (!channel || TWITCH_RESERVED.has(channel.toLowerCase()) || !TWITCH_CHANNEL.test(channel)) return null;
    if (!HOSTNAME.test(parentHost)) return null;
    return { src: `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(parentHost)}&autoplay=true&muted=true`, title: `${channel} on Twitch` };
  }

  if (platform === "KICK" && host === "kick.com") {
    const channel = parts[0];
    if (!channel || !KICK_CHANNEL.test(channel)) return null;
    return { src: `https://player.kick.com/${encodeURIComponent(channel)}?autoplay=true&muted=true`, title: `${channel} on Kick` };
  }

  if (platform === "YOUTUBE") {
    let videoId: string | undefined;
    if (host === "youtu.be") videoId = parts[0];
    else if (host === "youtube.com") {
      if (parts[0] === "watch") videoId = parsed.searchParams.get("v") ?? undefined;
      else if (parts[0] === "live" || parts[0] === "embed" || parts[0] === "shorts") videoId = parts[1];
      else if (parts[0] === "channel" && parts[1] && YOUTUBE_CHANNEL_ID.test(parts[1])) {
        // A channel's current live stream.
        return { src: `https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(parts[1])}&autoplay=1&mute=1`, title: "Live on YouTube" };
      }
    }
    if (videoId && YOUTUBE_VIDEO.test(videoId)) return { src: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&mute=1`, title: "Live on YouTube" };
    return null;
  }

  return null;
}

/**
 * What to ask a platform's API about to learn whether a stream is live: a Twitch channel login, or a YouTube video
 * id. Only values that passed the same strict patterns as the embeds are returned. Kick and YouTube channel
 * addresses have no cheap, key-free way to be checked, so they return null and show no live status.
 */
export type StatusTarget = { platform: "TWITCH" | "YOUTUBE"; id: string };

export function statusTargetFor(platform: StreamPlatform | null, url: string): StatusTarget | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (platform === "TWITCH" && host === "twitch.tv") {
    const channel = parts[0];
    if (!channel || TWITCH_RESERVED.has(channel.toLowerCase()) || !TWITCH_CHANNEL.test(channel)) return null;
    return { platform: "TWITCH", id: channel.toLowerCase() };
  }
  if (platform === "YOUTUBE") {
    let videoId: string | undefined;
    if (host === "youtu.be") videoId = parts[0];
    else if (host === "youtube.com") {
      if (parts[0] === "watch") videoId = parsed.searchParams.get("v") ?? undefined;
      else if (parts[0] === "live" || parts[0] === "embed") videoId = parts[1];
    }
    if (videoId && YOUTUBE_VIDEO.test(videoId)) return { platform: "YOUTUBE", id: videoId };
  }
  return null;
}
