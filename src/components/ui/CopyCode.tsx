"use client";

/** Circuit — a code (match code, reference) shown large in mono, tap to copy. */

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyCode({ code, label = "Copy code" }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (insecure origin / permissions) — the code is still visible to read.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : `${label}: ${code}`}
      className="group inline-flex items-center gap-2 rounded-[8px] font-mono text-xl font-bold tracking-[0.18em] text-foreground transition hover:text-accent-volt focus-visible:ring-2 focus-visible:ring-accent-volt/60 focus-visible:outline-none"
    >
      {code}
      {copied ? (
        <Check size={15} className="text-success" aria-hidden />
      ) : (
        <Copy size={15} className="text-muted transition group-hover:text-accent-volt" aria-hidden />
      )}
    </button>
  );
}
