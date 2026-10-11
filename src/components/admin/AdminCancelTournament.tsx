"use client";

/**
 * Circuit — admin "Cancel tournament": a confirm-first button over the
 * real /api/tournaments/[id]/cancel route (its guards stay the source of
 * truth). Cancelling refunds every paid entry and voids the matches, so
 * it spells that out before doing it.
 */

import { useRouter } from "next/navigation";
import { ConfirmButton } from "./ui-client";

export function AdminCancelTournament({ tournamentId, paidEntries }: { tournamentId: string; paidEntries: number }) {
  const router = useRouter();
  return (
    <ConfirmButton
      label="Cancel tournament"
      confirmLabel="Yes, cancel it"
      message={
        <>
          Cancel this tournament? {paidEntries > 0 ? `All ${paidEntries} paid entries are refunded and` : "All"} matches are voided. This can&apos;t be undone.
        </>
      }
      onConfirm={async () => {
        const res = await fetch(`/api/tournaments/${tournamentId}/cancel`, { method: "POST" });
        if (!res.ok) return ((await res.json().catch(() => null))?.error as string) ?? "Couldn't cancel this tournament.";
        router.refresh();
      }}
    />
  );
}
