"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";
import { useToast } from "@/components/ToastProvider";

export default function DeleteAccountCard({ requestedAt }: { requestedAt: string | null }) {
  const router = useRouter();
  const confirmDialog = useConfirmDialog();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function send(action: "request" | "cancel") {
    setBusy(true);
    setError(null);
    setReasons([]);
    const res = await fetch("/api/account/deletion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(false);
    if (!res) return setError("We couldn't reach Circuit. Check your connection and try again.");
    if (res.status === 409 && Array.isArray(data?.reasons)) return setReasons(data.reasons);
    if (!res.ok) return setError(data?.error ?? "Something went wrong. Please try again.");
    toast(action === "request" ? { title: "Deletion requested", message: "Our team will be in touch." } : { title: "Request cancelled", message: "Your account stays as it is." });
    router.refresh();
  }

  async function request() {
    const yes = await confirmDialog({
      title: "Ask to delete your account?",
      message: "Our team will delete your account and its personal details once any money and competitions are settled. Your match results may be kept in anonymised form. You can cancel the request until we act on it.",
      confirmLabel: "Request deletion",
      cancelLabel: "Keep my account",
    });
    if (yes) await send("request");
  }

  return (
    <section className="card flex flex-col gap-3">
      <h2 className="text-[15px] font-semibold">Delete my account</h2>
      {requestedAt ? (
        <>
          <p className="text-sm text-muted">
            You asked to delete your account on <strong className="text-foreground">{new Date(requestedAt).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}</strong>. Our team will process it. Until then you can keep using Circuit, or change your mind.
          </p>
          <button type="button" onClick={() => send("cancel")} disabled={busy} className="btn-secondary w-fit">
            {busy ? "Cancelling…" : "Cancel the request"}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            This is a request, not an instant delete: your wallet, results and any competitions you&apos;re in need to be settled first. We&apos;ll tell you what&apos;s outstanding.
          </p>
          <button type="button" onClick={request} disabled={busy} className="btn-danger w-fit">
            {busy ? "Checking…" : "Request account deletion"}
          </button>
        </>
      )}
      {reasons.length > 0 && (
        <div role="alert" className="alert alert-warning flex flex-col gap-1.5">
          <p className="font-semibold">Not yet. Sort these out first:</p>
          <ul className="ml-4 list-disc space-y-0.5">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="field-error">{error}</p>}
    </section>
  );
}
