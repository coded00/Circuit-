"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OptionCard } from "@/components/OptionCard";

const REASONS = [
  { code: "MULTI_ACCOUNTING", label: "Multi-accounting" },
  { code: "CHEATING", label: "Cheating" },
  { code: "HARASSMENT", label: "Harassment" },
  { code: "PAYMENT_FRAUD", label: "Payment fraud" },
  { code: "OTHER", label: "Other" },
];

export default function ReportForm({ reportedHandle }: { reportedHandle: string }) {
  const router = useRouter();
  const [reasonCode, setReasonCode] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    form.set("reportedHandle", reportedHandle);
    form.set("reasonCode", reasonCode);
    form.set("details", details);

    const res = await fetch("/api/reports", { method: "POST", body: form });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    setSubmitted(true);
    setSubmitting(false);
    router.refresh();
  }

  if (submitted) {
    return <p className="card text-sm text-status-live">Report filed. Circuit staff will review it.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="field-label">Reason</span>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {REASONS.map((r) => (
            <OptionCard
              key={r.code}
              selected={reasonCode === r.code}
              onSelect={() => setReasonCode(r.code)}
              title={r.label}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="details" className="field-label">
          Details
        </label>
        <textarea
          id="details"
          rows={4}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          className="field-input"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="evidence" className="field-label">
          Evidence (optional)
        </label>
        <input
          id="evidence"
          name="evidence"
          type="file"
          accept="image/*,video/*"
          className="text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-surface-hover file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button type="submit" disabled={submitting || !reasonCode} className="btn-primary w-full">
        {submitting ? "Filing report…" : "File report"}
      </button>
    </form>
  );
}
