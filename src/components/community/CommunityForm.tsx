"use client";

/**
 * Circuit — create a community, or edit one's details (settings →
 * Overview). The link (slug) follows the name until it's edited by hand,
 * and can't change after creation (shared links would break).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { OptionCard } from "@/components/OptionCard";
import { ImageUploadField, BANNER_BOUNDS } from "@/components/ImageUploadField";
import { COMMUNITY_CATEGORIES, slugify } from "@/lib/communityRules";

type JoinPolicy = "OPEN" | "APPLY" | "INVITE";

export type CommunityFormValues = {
  category: string;
  name: string;
  slug: string;
  description: string;
  tag: string;
  gameId: string;
  region: string;
  joinPolicy: JoinPolicy;
  rules: string;
  applicationQuestion: string;
  iconUrl: string;
  bannerUrl: string;
};

const EMPTY: CommunityFormValues = {
  category: "",
  name: "",
  slug: "",
  description: "",
  tag: "",
  gameId: "",
  region: "",
  joinPolicy: "OPEN",
  rules: "",
  applicationQuestion: "",
  iconUrl: "",
  bannerUrl: "",
};

const POLICIES: { value: JoinPolicy; title: string; description: string }[] = [
  { value: "OPEN", title: "Open", description: "Listed in discovery. Anyone can join." },
  { value: "APPLY", title: "Apply to join", description: "Listed. You approve each new member." },
  { value: "INVITE", title: "Invite only", description: "Hidden. Only people with a link get in." },
];

type Field = keyof CommunityFormValues;

export function CommunityForm({
  mode,
  games,
  initial,
  communityId,
  /** Game hubs and the Circuit community keep their name, game and join rule. */
  lockedIdentity = false,
}: {
  mode: "create" | "edit";
  games: { id: string; name: string }[];
  initial?: Partial<CommunityFormValues>;
  communityId?: string;
  lockedIdentity?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<CommunityFormValues>({ ...EMPTY, ...initial });
  const [slugEdited, setSlugEdited] = useState(mode === "edit");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadsBlocked, setUploadsBlocked] = useState({ icon: false, banner: false });
  const [saved, setSaved] = useState(false);

  function set<K extends Field>(key: K, value: CommunityFormValues[K]) {
    setSaved(false);
    setValues((v) => ({ ...v, [key]: value, ...(key === "name" && !slugEdited ? { slug: slugify(String(value)) } : {}) }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    const body = {
      ...(lockedIdentity ? {} : { name: values.name, category: values.category, gameId: values.gameId || null, joinPolicy: values.joinPolicy }),
      ...(mode === "create" ? { slug: values.slug } : {}),
      description: values.description,
      tag: values.tag,
      region: values.region,
      rules: values.rules,
      applicationQuestion: values.applicationQuestion,
      iconUrl: values.iconUrl || null,
      bannerUrl: values.bannerUrl || null,
    };
    let res: Response;
    try {
      res = await fetch(mode === "create" ? "/api/communities" : `/api/communities/${communityId}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setFormError("We couldn't reach Circuit. Check your connection and try again.");
      setBusy(false);
      return;
    }
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      if (data?.field) setErrors({ [data.field as Field]: data.error });
      else setFormError(data?.error ?? "Something went wrong. Try again.");
      return;
    }
    if (mode === "create") {
      // replace: Back shouldn't reopen a form that was already submitted.
      router.replace(data.href);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const input = "field-input";
  const err = (f: Field) => errors[f] && <p className="field-error">{errors[f]}</p>;

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {!lockedIdentity && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="c-name" className="field-label">
            Name
          </label>
          <input id="c-name" className={input} value={values.name} onChange={(e) => set("name", e.target.value)} maxLength={40} placeholder="e.g. UNILAG Esports" />
          {err("name")}
        </div>
      )}

      {!lockedIdentity && (
        <fieldset className="flex flex-col gap-2">
          <legend className="field-label mb-1.5">Category</legend>
          <div className="flex flex-wrap gap-2">
            {COMMUNITY_CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-pressed={values.category === c.value}
                onClick={() => set("category", c.value)}
                className={`h-9 cut-xs border px-3.5 text-sm font-semibold transition ${
                  values.category === c.value ? "border-foreground bg-foreground text-background" : "border-border hover:border-border-hover"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          {err("category")}
        </fieldset>
      )}

      {mode === "create" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="c-slug" className="field-label">
            Link
          </label>
          <div className="flex items-center rounded-[10px] border border-border bg-surface focus-within:border-border-strong">
            <span className="pl-3 font-mono text-sm text-muted-strong">circuit/communities/</span>
            <input
              id="c-slug"
              className="h-11 min-w-0 flex-1 bg-transparent pr-3 font-mono text-sm outline-none"
              value={values.slug}
              onChange={(e) => {
                setSlugEdited(true);
                set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
              }}
              maxLength={32}
            />
          </div>
          <span className="field-hint">Can&apos;t be changed later. It&apos;s in every link you share.</span>
          {err("slug")}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="c-desc" className="field-label">
          What&apos;s it about?
        </label>
        <textarea
          id="c-desc"
          className={`${input} min-h-[88px] resize-y`}
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          maxLength={300}
          placeholder="Who it's for and what happens here."
        />
        <span className="field-hint">{values.description.length}/300</span>
        {err("description")}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {!lockedIdentity && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="c-game" className="field-label">
              Main game
            </label>
            <select id="c-game" className="field-select" value={values.gameId} onChange={(e) => set("gameId", e.target.value)}>
              <option value="">Any / several</option>
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            {err("gameId")}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="c-region" className="field-label">
            City or state
          </label>
          <input id="c-region" className={input} value={values.region} onChange={(e) => set("region", e.target.value)} maxLength={60} placeholder="e.g. Lagos" />
          {err("region")}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="c-tag" className="field-label">
            Tag
          </label>
          <input
            id="c-tag"
            className={`${input} font-mono uppercase`}
            value={values.tag}
            onChange={(e) => set("tag", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
            placeholder="e.g. ULAG"
          />
          <span className="field-hint">2–5 letters members can wear by their name.</span>
          {err("tag")}
        </div>
      </div>

      {!lockedIdentity && (
        <fieldset className="flex flex-col gap-2">
          <legend className="field-label mb-1.5">Who can join?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {POLICIES.map((p) => (
              <OptionCard key={p.value} selected={values.joinPolicy === p.value} onSelect={() => set("joinPolicy", p.value)} title={p.title} description={p.description} />
            ))}
          </div>
        </fieldset>
      )}

      {values.joinPolicy === "APPLY" && !lockedIdentity && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="c-question" className="field-label">
            Question for applicants (optional)
          </label>
          <input
            id="c-question"
            className={input}
            value={values.applicationQuestion}
            onChange={(e) => set("applicationQuestion", e.target.value)}
            maxLength={200}
            placeholder="e.g. What's your in-game name and rank?"
          />
          {err("applicationQuestion")}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="c-rules" className="field-label">
          Rules
        </label>
        <textarea
          id="c-rules"
          className={`${input} min-h-[110px] resize-y`}
          value={values.rules}
          onChange={(e) => set("rules", e.target.value)}
          maxLength={2000}
          placeholder={"1. Respect everyone.\n2. No cheating or cheat talk.\n3. Keep clips in #clips."}
        />
        <span className="field-hint">New members agree to these before they can join.</span>
        {err("rules")}
      </div>

      <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col gap-1.5">
        <ImageUploadField
          purpose="community-icon"
          label="Icon"
          value={values.iconUrl}
          onChange={(url) => set("iconUrl", url)}
          onValidityChange={(blocked) => setUploadsBlocked((b) => ({ ...b, icon: blocked }))}
          hint="Square works best."
        />
        {err("iconUrl")}
        </div>
        <ImageUploadField
          purpose="community-banner"
          label="Banner (optional)"
          value={values.bannerUrl}
          bounds={BANNER_BOUNDS}
          onChange={(url) => set("bannerUrl", url)}
          onValidityChange={(blocked) => setUploadsBlocked((b) => ({ ...b, banner: blocked }))}
        />
      </div>

      {formError && <p className="field-error">{formError}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy || uploadsBlocked.icon || uploadsBlocked.banner} className="btn-primary h-11 px-6">
          {busy ? (mode === "create" ? "Creating…" : "Saving…") : mode === "create" ? "Create community" : "Save changes"}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-success">
            <Check size={15} /> Saved
          </span>
        )}
      </div>
    </form>
  );
}
