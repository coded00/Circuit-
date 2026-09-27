"use client";

/**
 * Circuit — first-run onboarding: games → city → interests → communities
 * picked for you. Each step can be skipped; "Enter Circuit" (or skipping)
 * continues to where they were going.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, MapPin } from "lucide-react";
import { CommunityAvatar } from "@/components/community/CommunityAvatar";

type Option = { id: string; name: string; iconUrl: string | null };
type Rec = { id: string; href: string; name: string; description: string | null; iconUrl: string | null; tag: string | null; memberCount: number; hasRules: boolean; joinPolicy: string };
type Group = { reason: string; items: Rec[] };

const STEPS = ["Games", "City", "Interests", "Communities"] as const;

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex h-11 items-center gap-2 rounded-full border pr-4 pl-1.5 text-sm font-semibold transition ${
        on ? "border-accent-volt bg-accent-volt text-accent-volt-foreground" : "border-white/[0.12] bg-white/[0.04] hover:border-white/25"
      }`}
    >
      {children}
      {on && <Check size={14} />}
    </button>
  );
}

function OptionIcon({ option }: { option: Option }) {
  return option.iconUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- catalog/community icon
    <img src={option.iconUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
  ) : (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-bold">{option.name.slice(0, 1)}</span>
  );
}

export function WelcomeFlow({
  displayName,
  next,
  games,
  cities,
  interests,
  initialGameIds,
  initialRegion,
}: {
  displayName: string;
  next: string;
  games: Option[];
  cities: (Option & { region: string | null })[];
  interests: (Option & { description: string | null })[];
  initialGameIds: string[];
  initialRegion: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [gameIds, setGameIds] = useState<Set<string>>(new Set(initialGameIds));
  const [cityId, setCityId] = useState<string | null>(() => cities.find((c) => c.region && initialRegion && c.region.toLowerCase() === initialRegion.toLowerCase())?.id ?? null);
  const [region, setRegion] = useState(initialRegion);
  const [interestIds, setInterestIds] = useState<Set<string>>(new Set());
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (set: Set<string>, id: string) => {
    const nextSet = new Set(set);
    if (nextSet.has(id)) nextSet.delete(id);
    else nextSet.add(id);
    return nextSet;
  };

  async function saveAndRecommend() {
    setBusy(true);
    setError(null);
    const city = cities.find((c) => c.id === cityId);
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameIds: [...gameIds], cityId, region: region.trim() || city?.region || null, interestIds: [...interestIds] }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError("Couldn't save that — try again.");
    setGroups(((await res.json()) as { groups: Group[] }).groups);
    setStep(3);
  }

  async function join(rec: Rec) {
    const res = await fetch(`/api/communities/${rec.id}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
    if (res?.ok) setJoined((s) => new Set(s).add(rec.id));
  }

  async function finish() {
    setBusy(true);
    await fetch("/api/onboarding", { method: "PATCH" }).catch(() => null);
    router.replace(next);
  }

  const counts = [gameIds.size, cityId || region.trim() ? 1 : 0, interestIds.size];

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex gap-1.5" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-accent-volt" : "bg-white/10"}`} aria-current={i === step ? "step" : undefined}>
            <span className="sr-only">{label}</span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="flex flex-col gap-4">
          <div>
            <p className="font-mono text-[11px] font-semibold tracking-[0.16em] text-white/50 uppercase">Welcome, {displayName}</p>
            <h1 className="font-display text-3xl leading-[1] font-bold tracking-tight uppercase">What do you play?</h1>
            <p className="mt-2 text-sm text-white/60">We&apos;ll put you in each game&apos;s official community.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {games.map((g) => (
              <Chip key={g.id} on={gameIds.has(g.id)} onClick={() => setGameIds((s) => toggle(s, g.id))}>
                <OptionIcon option={g} /> {g.name}
              </Chip>
            ))}
            {games.length === 0 && <p className="text-sm text-white/60">No games are listed yet.</p>}
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="flex flex-col gap-4">
          <div>
            <h1 className="font-display text-3xl leading-[1] font-bold tracking-tight uppercase">Where are you?</h1>
            <p className="mt-2 text-sm text-white/60">Find players and meetups near you.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {cities.map((c) => (
              <Chip
                key={c.id}
                on={cityId === c.id}
                onClick={() => {
                  setCityId(cityId === c.id ? null : c.id);
                  setRegion(cityId === c.id ? "" : (c.region ?? c.name));
                }}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                  <MapPin size={14} />
                </span>
                {c.name}
              </Chip>
            ))}
          </div>
          <label className="flex flex-col gap-1.5 text-sm text-white/60">
            Somewhere else?
            <input
              value={cityId ? "" : region}
              onChange={(e) => {
                setCityId(null);
                setRegion(e.target.value);
              }}
              placeholder="Type your city or state"
              maxLength={60}
              className="h-11 rounded-[12px] border border-white/[0.12] bg-white/[0.04] px-4 text-[15px] text-white outline-none placeholder:text-white/35 focus:border-white/30"
            />
          </label>
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-4">
          <div>
            <h1 className="font-display text-3xl leading-[1] font-bold tracking-tight uppercase">What are you into?</h1>
            <p className="mt-2 text-sm text-white/60">Pick any — you can join more later.</p>
          </div>
          <div className="flex flex-col gap-2">
            {interests.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => setInterestIds((s) => toggle(s, i.id))}
                aria-pressed={interestIds.has(i.id)}
                className={`flex items-start gap-3 rounded-[14px] border p-3.5 text-left transition ${
                  interestIds.has(i.id) ? "border-accent-volt bg-accent-volt/10" : "border-white/[0.12] bg-white/[0.03] hover:border-white/25"
                }`}
              >
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border ${interestIds.has(i.id) ? "border-accent-volt bg-accent-volt text-accent-volt-foreground" : "border-white/25"}`}>
                  {interestIds.has(i.id) && <Check size={13} />}
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">{i.name}</span>
                  {i.description && <span className="text-[13px] text-white/55">{i.description}</span>}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 3 && groups && (
        <section className="flex flex-col gap-5">
          <div>
            <h1 className="font-display text-3xl leading-[1] font-bold tracking-tight uppercase">You&apos;re in</h1>
            <p className="mt-2 text-sm text-white/60">We added you to Circuit Global and the official communities you picked. A few more you might like:</p>
          </div>
          {groups.length === 0 ? (
            <p className="text-sm text-white/60">No player communities match yet — you could start the first one.</p>
          ) : (
            groups.map((g) => (
              <div key={g.reason} className="flex flex-col gap-2">
                <p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-white/50 uppercase">{g.reason}</p>
                {g.items.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 rounded-[14px] border border-white/[0.1] bg-white/[0.03] p-3">
                    <CommunityAvatar name={r.name} iconUrl={r.iconUrl} tag={r.tag} size="md" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold">{r.name}</span>
                      <span className="truncate text-xs text-white/50">
                        {r.memberCount} member{r.memberCount === 1 ? "" : "s"}
                        {r.description ? ` · ${r.description}` : ""}
                      </span>
                    </span>
                    {joined.has(r.id) ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-accent-volt">
                        <Check size={13} /> Joined
                      </span>
                    ) : r.joinPolicy === "OPEN" && !r.hasRules ? (
                      <button type="button" onClick={() => join(r)} className="h-9 rounded-full bg-white px-4 text-sm font-semibold text-black hover:bg-white/90">
                        Join
                      </button>
                    ) : (
                      <Link href={r.href} target="_blank" className="h-9 rounded-full border border-white/20 px-4 text-sm leading-9 font-semibold hover:border-white/40">
                        View
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </section>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        {step < 2 && (
          <button type="button" onClick={() => setStep(step + 1)} className="btn-primary h-12 flex-1 gap-2 text-[15px]">
            {counts[step] > 0 ? "Continue" : "Skip this step"} <ArrowRight size={16} />
          </button>
        )}
        {step === 2 && (
          <button type="button" onClick={saveAndRecommend} disabled={busy} className="btn-primary h-12 flex-1 gap-2 text-[15px]">
            {busy ? "Setting things up…" : "Show my communities"} <ArrowRight size={16} />
          </button>
        )}
        {step === 3 && (
          <button type="button" onClick={finish} disabled={busy} className="btn-primary h-12 flex-1 gap-2 text-[15px]">
            Enter Circuit <ArrowRight size={16} />
          </button>
        )}
        {step > 0 && step < 3 && (
          <button type="button" onClick={() => setStep(step - 1)} className="h-12 px-3 text-sm font-semibold text-white/60 hover:text-white">
            Back
          </button>
        )}
      </div>
      {step < 3 && (
        <button type="button" onClick={() => router.replace(next)} className="w-fit text-sm text-white/45 hover:text-white/80">
          Skip for now — I&apos;ll do this later
        </button>
      )}
    </div>
  );
}
