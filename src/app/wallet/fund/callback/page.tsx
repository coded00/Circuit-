/**
 * Circuit — hosted-checkout redirect landing for Fund Wallet, same
 * best-effort/idempotent pattern as the tournament registration callback
 * (src/app/tournaments/[id]/register/callback/page.tsx): the browser
 * might never come back here, so this just calls the same idempotent
 * confirmWalletFunding the provider webhook calls, purely so a returning
 * user doesn't have to wait on the webhook to see their own result.
 */

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { confirmWalletFunding } from "@/lib/payments/confirm";
import Poller from "@/app/Poller";
import { Spinner } from "@/components/Spinner";

export default async function FundWalletCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;

  if (ref) {
    await confirmWalletFunding(ref).catch(() => {});
  }

  const txn = ref ? await prisma.walletTransaction.findUnique({ where: { providerRef: ref } }) : null;
  // COMPLETE and FAILED are both settled outcomes — nothing left to poll for.
  const settled = txn?.status === "COMPLETE" || txn?.status === "FAILED";

  return (
    <div className="state-block">
      {ref && !settled && <Poller />}
      {txn?.status === "COMPLETE" ? (
        <>
          <CheckCircle2 size={40} className="motion-scale-in text-success" />
          <h1 className="state-title">Wallet funded</h1>
          <p className="state-description">
            ₦{(txn.amount / 100).toLocaleString("en-NG")} has been added to your Circuit wallet.
          </p>
        </>
      ) : txn?.status === "FAILED" ? (
        <>
          <h1 className="state-title">Funding failed</h1>
          <p className="state-description">That payment didn&apos;t go through. No funds were added.</p>
        </>
      ) : (
        <>
          <Spinner size={28} className="text-muted" />
          <h1 className="state-title">Payment processing</h1>
          <p className="state-description">This can take a minute — this page will update on its own once it&apos;s confirmed.</p>
        </>
      )}
      <Link href="/wallet" className="btn-secondary">
        Back to wallet
      </Link>
    </div>
  );
}
