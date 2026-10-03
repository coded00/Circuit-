import { describe, it, expect, afterEach } from "vitest";
import { getFeaturedTournaments, getUpcomingTournaments } from "./homeTournaments";
import { createTestOrganizer, createTestTournament, cleanupAll } from "@/testHelpers";

afterEach(async () => {
  await cleanupAll();
});

// The dev database has real tournaments too, so look only at the ones this test made, and ask for plenty of rows.
const mine = (rows: { name: string }[]) => rows.map((r) => r.name).filter((n) => n.startsWith("TEST-"));

async function oneOfEveryStatus() {
  const org = await createTestOrganizer();
  const made = async (label: string, overrides: Parameters<typeof createTestTournament>[1]) => (await createTestTournament(org.id, { name: `TEST-${label}`, ...overrides })).name;
  return {
    live: await made("live", { status: "LIVE" }),
    openBig: await made("open-big", { status: "OPEN", prizeAmount: 500_000 }),
    openSmall: await made("open-small", { status: "OPEN", prizeAmount: 100_000 }),
    openNoPrize: await made("open-noprize", { status: "OPEN", prizeAmount: null }),
    draft: await made("draft", { status: "DRAFT", registrationOpenAt: new Date(Date.now() + 86_400_000) }),
    closed: await made("closed", { status: "CLOSED" }),
    complete: await made("complete", { status: "COMPLETE" }),
    cancelled: await made("cancelled", { status: "CANCELLED" }),
  };
}

describe("homepage tournament rows", () => {
  it("Featured is live first, then registration open by prize, and nothing else", async () => {
    const n = await oneOfEveryStatus();
    const featured = mine(await getFeaturedTournaments(200));
    expect(featured).toEqual([n.live, n.openBig, n.openSmall, n.openNoPrize]);
  });

  it("Upcoming is announced or closed-ahead-of-start only", async () => {
    const n = await oneOfEveryStatus();
    const upcoming = mine(await getUpcomingTournaments(200));
    expect([...upcoming].sort()).toEqual([n.draft, n.closed].sort());
  });

  it("never shows the same tournament in both rows", async () => {
    await oneOfEveryStatus();
    const featured = new Set(mine(await getFeaturedTournaments(200)));
    const overlap = mine(await getUpcomingTournaments(200)).filter((name) => featured.has(name));
    expect(overlap).toEqual([]);
  });

  it("respects the limit, keeping live ones ahead of open ones", async () => {
    await oneOfEveryStatus();
    const rows = await getFeaturedTournaments(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("LIVE");
  });
});
