import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { user: { findMany: (...a: unknown[]) => findMany(...a) } } }));

import { standingsForViewer } from "@/lib/leaderboardSeo";

const standing = (userId: string, n: number) => ({ userId, displayName: `Player ${n}`, handle: `p${n}`, avatarUrl: null, wins: 10 - n, losses: n });
const adult = new Date("1995-01-01T00:00:00Z");
const base = { isSuspended: false, deletionRequestedAt: null };

describe("standingsForViewer", () => {
  beforeEach(() => findMany.mockReset());

  it("shows everyone's name to a signed-in viewer without asking the database", async () => {
    const rows = await standingsForViewer([standing("a", 1), standing("b", 2)], true);
    expect(rows.map((r) => r.displayName)).toEqual(["Player 1", "Player 2"]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("names only opted-in adults to a signed-out viewer, and keeps everyone's record and rank", async () => {
    findMany.mockResolvedValue([
      { id: "a", searchEngineIndexable: true, dateOfBirth: adult, ...base },
      { id: "b", searchEngineIndexable: false, dateOfBirth: adult, ...base }, // adult, didn't opt in
      { id: "c", searchEngineIndexable: true, dateOfBirth: new Date("2012-01-01T00:00:00Z"), ...base }, // opted in, but a minor
    ]);
    const rows = await standingsForViewer([standing("a", 1), standing("b", 2), standing("c", 3)], false);
    expect(rows.map((r) => [r.rank, r.displayName, r.handle])).toEqual([
      [1, "Player 1", "p1"],
      [2, "Circuit player", null],
      [3, "Circuit player", null],
    ]);
    expect(rows[1].wins).toBe(8);
  });
});
