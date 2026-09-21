import path from "node:path";
import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/db";
import { cleanupAll } from "@/testHelpers";
import { createE2EUser, loginViaUI } from "./helpers";

const PROOF_FILE = path.join(__dirname, "fixtures/proof.png");

/**
 * Regression coverage for the flow docs/testing.md names as a deliberate
 * fast-follow: result-submit → auto-complete → payout-eligible. Uses a
 * staked Battle match rather than a tournament bracket final: a Battle's
 * winner is paid out automatically the instant both results agree
 * (settleBattleOnComplete, src/lib/matches.ts), so it proves the same
 * submit→complete→payout pipeline as a tournament's "Claim prize" flow
 * without needing a real payment-provider transfer (Paystack/
 * Flutterwave keys are unset in this environment) or full bracket
 * generation.
 */
test.describe("result-submit → auto-complete → payout-eligible (staked Battle)", () => {
  test.afterEach(async () => {
    await cleanupAll();
  });

  test("both players submitting a matching result completes the match and pays the winner", async ({ browser }) => {
    const stakeAmount = 40_000; // ₦400 per player, in kobo
    const playerA = await createE2EUser({ walletBalance: 1_000_000 });
    const playerB = await createE2EUser({ walletBalance: 1_000_000 });
    const battle = await prisma.battle.create({
      data: { creatorId: playerA.id, game: "Test Game", format: "SINGLE", stakeAmount, status: "ACCEPTED" },
    });
    const match = await prisma.match.create({
      data: {
        battleId: battle.id,
        matchCode: `TEST-E2E-${Date.now()}`,
        playerAId: playerA.id,
        playerBId: playerB.id,
        status: "NEEDS_RESULT",
      },
    });

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await loginViaUI(pageA, playerA.emailOrPhone!);
    await loginViaUI(pageB, playerB.emailOrPhone!);

    async function submitResult(page: typeof pageA, winner: { displayName: string; handle: string }) {
      await page.goto(`/matches/${match.id}`);
      // The OptionCard button's accessible name is its title (displayName)
      // plus its description (@handle) concatenated — matching on
      // displayName alone (non-exact) also catches the header's "Account
      // menu for <displayName>" button, so match the full combined name.
      await page.getByRole("button", { name: `${winner.displayName} @${winner.handle}`, exact: true }).click();
      await page.locator("#score").fill("3-1");
      await page.locator("#proof").setInputFiles(PROOF_FILE);
      await page.getByLabel(/I confirm the match code/i).check();
      const [response] = await Promise.all([
        page.waitForResponse(
          (res) => res.url().includes(`/api/matches/${match.id}/results`) && res.request().method() === "POST",
          { timeout: 30_000 } // cold-compile first hit — see playwright.config.ts
        ),
        page.getByRole("button", { name: "Submit result", exact: true }).click(),
      ]);
      expect(response.ok()).toBe(true);
      // router.refresh() re-renders the server component; once this
      // player's own result is recorded, hasSubmitted flips and
      // ResultForm (this #score input) stops rendering for them.
      await expect(page.locator("#score")).toHaveCount(0, { timeout: 30_000 });
    }

    await submitResult(pageA, playerA);
    await submitResult(pageB, playerA);

    await contextA.close();
    await contextB.close();

    const finalMatch = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(finalMatch.status).toBe("COMPLETE");
    expect(finalMatch.winnerId).toBe(playerA.id);

    const finalBattle = await prisma.battle.findUniqueOrThrow({ where: { id: battle.id } });
    expect(finalBattle.status).toBe("COMPLETE");

    const winner = await prisma.user.findUniqueOrThrow({ where: { id: playerA.id } });
    expect(winner.walletBalance).toBe(1_000_000 + stakeAmount * 2);

    const payout = await prisma.escrowTransaction.findFirstOrThrow({
      where: { battleId: battle.id, type: "STAKE_PAYOUT" },
    });
    expect(payout.status).toBe("COMPLETE");
    expect(payout.amount).toBe(stakeAmount * 2);
  });
});
