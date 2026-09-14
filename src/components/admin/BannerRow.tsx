"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { BannerForm } from "./BannerForm";

type Banner = {
  id: string;
  headline: string;
  description: string | null;
  imageUrl: string;
  ctaLabel: string | null;
  ctaHref: string | null;
  order: number;
  enabled: boolean;
  publishAt: string | null;
};

export function BannerRow({
  banner,
  isFirst,
  isLast,
  onSwap,
}: {
  banner: Banner;
  isFirst: boolean;
  isLast: boolean;
  onSwap: (id: string, direction: "up" | "down") => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggleEnabled() {
    setBusy(true);
    await fetch(`/api/admin/banners/${banner.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !banner.enabled }),
    });
    setBusy(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm(`Delete "${banner.headline}"?`)) return;
    setBusy(true);
    await fetch(`/api/admin/banners/${banner.id}`, { method: "DELETE" });
    router.refresh();
  }

  const scheduled = banner.publishAt && new Date(banner.publishAt) > new Date();

  return (
    <div className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-3">
        <div className="flex flex-col">
          <button type="button" disabled={isFirst} onClick={() => onSwap(banner.id, "up")} className="text-muted-strong hover:text-foreground disabled:opacity-30">
            <ChevronUp size={14} />
          </button>
          <button type="button" disabled={isLast} onClick={() => onSwap(banner.id, "down")} className="text-muted-strong hover:text-foreground disabled:opacity-30">
            <ChevronDown size={14} />
          </button>
        </div>

        <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-[6px] border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-pasted preview URL */}
          <img src={banner.imageUrl} alt="" className="h-full w-full object-cover" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">{banner.headline}</span>
          <span className="truncate text-xs text-muted">
            {scheduled ? `Scheduled for ${new Date(banner.publishAt!).toLocaleString("en-NG")}` : banner.description || "No description"}
          </span>
        </div>

        <span className={`badge ${banner.enabled ? "badge-open" : "badge-neutral"}`}>{banner.enabled ? "Enabled" : "Disabled"}</span>

        <div className="flex shrink-0 items-center gap-2">
          <button type="button" disabled={busy} onClick={toggleEnabled} className="btn-ghost px-3 py-1.5 text-xs">
            {banner.enabled ? "Disable" : "Enable"}
          </button>
          <button type="button" onClick={() => setEditing((v) => !v)} className="btn-secondary px-3 py-1.5 text-xs">
            {editing ? "Close" : "Edit"}
          </button>
          <button type="button" disabled={busy} onClick={handleDelete} aria-label="Delete" className="text-danger hover:opacity-70">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {editing && (
        <BannerForm
          banner={{ ...banner, publishAt: banner.publishAt }}
          onDone={() => setEditing(false)}
        />
      )}
    </div>
  );
}
