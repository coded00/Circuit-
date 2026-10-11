import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/db";
import { cleanupAll } from "@/testHelpers";
import { createE2EUser, loginViaUI } from "./helpers";
import { DAY_MS } from "@/lib/selfExclusion";

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
  // The Challenge form only offers published games, and a fresh database has none.
  test.beforeEach(async () => {
    await prisma.game.upsert({ where: { name: "Test Game" }, update: { enabled: true, publishedAt: new Date() }, create: { name: "Test Game", enabled: true, publishedAt: new Date() } });
  });

  test.afterEach(async () => {
    await cleanupAll();
    await prisma.game.deleteMany({ where: { name: "Test Game" } });
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
      const acceptButton = page.getByRole("button", { name: "Accept battle", exact: true });
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

  test("the challenge form shows a player what they have staked, never what is left", async ({ browser }) => {
    // The stake readout (StakeLimitsNote) is the one place a player sees the
    // per-account limits, and it is the surface where the phrasing is a
    // product decision, not a formatting one: it states usage and never
    // offers headroom as an invitation. This is the only test that the note
    // reaches the real form at all — the unit tests in src/lib/stakes.test.ts
    // cover the numbers, not the wiring.
    const host = await createE2EUser({ walletBalance: 1_000_000 });
    // A Quick Match sends to whoever is online for that game and stake, and
    // refuses rather than opening a challenge nobody would receive — so there
    // has to be one. lastActiveAt is what "online" means here.
    await createE2EUser({ walletBalance: 1_000_000, lastActiveAt: new Date() });
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginViaUI(page, host.emailOrPhone!);

    await page.goto("/battles/new");
    // Free is the default, and a player choosing it has no use for their stake
    // budget — so the note is not on the form yet.
    await expect(page.getByText("In play now")).toHaveCount(0);

    await page.getByRole("button", { name: "Staked" }).click();
    await expect(page.getByText("In play now")).toBeVisible();
    await expect(page.getByText("Last 24 hours")).toBeVisible();
    // The design decision, asserted rather than assumed: nothing on this form
    // tells a player how much more they could stake today.
    await expect(page.getByText(/you can still|remaining|left to stake/i)).toHaveCount(0);

    await page.getByRole("button", { name: "Quick Match" }).click();
    await page.locator("#stakeNaira").fill("300");
    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/quick-match") && res.request().method() === "POST",
        { timeout: 30_000 }
      ),
      page.getByRole("button", { name: "Challenge All Available Players", exact: true }).click(),
    ]);
    expect(createResponse.ok()).toBe(true);

    // Back on the form, the note reflects the stake that was just locked: the
    // readout really is reading the account, not rendering a constant.
    await page.goto("/battles/new");
    await page.getByRole("button", { name: "Staked" }).click();
    await expect(page.locator("dl", { hasText: "In play now" })).toContainText("₦300");

    await context.close();
  });

  test("a refused accept says why, on both surfaces", async ({ browser }) => {
    // The refusal clients used to answer every rejection with "another player
    // accepted this battle first". A self-excluded player is the sharpest case
    // of how wrong that is: they asked to be stopped, that is why they were
    // stopped, and the old copy told them somebody had simply been faster.
    //
    // The refusal itself is checked at the unit level in
    // src/lib/quickMatchRefusal.test.ts. What this covers is the part nothing
    // below a browser can reach: that the accept route sends the real reason
    // and that both clients render it instead of their own guess — the live
    // request modal and the dedicated page, which are separate components.
    const stakeAmount = 30_000; // ₦300, in kobo
    const host = await createE2EUser({ walletBalance: 1_000_000 });
    const excluded = await createE2EUser({
      walletBalance: 1_000_000,
      // Online, so a staked Quick Match fans out to them (getEligibleRecipients
      // requires recent activity) — and self-exclusion is deliberately not one
      // of its exclusions, so being challenged at all is expected here. What
      // happens when they take it up is what this test is about.
      lastActiveAt: new Date(),
      selfExcludedUntil: new Date(Date.now() + 30 * DAY_MS),
    });

    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    await loginViaUI(hostPage, host.emailOrPhone!);
    await hostPage.goto("/battles/new");
    await hostPage.getByRole("button", { name: "Quick Match" }).click();
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

    // Surface one: the live request modal. Landing on /battles mounts the
    // listener, which polls immediately, so the modal is up without waiting a
    // full tick.
    const excludedContext = await browser.newContext();
    const excludedPage = await excludedContext.newPage();
    await loginViaUI(excludedPage, excluded.emailOrPhone!);
    await excludedPage.goto("/battles");
    await excludedPage.getByRole("button", { name: "Accept battle", exact: true }).click();

    // The cool-off's own sentence, which lockStake raised and the route passed
    // through — not a paraphrase of it.
    await expect(excludedPage.getByText(/paused staked Battles until/i)).toBeVisible();
    await expect(excludedPage.getByText(/another player/i)).toHaveCount(0);
    // A refusal the player has to act on waits for them rather than clearing
    // itself after three seconds.
    await excludedPage.getByRole("button", { name: "Close", exact: true }).click();

    // Surface two: the dedicated page, which is a different component with its
    // own state — and the one a notification link lands on. Clicked the moment
    // the page loads, deliberately: this card is server-rendered, and its
    // countdown is read off the clock, so the server's value never matches the
    // browser's and React used to answer that by rebuilding the card on
    // hydration. The rebuild detached the Accept button, so an immediate press
    // landed on a node with no listener and was silently swallowed — no
    // request, no spinner, no refusal, nothing. That is why this test does not
    // wait for anything first; waiting would hide the regression.
    await excludedPage.goto(`/quick-match/${challengeId}`);
    await excludedPage.getByRole("button", { name: "Accept battle", exact: true }).click();
    await expect(excludedPage.getByText(/paused staked Battles until/i)).toBeVisible();
    await expect(excludedPage.getByText(/another player/i)).toHaveCount(0);

    // The challenge is untouched by all of this: a refused accept reopens it
    // for every other recipient rather than closing it out.
    const challenge = await prisma.quickMatchChallenge.findUniqueOrThrow({ where: { id: challengeId } });
    expect(challenge.status).toBe("PENDING");
    expect(await prisma.quickMatchRecipient.count({ where: { challengeId, status: "PENDING" } })).toBe(1);

    await excludedContext.close();
    await hostContext.close();
  });
});
