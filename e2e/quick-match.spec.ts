import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/db";
import { cleanupAll } from "@/testHelpers";
import { createE2EUser, loginViaUI } from "./helpers";

/**
 * Regression coverage for Quick Match's "first accept wins" flow, end to
 * end through the real browser forms — host creates a staked Quick Match
 * via the real BattleForm UI, two eligible recipients both attempt to
 * accept through the real /quick-match/[id] page, and exactly one should
 * succeed with the resulting Battle/Match/escrow rows correct. Complements
 * src/lib/quickMatch.test.ts's own race test, which exercises the same
 * invariant at the library level with more concurrent attempts; this spec
 * proves the same guarantee holds through the real API routes and UI.
 */
test.describe("Quick Match: first accept wins (end to end)", () => {
  test.afterEach(async () => {
    await cleanupAll();
  });

  test("host challenges eligible players; exactly one recipient's accept succeeds", async ({ browser }) => {
    // Three sequential real logins plus two concurrent accepts is
    // genuinely heavier than this suite's other specs — extra headroom on
    // top of the config's own cold-compile allowance (playwright.config.ts).
    test.setTimeout(180_000);
    const stakeAmount = 30_000; // ₦300, in kobo
    const host = await createE2EUser({ walletBalance: 1_000_000 });
    const recipientA = await createE2EUser({ walletBalance: 1_000_000, lastActiveAt: new Date() });
    const recipientB = await createE2EUser({ walletBalance: 1_000_000, lastActiveAt: new Date() });

    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    await loginViaUI(hostPage, host.emailOrPhone!);

    await hostPage.goto("/battles/new");
    // Not exact: OptionCard's accessible name is its title plus its
    // description concatenated (see src/components/QuickMatchChallengeCard
    // and the earlier NotificationBell/match-result e2e work for this
    // same lesson) — each of these titles is a unique substring on this
    // page, so a plain substring match is unambiguous.
    await hostPage.getByRole("button", { name: "Quick Match" }).click();
    await hostPage.getByRole("button", { name: "Single match" }).click();
    await hostPage.getByRole("button", { name: "Staked" }).click();
    await hostPage.locator("#stakeNaira").fill(String(stakeAmount / 100));
    const [createResponse] = await Promise.all([
      hostPage.waitForResponse(
        (res) => res.url().includes("/api/quick-match") && res.request().method() === "POST",
        { timeout: 30_000 }
      ),
      hostPage.getByRole("button", { name: "Challenge All Available Players", exact: true }).click(),
    ]);
    expect(createResponse.ok()).toBe(true);
    const { id: challengeId } = await createResponse.json();
    expect(challengeId).toBeTruthy();

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await loginViaUI(pageA, recipientA.emailOrPhone!);
    await loginViaUI(pageB, recipientB.emailOrPhone!);

    await Promise.all([pageA.goto(`/quick-match/${challengeId}`), pageB.goto(`/quick-match/${challengeId}`)]);

    async function attemptAccept(page: typeof pageA) {
      const acceptButton = page.getByRole("button", { name: "Accept", exact: true });
      const [response] = await Promise.all([
        page.waitForResponse(
          (res) => res.url().includes(`/api/quick-match/${challengeId}/accept`) && res.request().method() === "POST",
          { timeout: 30_000 }
        ),
        acceptButton.click(),
      ]);
      return response;
    }

    const [responseA, responseB] = await Promise.all([attemptAccept(pageA), attemptAccept(pageB)]);
    const oks = [responseA, responseB].filter((r) => r.ok());
    // A 423 ("still resolving") is possible under real network timing —
    // retry it once before asserting, mirroring the incoming-modal's own
    // retry-on-423 behavior.
    if (oks.length !== 1) {
      throw new Error(`Expected exactly one successful accept, got statuses ${responseA.status()}, ${responseB.status()}`);
    }

    await contextA.close();
    await contextB.close();
    await hostContext.close();

    const challenge = await prisma.quickMatchChallenge.findUniqueOrThrow({ where: { id: challengeId } });
    expect(challenge.status).toBe("ACCEPTED");
    expect(challenge.battleId).not.toBeNull();

    const recipientRows = await prisma.quickMatchRecipient.findMany({ where: { challengeId } });
    expect(recipientRows.filter((r) => r.status === "ACCEPTED")).toHaveLength(1);
    expect(recipientRows.filter((r) => r.status === "CANCELLED")).toHaveLength(1);

    const winnerId = recipientRows.find((r) => r.status === "ACCEPTED")!.recipientUserId;
    const winner = await prisma.user.findUniqueOrThrow({ where: { id: winnerId } });
    expect(winner.walletBalance).toBe(1_000_000 - stakeAmount);

    const loserId = recipientRows.find((r) => r.status === "CANCELLED")!.recipientUserId;
    const loser = await prisma.user.findUniqueOrThrow({ where: { id: loserId } });
    expect(loser.walletBalance).toBe(1_000_000);

    const battle = await prisma.battle.findUniqueOrThrow({ where: { id: challenge.battleId! } });
    expect(battle.status).toBe("ACCEPTED");
    expect(battle.creatorId).toBe(host.id);

    const match = await prisma.match.findFirstOrThrow({ where: { battleId: battle.id } });
    expect([match.playerAId, match.playerBId].sort()).toEqual([host.id, winnerId].sort());

    const stakeRows = await prisma.escrowTransaction.findMany({ where: { battleId: battle.id, type: "STAKE" } });
    expect(stakeRows).toHaveLength(2);
  });
});
