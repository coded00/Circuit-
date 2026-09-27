"use client";

/**
 * Circuit — Admin → Content → Feed videos. Import the latest clips from
 * the curated YouTube channels (they arrive as drafts), then publish,
 * unpublish or reject each one — or publish every draft at once.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, EyeOff, Trash2 } from "lucide-react";

export type AdminVideo = { id: string; title: string; thumbnailUrl: string | null; sourceAuthor: string | null; sourceUrl: string | null; game: string | null; status: "DRAFT" | "PUBLISHED" | "ARCHIVED" };

export function VideoQueue({ videos, counts, youtubeConfigured }: { videos: AdminVideo[]; counts: { DRAFT: number; PUBLISHED: number }; youtubeConfigured: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<"DRAFT" | "PUBLISHED">(counts.DRAFT > 0 ? "DRAFT" : "PUBLISHED");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function call(key: string, url: string, method: string, body?: unknown) {
    setBusy(key);
    setMessage(null);
    const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setMessage(data?.error ?? "Something went wrong.");
      return null;
    }
    router.refresh();
    return data;
  }

  const shown = videos.filter((v) => v.status === tab);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!youtubeConfigured || busy !== null}
          title={youtubeConfigured ? undefined : "Set YOUTUBE_API_KEY to import"}
          onClick={async () => {
            const r = await call("import", "/api/admin/videos/import", "POST");
            if (r) setMessage(`Imported ${r.created} new clip${r.created === 1 ? "" : "s"} (${r.skipped} already here)${r.failedChannels.length ? ` — couldn't reach: ${r.failedChannels.join(", ")}` : ""}.`);
          }}
          className="btn-primary h-9 gap-1.5 px-4 text-sm"
        >
          <Download size={15} /> {busy === "import" ? "Importing…" : "Import latest from YouTube"}
        </button>
        {counts.DRAFT > 0 && (
          <button type="button" disabled={busy !== null} onClick={() => call("all", "/api/admin/videos", "POST", { action: "publish_all_drafts" })} className="btn-secondary h-9 px-4 text-sm">
            Publish all {counts.DRAFT} drafts
          </button>
        )}
        <div className="ml-auto flex rounded-[10px] border border-border p-0.5 text-sm">
          {(["DRAFT", "PUBLISHED"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-[8px] px-3 py-1 font-semibold ${tab === t ? "bg-surface-elevated text-foreground" : "text-muted"}`}>
              {t === "DRAFT" ? "Drafts" : "Live"} · {counts[t]}
            </button>
          ))}
        </div>
      </div>
      {message && <p className="text-sm text-muted">{message}</p>}
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{tab === "DRAFT" ? "No drafts — import to pull in new clips." : "Nothing live in the feed yet."}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((v) => (
            <div key={v.id} className="flex flex-col overflow-hidden rounded-[12px] border border-border bg-surface">
              <a href={v.sourceUrl ?? "#"} target="_blank" rel="noreferrer" className="relative block aspect-[9/12] bg-surface-elevated">
                {v.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail
                  <img src={v.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                )}
                {v.game && <span className="absolute top-2 left-2 rounded-[6px] bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">{v.game}</span>}
              </a>
              <div className="flex flex-1 flex-col gap-2 p-2.5">
                <p className="line-clamp-2 text-[13px] leading-snug font-medium">{v.title}</p>
                <p className="truncate text-[11px] text-muted">{v.sourceAuthor}</p>
                <div className="mt-auto flex gap-1.5">
                  {v.status === "DRAFT" ? (
                    <>
                      <button type="button" disabled={busy !== null} onClick={() => call(v.id, `/api/admin/videos/${v.id}`, "PATCH", { status: "PUBLISHED" })} className="btn-primary h-8 flex-1 gap-1 px-2 text-xs">
                        <Check size={13} /> Publish
                      </button>
                      <button type="button" disabled={busy !== null} onClick={() => call(v.id, `/api/admin/videos/${v.id}`, "PATCH", { status: "ARCHIVED" })} aria-label="Reject" className="btn-secondary h-8 px-2 text-xs">
                        <Trash2 size={13} />
                      </button>
                    </>
                  ) : (
                    <button type="button" disabled={busy !== null} onClick={() => call(v.id, `/api/admin/videos/${v.id}`, "PATCH", { status: "DRAFT" })} className="btn-secondary h-8 flex-1 gap-1 px-2 text-xs">
                      <EyeOff size={13} /> Unpublish
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
