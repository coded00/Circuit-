"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function WithdrawButton({ registrationId }: { registrationId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!confirm("Withdraw from this tournament? A paid entry fee will be refunded.")) {
      return;
    }
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/registrations/${registrationId}/withdraw`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <button onClick={handleClick} disabled={submitting} className="btn-danger">
        {submitting ? "Withdrawing…" : "Withdraw"}
      </button>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
