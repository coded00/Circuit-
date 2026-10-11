import { describe, expect, it } from "vitest";
import { channelName, detectPlatform, modeAllowsPlayerStreams, modeHasTournamentStream, parseStream, platformDisplayName, resolveTournamentStream, streamSummary } from "@/lib/streams";

describe("parseStream", () => {
  it("accepts a channel on the platform that was chosen", () => {
    expect(parseStream({ platform: "TWITCH", url: "https://www.twitch.tv/some_player" })).toMatchObject({ ok: true, stream: { platform: "TWITCH", url: "https://www.twitch.tv/some_player" } });
    expect(parseStream({ platform: "YOUTUBE", url: "https://youtube.com/@player/live" })).toMatchObject({ ok: true, stream: { platform: "YOUTUBE" } });
    expect(parseStream({ platform: "KICK", url: "https://kick.com/player" })).toMatchObject({ ok: true, stream: { platform: "KICK" } });
  });
  it("won't let a platform label sit on someone else's address", () => {
    expect(parseStream({ platform: "TWITCH", url: "https://twitch.tv.evil.example/x" })).toMatchObject({ ok: false });
    expect(parseStream({ platform: "KICK", url: "https://twitch.tv/player" })).toMatchObject({ ok: false, error: expect.stringContaining("Kick") });
  });
  it("only takes https addresses with no embedded login", () => {
    for (const url of ["http://twitch.tv/x", "javascript:alert(1)", "data:text/html,hi", "https://user:pass@twitch.tv/x", "twitch.tv/x", "ftp://twitch.tv/x"]) {
      expect(parseStream({ platform: "TWITCH", url })).toMatchObject({ ok: false });
    }
  });
  it("needs a platform name for Other, and treats an empty address as no stream", () => {
    expect(parseStream({ platform: "OTHER", url: "https://stream.example/live" })).toMatchObject({ ok: false });
    expect(parseStream({ platform: "OTHER", platformName: "Rumble", url: "https://rumble.com/c/player" })).toMatchObject({ ok: true, stream: { platform: "OTHER", platformName: "Rumble" } });
    expect(parseStream({ platform: "OTHER", platformName: "<b>x</b>", url: "https://rumble.com/c/p" })).toMatchObject({ ok: false });
    expect(parseStream({ platform: "TWITCH", url: "" })).toEqual({ ok: true, stream: null });
    expect(parseStream({})).toEqual({ ok: true, stream: null });
  });
  it("works out the platform when it isn't given, and rejects one that isn't offered", () => {
    expect(parseStream({ url: "https://kick.com/player" })).toMatchObject({ ok: true, stream: { platform: "KICK" } });
    expect(parseStream({ platform: "CIRCUIT", url: "https://circuit.example/live" })).toMatchObject({ ok: false });
  });
});

describe("describing a stream", () => {
  it("names the platform and the channel", () => {
    expect(detectPlatform("https://youtu.be/abc")).toBe("YOUTUBE");
    expect(detectPlatform("https://rumble.com/x")).toBe("OTHER");
    expect(channelName("TWITCH", "https://twitch.tv/some_player/videos")).toBe("some_player");
    expect(channelName("YOUTUBE", "https://youtube.com/@player/live")).toBe("@player");
    expect(channelName("YOUTUBE", "https://youtube.com/channel/UC123")).toBe("UC123");
    expect(channelName("YOUTUBE", "https://youtu.be/abc")).toBeNull();
    expect(platformDisplayName("OTHER", "Rumble")).toBe("Rumble");
    expect(streamSummary("KICK", null, "https://kick.com/player")).toBe("Kick · player");
    expect(streamSummary("YOUTUBE", null, "https://youtu.be/abc")).toBe("YouTube");
  });
});

describe("stream modes", () => {
  it("say who may stream", () => {
    expect([modeHasTournamentStream("TOURNAMENT_AND_PLAYERS"), modeHasTournamentStream("TOURNAMENT_ONLY"), modeHasTournamentStream("PLAYERS_ONLY"), modeHasTournamentStream("NONE")]).toEqual([true, true, false, false]);
    expect([modeAllowsPlayerStreams("TOURNAMENT_AND_PLAYERS"), modeAllowsPlayerStreams("TOURNAMENT_ONLY"), modeAllowsPlayerStreams("PLAYERS_ONLY"), modeAllowsPlayerStreams("NONE")]).toEqual([true, false, true, false]);
  });
});

describe("resolveTournamentStream", () => {
  it("keeps the main stream for modes that have one and clears it for the others", () => {
    const body = { streamPlatform: "TWITCH", streamUrl: "https://twitch.tv/cup" };
    expect(resolveTournamentStream({ ...body, streamMode: "TOURNAMENT_AND_PLAYERS" })).toMatchObject({ ok: true, data: { streamMode: "TOURNAMENT_AND_PLAYERS", streamPlatform: "TWITCH", streamUrl: "https://twitch.tv/cup" } });
    expect(resolveTournamentStream({ ...body, streamMode: "PLAYERS_ONLY" })).toEqual({ ok: true, data: { streamMode: "PLAYERS_ONLY", streamUrl: null, streamPlatform: null, streamPlatformName: null } });
    expect(resolveTournamentStream({ ...body, streamMode: "NONE" })).toMatchObject({ ok: true, data: { streamUrl: null } });
  });
  it("lets the address be added later", () => {
    expect(resolveTournamentStream({ streamMode: "TOURNAMENT_ONLY" })).toMatchObject({ ok: true, data: { streamMode: "TOURNAMENT_ONLY", streamUrl: null } });
  });
  it("still understands a request that only sends an address", () => {
    expect(resolveTournamentStream({ streamUrl: "https://kick.com/cup" })).toMatchObject({ ok: true, data: { streamMode: "TOURNAMENT_ONLY", streamPlatform: "KICK" } });
    expect(resolveTournamentStream({})).toMatchObject({ ok: true, data: { streamMode: "NONE" } });
    expect(resolveTournamentStream({}, "PLAYERS_ONLY")).toMatchObject({ ok: true, data: { streamMode: "PLAYERS_ONLY" } }); // an edit that doesn't touch streaming
  });
  it("rejects a bad mode or a bad address", () => {
    expect(resolveTournamentStream({ streamMode: "EVERYONE" })).toMatchObject({ ok: false });
    expect(resolveTournamentStream({ streamMode: "TOURNAMENT_ONLY", streamPlatform: "TWITCH", streamUrl: "https://example.com/x" })).toMatchObject({ ok: false });
  });
});
