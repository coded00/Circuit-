/**
 * Circuit — payment provider abstraction, shared types (Build Plan task P0-4).
 *
 * The point of this interface: Registration & Payments (Phase 2) code calls
 * ChargeProvider / TransferProvider and never touches Paystack or
 * Flutterwave specifics directly. Both providers' hosted, tokenized
 * checkout flows are used — Circuit's own servers never see a raw card or
 * bank number. Maps to D5 and NFR-3.
 */

export type MinorAmount = number; // always minor currency units (kobo), never a float

export type InitializeChargeInput = {
  /** Minor units — e.g. ₦5,000 is 500000 kobo. */
  amount: MinorAmount;
  currency: "NGN";
  email: string;
  /** Our own reference, generated before calling the provider, so we can
   *  reconcile a webhook back to a Registration/EscrowTransaction without
   *  trusting the provider's own ID as the primary key. */
  reference: string;
  /** Where the provider should redirect after a hosted checkout completes. */
  callbackUrl: string;
  metadata?: Record<string, string>;
};

export type InitializeChargeResult = {
  /** URL to redirect the player to — the provider's hosted checkout page. */
  authorizationUrl: string;
  providerReference: string;
};

export type VerifyChargeResult = {
  status: "SUCCESS" | "FAILED" | "PENDING";
  amount: MinorAmount;
  currency: "NGN";
  providerReference: string;
  paidAt: Date | null;
};

export type InitiateTransferInput = {
  amount: MinorAmount;
  currency: "NGN";
  /** Opaque payout destination — resolved from User.payoutMethodRef (P0-7).
   *  What this actually contains (bank code + account number, or a
   *  provider-specific recipient code) is a provider-level detail this
   *  interface intentionally hides from callers. */
  destinationRef: string;
  reference: string;
  reason: string;
};

export type InitiateTransferResult = {
  status: "SUCCESS" | "PENDING" | "FAILED";
  providerReference: string;
};

/**
 * Implemented by src/lib/payments/paystack.ts and flutterwave.ts.
 * Phase 2 code (P2-2 paid registration, P2-6 prize payout) depends on this
 * interface, not on either provider's SDK/REST shape directly.
 */
export interface PaymentProviderClient {
  readonly name: "PAYSTACK" | "FLUTTERWAVE";
  initializeCharge(input: InitializeChargeInput): Promise<InitializeChargeResult>;
  verifyCharge(providerReference: string): Promise<VerifyChargeResult>;
  initiateTransfer(input: InitiateTransferInput): Promise<InitiateTransferResult>;
}
