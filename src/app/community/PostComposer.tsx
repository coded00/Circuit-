"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MAX_LENGTH = 500;

export default function PostComposer() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/community/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    setContent("");
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col gap-3">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={MAX_LENGTH}
        rows={3}
        placeholder="Share something with the Circuit community…"
        className="field-input resize-none"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">
          {content.length}/{MAX_LENGTH}
        </span>
        <button type="submit" disabled={submitting || !content.trim()} className="btn-primary">
          {submitting ? "Posting…" : "Post"}
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
