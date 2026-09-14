/**
 * Circuit — hosted-checkout redirect landing (part of P2-2).
 *
 * Best-effort only: the browser might never come back here (closed tab,
 * network drop), so this is never the sole path to CONFIRMED — it calls
 * the same idempotent confirmEntryFeePayment the provider webhook calls,
 * purely so a returning user doesn't have to wait on the webhook to see
 * their own result.
 */

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { confirmEntryFeePayment } from "@/lib/payments/confirm";
import Poller from "@/app/Poller";
import { Spinner } from "@/components/Spinner";

export default async function RegistrationCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;

  if (ref) {
    await confirmEntryFeePayment(ref).catch(() => {});
  }

  const registration = ref
    ? await prisma.registration.findUnique({ where: { paymentRef: ref } })
    : null;

  const confirmed = registration?.status === "CONFIRMED";

  return (
    <div className="state-block">
      {/* Only while still waiting on a real ref — no ref means there's
          nothing that could ever resolve to confirmed, and once confirmed
          the outcome is already settled either way. */}
      {ref && !confirmed && <Poller />}
      {confirmed ? (
        <>
          <CheckCircle2 size={40} className="motion-scale-in text-success" />
          <h1 className="state-title">You&apos;re in!</h1>
          <p className="state-description">Your registration is confirmed.</p>
        </>
      ) : (
        <>
          <Spinner size={28} className="text-muted" />
          <h1 className="state-title">Payment processing</h1>
          <p className="state-description">
            This can take a minute — this page will update on its own once it&apos;s confirmed.
          </p>
        </>
      )}
      {registration && (
        <Link href={`/tournaments/${registration.tournamentId}`} className="btn-secondary">
          Back to tournament
        </Link>
      )}
    </div>
  );
}
