import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { createTestUser, cleanupAll } from "@/testHelpers";
import { GET } from "./route";

/**
 * Regression test for the Phase 9 fix: /api/players/search built its own
 * conditions with only `isSuspended: false` and "not me", so it never applied
 * the privacy setting or the block list that src/lib/privacy.ts names as the
 * one place a player listing must start from. A player who turned
 * *Profile → Privacy → searchable* off was still enumerable here, and so was
 * anyone the searcher had a block with — in either direction. That last part
 * is the one that matters: this is the endpoint an abuser would use to find a
 * person by handle after being blocked.
 */

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupAll();
});

/** A token unique to one test, so a query for it can only match that test's fixtures. */
const token = () => `psearch${randomUUID().slice(0, 8)}`;

const search = (q: string, teamId?: string) =>
  GET(new Request(`http://localhost/api/players/search?q=${encodeURIComponent(q)}${teamId ? `&teamId=${teamId}` : ""}`));

const handlesFrom = async (response: Response) => ((await response.json()) as { players: { handle: string }[] }).players.map((p) => p.handle);

describe("player search privacy", () => {
  it("leaves out a player who turned searchability off", async () => {
    const t = token();
    const searcher = await createTestUser();
    const open = await createTestUser({ handle: `${t}-open` });
    const hidden = await createTestUser({ handle: `${t}-hidden`, searchable: false });
    vi.mocked(getCurrentUser).mockResolvedValue(searcher);

    const handles = await handlesFrom(await search(t));

    expect(handles).toContain(open.handle);
    expect(handles).not.toContain(hidden.handle);
  });

  it("leaves out a player the searcher blocked, and one who blocked the searcher", async () => {
    const t = token();
    const searcher = await createTestUser();
    const iBlocked = await createTestUser({ handle: `${t}-iblocked` });
    const blockedMe = await createTestUser({ handle: `${t}-blockedme` });
    const visible = await createTestUser({ handle: `${t}-visible` });
    // Both directions: a block hides the pair from each other either way round.
    await prisma.userBlock.create({ data: { blockerId: searcher.id, blockedId: iBlocked.id } });
    await prisma.userBlock.create({ data: { blockerId: blockedMe.id, blockedId: searcher.id } });
    vi.mocked(getCurrentUser).mockResolvedValue(searcher);

    const handles = await handlesFrom(await search(t));

    expect(handles).toContain(visible.handle);
    expect(handles).not.toContain(iBlocked.handle);
    expect(handles).not.toContain(blockedMe.handle);
  });

  it("still applies both on the team picker, which is the same search with a teamId", async () => {
    const t = token();
    const captain = await createTestUser();
    const team = await prisma.team.create({ data: { name: `TEST-Team-${t}`, captainId: captain.id } });
    const reachable = await createTestUser({ handle: `${t}-reachable` });
    const hidden = await createTestUser({ handle: `${t}-hidden`, searchable: false });
    const blocked = await createTestUser({ handle: `${t}-blocked` });
    await prisma.userBlock.create({ data: { blockerId: captain.id, blockedId: blocked.id } });
    vi.mocked(getCurrentUser).mockResolvedValue(captain);

    const handles = await handlesFrom(await search(t, team.id));

    expect(handles).toContain(reachable.handle);
    expect(handles).not.toContain(hidden.handle);
    expect(handles).not.toContain(blocked.handle);
  });

  it("still finds ordinary players, and still leaves out the searcher and suspended accounts", async () => {
    // Guard test, not regression coverage: this passed before the fix too. It is
    // here so that tightening the filter can't quietly start hiding everyone.
    const t = token();
    const searcher = await createTestUser({ handle: `${t}-me` });
    const friend = await createTestUser({ handle: `${t}-friend` });
    const suspended = await createTestUser({ handle: `${t}-suspended`, isSuspended: true });
    vi.mocked(getCurrentUser).mockResolvedValue(searcher);

    const handles = await handlesFrom(await search(t));

    expect(handles).toContain(friend.handle);
    expect(handles).not.toContain(searcher.handle);
    expect(handles).not.toContain(suspended.handle);
  });
});
