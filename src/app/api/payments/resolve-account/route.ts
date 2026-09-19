/**
 * Circuit — Nigerian bank account resolution and recipient creation endpoint.
 *
 * Takes a 10-digit NUBAN account number and a bank code, resolves the
 * account holder's name via Paystack /bank/resolve, and creates a transfer
 * recipient via /transferrecipient to obtain the recipient code (RCP_xxx)
 * required for automated prize and wallet payouts.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { resolveAccountNumber, createTransferRecipient } from "@/lib/payments/paystack";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const { accountNumber, bankCode } = body as Record<string, unknown>;

  if (typeof accountNumber !== "string" || !/^\d{10}$/.test(accountNumber.trim())) {
    return NextResponse.json(
      { error: "Account number must be exactly 10 digits (NUBAN standard)." },
      { status: 400 }
    );
  }

  if (typeof bankCode !== "string" || !bankCode.trim()) {
    return NextResponse.json({ error: "Bank selection is required." }, { status: 400 });
  }

  const cleanAccountNumber = accountNumber.trim();
  const cleanBankCode = bankCode.trim();

  // If running in development without a Paystack key, simulate resolution for testing
  if (!process.env.PAYSTACK_SECRET_KEY) {
    const mockRecipientCode = `RCP_sim_${cleanBankCode}_${cleanAccountNumber}`;
    return NextResponse.json({
      success: true,
      simulated: true,
      recipientCode: mockRecipientCode,
      accountName: "CIRCUIT TEST HOLDER",
      accountNumber: cleanAccountNumber,
      bankCode: cleanBankCode,
    });
  }

  try {
    // 1. Resolve Account Name
    const resolved = await resolveAccountNumber(cleanAccountNumber, cleanBankCode);

    // 2. Create Paystack Transfer Recipient
    const recipient = await createTransferRecipient({
      accountName: resolved.accountName,
      accountNumber: cleanAccountNumber,
      bankCode: cleanBankCode,
    });

    return NextResponse.json({
      success: true,
      recipientCode: recipient.recipientCode,
      accountName: resolved.accountName,
      accountNumber: cleanAccountNumber,
      bankCode: cleanBankCode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account resolution failed";
    console.error("[resolve-account] Paystack error:", message);
    return NextResponse.json(
      { error: message.replace("Paystack request failed: ", "") },
      { status: 400 }
    );
  }
}
