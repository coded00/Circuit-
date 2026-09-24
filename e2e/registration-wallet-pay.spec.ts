import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/db";
import { createTestOrganizer, createTestTournament, cleanupAll } from "@/testHelpers";
import { createE2EUser, loginViaUI } from "./helpers";

/**
 * Regression coverage for the flow docs/testing.md names as a deliberate
 * fast-follow: register → pay → escrow hold. Exercises the wallet-pay
 * branch of POST /api/tournaments/[id]/registrations through the real
 * browser (not a direct API call) — the one payment path that needs no
 * external provider credentials, since PAYSTACK_SECRET_KEY/
 * FLUTTERWAVE_SECRET_KEY are unset in this environment.
 */
test.describe("register → pay → escrow hold (wallet pay)", () => {
  test.afterEach(async () => {
    await cleanupAll();
  });

  test("paying from wallet confirms registration and holds the entry fee in escrow", async ({ page }) => {
    const entryFee = 50_000; // ₦500, in kobo
    const organizer = await createTestOrganizer();
    const tournament = await createTestTournament(organizer.id, { entryFee, participantCap: 8 });
    const user = await createE2EUser({ walletBalance: entryFee * 2 });

    await loginViaUI(page, user.emailOrPhone!);

    await page.goto(`/tournaments/${tournament.id}/register`);
    await page.locator("#inGameId").fill("TEST-IGN-1");
    await page.getByLabel(/Pay from Wallet balance/i).check();
    await page.getByRole("button", { name: "Register", exact: true }).click();

    // A cold-compile first hit on the registrations API route plus the
    // ~1.1s MatchFoundHud animation can together take well past a short
    // timeout in Next dev mode — see playwright.config.ts's own comment.
    await page.waitForURL(new RegExp(`/tournaments/${tournament.id}$`), { timeout: 30_000 });

    const registration = await prisma.registration.findFirstOrThrow({
      where: { tournamentId: tournament.id, userId: user.id },
    });
    expect(registration.status).toBe("CONFIRMED");
    expect(registration.paymentRef).toMatch(/^wallet_entry_/);

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.walletBalance).toBe(entryFee * 2 - entryFee);

    const escrow = await prisma.escrowTransaction.findFirstOrThrow({
      where: { registrationId: registration.id, type: "ENTRY_FEE" },
    });
    expect(escrow.status).toBe("COMPLETE");
    expect(escrow.amount).toBe(entryFee);

    const walletTxn = await prisma.walletTransaction.findFirstOrThrow({
      where: { userId: user.id, type: "ENTRY_FEE_DEBIT" },
    });
    expect(walletTxn.status).toBe("COMPLETE");
    expect(walletTxn.amount).toBe(entryFee);
  });

  test("insufficient wallet balance falls back to the card radio, not a silent wallet debit", async ({ page }) => {
    const entryFee = 50_000;
    const organizer = await createTestOrganizer();
    const tournament = await createTestTournament(organizer.id, { entryFee, participantCap: 8 });
    const user = await createE2EUser({ walletBalance: 1_000 }); // well under entryFee

    await loginViaUI(page, user.emailOrPhone!);
    await page.goto(`/tournaments/${tournament.id}/register`);

    const walletRadio = page.getByLabel(/Pay from Wallet balance/i);
    await expect(walletRadio).toBeDisabled();
    const cardRadio = page.getByLabel(/Pay by card/i);
    await expect(cardRadio).toBeChecked();
  });
});
