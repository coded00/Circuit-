"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MarkAllReadButton() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    setSubmitting(true);
    await fetch("/api/notifications/read-all", { method: "POST" });
    setSubmitting(false);
    router.refresh();
  }

  return (
    <button type="button" onClick={handleClick} disabled={submitting} className="btn-secondary">
      {submitting ? "Marking…" : "Mark all read"}
    </button>
  );
}
