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
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

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

  const PAGE = 25;
  const term = query.trim().toLowerCase();
  const matching = videos.filter(
    (v) => v.status === tab && (!term || [v.title, v.sourceAuthor, v.game].some((f) => f?.toLowerCase().includes(term)))
  );
  const pages = Math.max(1, Math.ceil(matching.length / PAGE));
  const current = Math.min(page, pages);
  const shown = matching.slice((current - 1) * PAGE, current * PAGE);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-[8px] border border-border bg-background p-0.5 text-[13px]" role="tablist" aria-label="Video status">
          {(["DRAFT", "PUBLISHED"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setPage(1);
              }}
              className={`rounded-[6px] px-2.5 py-1 font-medium ${tab === t ? "bg-surface-elevated text-foreground" : "text-muted hover:text-foreground"}`}
            >
              {t === "DRAFT" ? "Drafts" : "Live in feed"} <span className="text-muted-strong tabular-nums">{counts[t]}</span>
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search title, channel or game"
          aria-label="Search videos"
          className="field-input !w-auto min-w-[220px] flex-1 sm:max-w-[300px]"
        />
        <div className="ml-auto flex flex-wrap gap-2">
          {tab === "DRAFT" && counts.DRAFT > 0 && (
            <button type="button" disabled={busy !== null} onClick={() => call("all", "/api/admin/videos", "POST", { action: "publish_all_drafts" })} className="btn-secondary">
              {busy === "all" ? "Publishing…" : `Publish all ${counts.DRAFT}`}
            </button>
          )}
          <button
            type="button"
            disabled={!youtubeConfigured || busy !== null}
            title={youtubeConfigured ? undefined : "Set YOUTUBE_API_KEY to import"}
            onClick={async () => {
              const r = await call("import", "/api/admin/videos/import", "POST");
              if (r) setMessage(`Imported ${r.created} new clip${r.created === 1 ? "" : "s"} (${r.skipped} already here)${r.failedChannels.length ? ` — couldn't reach: ${r.failedChannels.join(", ")}` : ""}.`);
            }}
            className="btn-primary"
          >
            <Download size={14} /> {busy === "import" ? "Importing…" : "Import from YouTube"}
          </button>
        </div>
      </div>
      {message && <p className="text-[13px] text-muted">{message}</p>}
      {shown.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-border-strong px-6 py-10 text-center text-[13px] text-muted">
          {term ? "No videos match that search." : tab === "DRAFT" ? "No drafts — import to pull in new clips." : "Nothing live in the feed yet."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-border bg-surface">
          {shown.map((v) => (
            <div key={v.id} className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0">
              <a href={v.sourceUrl ?? "#"} target="_blank" rel="noreferrer" className="relative block h-[54px] w-[40px] shrink-0 overflow-hidden rounded-[5px] bg-surface-elevated">
                {v.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail
                  <img src={v.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                )}
              </a>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <a href={v.sourceUrl ?? "#"} target="_blank" rel="noreferrer" className="truncate text-[13px] font-medium text-foreground hover:underline">
                  {v.title}
                </a>
                <span className="truncate text-[12px] text-muted">
                  {v.sourceAuthor}
                  {v.game ? ` · ${v.game}` : ""}
                </span>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {v.status === "DRAFT" ? (
                  <>
                    <button type="button" disabled={busy !== null} onClick={() => call(v.id, `/api/admin/videos/${v.id}`, "PATCH", { status: "PUBLISHED" })} className="btn-secondary !min-h-8 !px-2.5 !text-[12px]">
                      <Check size={13} /> Publish
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => call(v.id, `/api/admin/videos/${v.id}`, "PATCH", { status: "ARCHIVED" })}
                      aria-label="Reject"
                      title="Reject (archive)"
                      className="btn-ghost !min-h-8 !px-2 hover:!text-danger"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                ) : (
                  <button type="button" disabled={busy !== null} onClick={() => call(v.id, `/api/admin/videos/${v.id}`, "PATCH", { status: "DRAFT" })} className="btn-ghost !min-h-8 !px-2.5 !text-[12px]">
                    <EyeOff size={13} /> Unpublish
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {matching.length > PAGE && (
        <div className="flex items-center justify-between text-[12px] text-muted">
          <span className="tabular-nums">
            {(current - 1) * PAGE + 1}–{Math.min(current * PAGE, matching.length)} of {matching.length}
          </span>
          <div className="flex gap-1.5">
            <button type="button" disabled={current === 1} onClick={() => setPage(current - 1)} className="btn-secondary !min-h-8 !px-2.5 !text-[12px] disabled:opacity-40">
              Previous
            </button>
            <button type="button" disabled={current === pages} onClick={() => setPage(current + 1)} className="btn-secondary !min-h-8 !px-2.5 !text-[12px] disabled:opacity-40">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
