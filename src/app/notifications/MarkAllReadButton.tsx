"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";

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
    <button type="button" onClick={handleClick} disabled={submitting} className="btn-secondary gap-1.5 px-3.5 py-2 text-[13px]">
      <CheckCheck size={15} />
      {submitting ? "Marking…" : "Mark all read"}
    </button>
  );
}
