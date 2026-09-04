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
import { prisma } from "@/lib/db";
import { confirmEntryFeePayment } from "@/lib/payments/confirm";

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

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      {registration?.status === "CONFIRMED" ? (
        <>
          <h1 className="text-2xl font-semibold">You&apos;re in!</h1>
          <p className="text-zinc-500">Your registration is confirmed.</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Payment processing</h1>
          <p className="text-zinc-500">
            This can take a minute. Refresh this page, or check back on the
            tournament page shortly.
          </p>
        </>
      )}
      {registration && (
        <Link href={`/tournaments/${registration.tournamentId}`} className="font-medium underline">
          Back to tournament
        </Link>
      )}
    </div>
  );
}
