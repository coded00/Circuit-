"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BannerRow } from "./BannerRow";
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

/** Swapping two rows' `order` values is the whole reorder mechanism —
 *  no separate position field, no drag-and-drop library. */
export function BannerList({ banners }: { banners: Banner[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function swap(id: string, direction: "up" | "down") {
    const idx = banners.findIndex((b) => b.id === id);
    const otherIdx = direction === "up" ? idx - 1 : idx + 1;
    if (otherIdx < 0 || otherIdx >= banners.length) return;
    const a = banners[idx];
    const b = banners[otherIdx];
    await Promise.all([
      fetch(`/api/admin/banners/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: b.order }),
      }),
      fetch(`/api/admin/banners/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: a.order }),
      }),
    ]);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      {banners.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">No banners yet — the homepage falls back to Circuit&apos;s default pitch.</p>
      ) : (
        banners.map((b, i) => (
          <BannerRow key={b.id} banner={b} isFirst={i === 0} isLast={i === banners.length - 1} onSwap={swap} />
        ))
      )}

      {creating ? (
        <BannerForm onDone={() => setCreating(false)} />
      ) : (
        <button type="button" onClick={() => setCreating(true)} className="btn-secondary mt-2 w-fit text-sm">
          + Add banner
        </button>
      )}
    </div>
  );
}
