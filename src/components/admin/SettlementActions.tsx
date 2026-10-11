"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/admin/ui-client";

/**
 * Circuit — approve a payout and settle a final challenge. Approving is the moment the money is allowed to leave when it
 * needs a named person; settling pays it. Both are checked again on the server, and settling pays each prize exactly once
 * however many times it is pressed.
 */
export function SettlementActions({ challengeId, canApprove, canSettle }: { challengeId: string; canApprove: boolean; canSettle: boolean }) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);

  async function call(path: string): Promise<string | null> {
    setNotice(null);
    const res = await fetch(`/api/admin/daily-challenges/${challengeId}/${path}`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (!res.ok) return data?.error ?? "Something went wrong.";
    if (typeof data?.note === "string") setNotice(data.note);
    router.refresh();
    return null;
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      {canApprove && (
        <ConfirmButton
          label="Approve payout"
          confirmLabel="Yes, approve"
          tone="neutral"
          message="You are approving the prizes listed here to be paid from this challenge's money. You can't approve a payout that pays you, or one you created when a sponsor is involved."
          onConfirm={() => call("approve-payout")}
        />
      )}
      {canSettle && (
        <ConfirmButton
          label="Settle now"
          confirmLabel="Yes, pay out"
          tone="neutral"
          message="This pays the prizes into the winners' wallets and books the rest to the house. It can't be undone, and it pays each prize only once."
          onConfirm={() => call("settle")}
        />
      )}
      {notice && <p className="w-full text-[12px] text-muted">{notice}</p>}
    </div>
  );
}
