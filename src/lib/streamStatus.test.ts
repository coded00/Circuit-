import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { statusTargetFor } from "@/lib/streamEmbed";
import { _resetStreamStatusCache, streamStatuses } from "@/lib/streamStatus";

describe("statusTargetFor", () => {
  it("names a Twitch channel or a YouTube video, and nothing else", () => {
    expect(
      statusTargetFor("TWITCH", "https://www.twitch.tv/Lagos_Masters"),
    ).toEqual({ platform: "TWITCH", id: "lagos_masters" });
    expect(statusTargetFor("TWITCH", "https://twitch.tv/videos/1")).toBeNull();
    expect(
      statusTargetFor("YOUTUBE", "https://www.youtube.com/watch?v=jfKfPfyJRdk"),
    ).toEqual({ platform: "YOUTUBE", id: "jfKfPfyJRdk" });
    expect(
      statusTargetFor("YOUTUBE", "https://youtube.com/@someone/live"),
    ).toBeNull();
    expect(statusTargetFor("KICK", "https://kick.com/player")).toBeNull();
    expect(statusTargetFor("TWITCH", "https://evil.example/player")).toBeNull();
  });
});

describe("streamStatuses", () => {
  const env = { ...process.env };
  beforeEach(() => {
    _resetStreamStatusCache();
    process.env.TWITCH_CLIENT_ID = "id";
    process.env.TWITCH_CLIENT_SECRET = "secret";
    process.env.YOUTUBE_API_KEY = "yt";
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  const json = (body: unknown, ok = true) => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  });

  it("marks listed Twitch channels live with viewers and the rest offline, in one call, then caches", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("oauth2/token")
        ? json({ access_token: "t", expires_in: 3600 })
        : json({
            data: [{ user_login: "one", type: "live", viewer_count: 1234 }],
          }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const targets = [
      { platform: "TWITCH" as const, id: "one" },
      { platform: "TWITCH" as const, id: "two" },
    ];
    const first = await streamStatuses(targets);
    expect(first.get("TWITCH:one")).toEqual({ live: true, viewers: 1234 });
    expect(first.get("TWITCH:two")).toEqual({ live: false, viewers: null });
    const calls = fetchMock.mock.calls.length;
    await streamStatuses(targets);
    expect(fetchMock.mock.calls.length).toBe(calls); // served from cache
  });

  it("reads a live YouTube video and an ended one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          items: [
            {
              id: "AAAAAAAAAAA",
              liveStreamingDetails: {
                actualStartTime: "2026-01-01T00:00:00Z",
                concurrentViewers: "42",
              },
            },
            {
              id: "BBBBBBBBBBB",
              liveStreamingDetails: {
                actualStartTime: "2026-01-01T00:00:00Z",
                actualEndTime: "2026-01-01T01:00:00Z",
              },
            },
          ],
        }),
      ),
    );
    const out = await streamStatuses([
      { platform: "YOUTUBE", id: "AAAAAAAAAAA" },
      { platform: "YOUTUBE", id: "BBBBBBBBBBB" },
    ]);
    expect(out.get("YOUTUBE:AAAAAAAAAAA")).toEqual({ live: true, viewers: 42 });
    expect(out.get("YOUTUBE:BBBBBBBBBBB")).toEqual({
      live: false,
      viewers: null,
    });
  });

  it("returns nothing, without calling anyone, when the keys aren't set", async () => {
    delete process.env.TWITCH_CLIENT_ID;
    delete process.env.YOUTUBE_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await streamStatuses([
      { platform: "TWITCH", id: "one" },
      { platform: "YOUTUBE", id: "AAAAAAAAAAA" },
    ]);
    expect(out.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a failing platform as unknown, not offline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({}, false)),
    );
    const out = await streamStatuses([{ platform: "TWITCH", id: "one" }]);
    expect(out.size).toBe(0);
  });
});
