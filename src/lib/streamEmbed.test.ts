import { describe, expect, it } from "vitest";
import { embedFor } from "@/lib/streamEmbed";

const HOST = "circuit.example.com";

describe("embedFor", () => {
  it("builds a Twitch player from the channel, parented to this site", () => {
    expect(embedFor("TWITCH", "https://www.twitch.tv/lagos_masters/videos?x=1", HOST)?.src).toBe("https://player.twitch.tv/?channel=lagos_masters&parent=circuit.example.com&autoplay=true&muted=true");
    expect(embedFor("TWITCH", "https://twitch.tv/videos/123", HOST)).toBeNull(); // a page, not a channel
    expect(embedFor("TWITCH", "https://twitch.tv/ab", HOST)).toBeNull(); // too short to be a channel
    expect(embedFor("TWITCH", "https://twitch.tv/player", "evil host/x")).toBeNull(); // the parent must be a plain hostname
  });
  it("builds a Kick player from the channel", () => {
    expect(embedFor("KICK", "https://kick.com/player_two", HOST)?.src).toBe("https://player.kick.com/player_two?autoplay=true&muted=true");
  });
  it("embeds a YouTube video or a channel's live stream, but not an @handle", () => {
    expect(embedFor("YOUTUBE", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", HOST)?.src).toContain("/embed/dQw4w9WgXcQ");
    expect(embedFor("YOUTUBE", "https://youtu.be/dQw4w9WgXcQ", HOST)?.src).toContain("/embed/dQw4w9WgXcQ");
    expect(embedFor("YOUTUBE", "https://youtube.com/live/dQw4w9WgXcQ", HOST)?.src).toContain("/embed/dQw4w9WgXcQ");
    expect(embedFor("YOUTUBE", "https://youtube.com/channel/UCabcdefghijklmnopqrstuv", HOST)?.src).toContain("live_stream?channel=UCabcdefghijklmnopqrstuv");
    expect(embedFor("YOUTUBE", "https://youtube.com/@player/live", HOST)).toBeNull();
  });
  it("only ever produces addresses on the platforms' own player hosts, whatever the link says", () => {
    const attempts: [Parameters<typeof embedFor>[0], string][] = [
      ["TWITCH", "https://twitch.tv/player\"onload=\"alert(1)"],
      ["TWITCH", "https://twitch.tv.evil.example/player"],
      ["KICK", "https://kick.com/../../evil"],
      ["YOUTUBE", "https://youtube.com/watch?v=\"><script>"],
      ["YOUTUBE", "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ"],
      ["OTHER", "https://rumble.com/c/player"],
      ["TWITCH", "http://twitch.tv/player"],
      ["TWITCH", "javascript:alert(1)"],
    ];
    for (const [platform, url] of attempts) {
      const e = embedFor(platform, url, HOST);
      if (e) expect(e.src).toMatch(/^https:\/\/(player\.twitch\.tv|player\.kick\.com|www\.youtube\.com)\//);
      if (e) expect(e.src).not.toMatch(/["'<>\s]/);
    }
    expect(embedFor("OTHER", "https://rumble.com/c/player", HOST)).toBeNull();
    expect(embedFor("TWITCH", "http://twitch.tv/player", HOST)).toBeNull();
  });
});
