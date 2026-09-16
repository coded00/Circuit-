import Link from "next/link";
import { Trophy, Swords, Calendar, Bell, Gamepad2, AlertTriangle, ChevronRight } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";

/**
 * Circuit — "Your Circuit" homepage section, rebuilt against a design
 * brief benchmarked from another platform's dashboard (see
 * your-circuit-dashboard-design-brief.md). Per that brief's own explicit
 * instruction, every value below is a real Circuit design-system token,
 * not the brief's placeholder hex codes/sizes — and every number/name
 * shown is real data already fetched in src/app/page.tsx, never the
 * brief's example content.
 *
 * Two deliberate departures from the brief, both flagged per its own
 * "flag gaps rather than invent" instruction:
 *
 * 1. **Per-category accent colors.** Circuit has no named "matches
 *    purple / competitions green / challenges red / activity blue"
 *    palette. Mapped onto Circuit's real existing accents instead:
 *    Matches → accent-blue, Competitions → success, Challenges →
 *    accent-orange (already the exact convention this component used
 *    before this rebuild), Activity → live (the same red Circuit already
 *    uses for unread/urgent indicators elsewhere), with `warning` (the
 *    same "needs attention" token used everywhere else in the app)
 *    reserved for flagged/dispute activity rows specifically.
 * 2. **Illustrations.** The brief's bespoke character renders and
 *    official game logos aren't real, licensed Circuit assets. Using
 *    `GameArtTile` instead — Circuit's own existing, already-approved
 *    per-game art/gradient treatment, used everywhere else a game needs
 *    a visual identity. Never rendered for a category with no real game
 *    attached to it.
 *
 * "View All" style follows Circuit's own existing convention for this
 * exact affordance elsewhere on this same homepage (plain accent-colored
 * text + arrow, e.g. the Leaderboard widget's "View All →") rather than
 * the brief's pill-button treatment, which doesn't otherwise exist here.
 * Omitted entirely where no real destination exists yet (there's no
 * "all my upcoming matches" list page) rather than linking to nothing.
 */

type UpcomingMatch = { id: string; matchCode: string; opponent: string; game: string | null; context: string | null };
type RegisteredCompetition = {
  id: string;
  tournamentId: string;
  name: string;
  game: string;
  startsOn: string;
  prizeAmount: number | null;
  entryFee: number;
  registered: number;
  participantCap: number;
};
type ActiveChallenge = { id: string; game: string; statusLabel: string; stakeAmount: number };
type RecentActivity = { id: string; message: string; href: string; time: string; flagged: boolean };

// Every class string below is written out literally (never string-built at
// runtime) so Tailwind's compiler can actually find and generate it — a
// computed class name like `bg-${accent}` would silently produce no CSS.
const ACCENT = {
  matches: {
    text: "text-accent-blue",
    border: "border-accent-blue/25",
    chip: "bg-accent-blue-soft text-accent-blue",
    solidButton: "bg-accent-blue text-white hover:brightness-95",
  },
  competitions: {
    text: "text-success",
    border: "border-success/25",
    chip: "bg-success/15 text-success",
    solidButton: "bg-success text-white hover:brightness-95",
  },
  challenges: {
    text: "text-accent-orange",
    border: "border-accent-orange/25",
    chip: "bg-accent-orange-soft text-accent-orange",
    solidButton: "bg-accent-orange text-white hover:brightness-95",
  },
  activity: {
    text: "text-live",
    border: "border-live/25",
    chip: "bg-live-soft text-live",
    solidButton: "bg-live text-white hover:brightness-95",
  },
} as const;

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

function Pill({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="badge bg-surface-elevated text-foreground">
      {icon}
      {children}
    </span>
  );
}

function ViewAllLink({ href, label, accent }: { href: string; label: string; accent: string }) {
  return (
    <Link href={href} className={`flex shrink-0 items-center gap-0.5 text-xs font-medium hover:underline ${accent}`}>
      {label} <ChevronRight size={13} />
    </Link>
  );
}

function CardHeader({
  icon,
  label,
  accent,
  viewAll,
}: {
  icon: React.ReactNode;
  label: string;
  accent: string;
  viewAll?: { href: string; label: string };
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={`text-eyebrow flex items-center gap-1.5 ${accent}`}>
        {icon}
        {label}
      </span>
      {viewAll && <ViewAllLink href={viewAll.href} label={viewAll.label} accent={accent} />}
    </div>
  );
}

/** Content-left, art-bleeding-right hero layout shared by Matches & Competitions — same gradient-fade-over-GameArtTile technique already used on the match/profile hero treatments elsewhere in the app. */
function HeroCard({
  accent,
  game,
  children,
}: {
  accent: (typeof ACCENT)[keyof typeof ACCENT];
  game: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className={`card card-hover relative flex min-h-[220px] flex-col gap-4 overflow-hidden border ${accent.border}`}>
      {game && (
        <>
          {/* These cards sit in a 2-up grid that can reach ~650-700px wide
              on a large/ultrawide desktop (well past GameArtTile's 480px
              default source width) — a wider source keeps the art crisp
              instead of visibly upscaled there. */}
          <GameArtTile game={game} fill hideLabel imgWidth={800} className="opacity-40" />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ backgroundImage: "linear-gradient(100deg, var(--surface) 40%, transparent 85%)" }}
          />
        </>
      )}
      <div className="relative z-10 flex h-full flex-col gap-4">{children}</div>
    </div>
  );
}

export function YourCircuit({
  viewerHandle,
  upcomingMatches,
  registeredCompetitions,
  activeChallenges,
  recentActivity,
}: {
  viewerHandle: string;
  upcomingMatches: UpcomingMatch[];
  registeredCompetitions: RegisteredCompetition[];
  activeChallenges: ActiveChallenge[];
  recentActivity: RecentActivity[];
}) {
  const nothing =
    upcomingMatches.length === 0 &&
    registeredCompetitions.length === 0 &&
    activeChallenges.length === 0 &&
    recentActivity.length === 0;

  if (nothing) return null;

  const match = upcomingMatches[0];
  const competition = registeredCompetitions[0];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-section-heading">Your Circuit</h2>
          <p className="text-metadata">Everything you need, all in one place.</p>
        </div>
        <ViewAllLink href={`/players/${viewerHandle}`} label="View All" accent="text-accent-blue" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Upcoming Matches */}
        <HeroCard accent={ACCENT.matches} game={match?.game ?? null}>
          <CardHeader icon={<Calendar size={12} />} label="Upcoming Matches" accent={ACCENT.matches.text} />
          {!match ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
              <p className="text-sm text-muted">Nothing scheduled yet.</p>
              <Link href="/battles" className={`text-sm font-medium hover:underline ${ACCENT.matches.text}`}>
                Find a Challenge →
              </Link>
            </div>
          ) : (
            <div className="flex flex-1 flex-col justify-end gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-card-title font-bold">vs {match.opponent}</span>
                <span className="text-metadata">
                  {match.game ?? "Match"}
                  {match.context ? ` · ${match.context}` : ""}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Pill icon={<Gamepad2 size={11} />}>Match code {match.matchCode}</Pill>
              </div>
              <Link href={`/matches/${match.id}`} className={`btn-primary w-fit ${ACCENT.matches.solidButton}`}>
                View Match <ChevronRight size={14} />
              </Link>
            </div>
          )}
        </HeroCard>

        {/* Registered Competitions */}
        <HeroCard accent={ACCENT.competitions} game={competition?.game ?? null}>
          <CardHeader
            icon={<Trophy size={12} />}
            label="Registered Competitions"
            accent={ACCENT.competitions.text}
            viewAll={{ href: `/players/${viewerHandle}?tab=tournaments`, label: "View All" }}
          />
          {!competition ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
              <p className="text-sm text-muted">No competitions yet.</p>
              <Link href="/compete" className={`text-sm font-medium hover:underline ${ACCENT.competitions.text}`}>
                Browse open tournaments →
              </Link>
            </div>
          ) : (
            <div className="flex flex-1 flex-col justify-end gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-card-title truncate font-bold">{competition.name}</span>
                <span className="text-metadata">
                  {competition.game} · Starts {competition.startsOn}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Pill>
                  {competition.registered}/{competition.participantCap} players
                </Pill>
                <Pill>{competition.prizeAmount ? formatNaira(competition.prizeAmount) : competition.entryFee === 0 ? "Free entry" : formatNaira(competition.entryFee)}</Pill>
              </div>
              <Link href={`/tournaments/${competition.tournamentId}`} className={`btn-primary w-fit ${ACCENT.competitions.solidButton}`}>
                View Competition <ChevronRight size={14} />
              </Link>
            </div>
          )}
        </HeroCard>

        {/* Active Challenges */}
        <div className={`card flex flex-col gap-3 border ${ACCENT.challenges.border}`}>
          <CardHeader
            icon={<Swords size={12} />}
            label="Active Challenges"
            accent={ACCENT.challenges.text}
            viewAll={{ href: "/battles", label: "View All" }}
          />
          {activeChallenges.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
              <p className="text-sm text-muted">No active Challenges.</p>
              <Link href="/battles" className={`text-sm font-medium hover:underline ${ACCENT.challenges.text}`}>
                Find a Challenge →
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {activeChallenges.map((c) => (
                <Link key={c.id} href={`/battles/${c.id}`} className="card-row flex items-center gap-3 p-3">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-[8px]">
                    <GameArtTile game={c.game} className="h-full w-full" hideLabel />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">
                      {c.game}
                      {c.stakeAmount > 0 && <span className={ACCENT.challenges.text}> · {formatNaira(c.stakeAmount)}</span>}
                    </span>
                    <span className="truncate text-metadata">{c.statusLabel}</span>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-muted" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className={`card flex flex-col gap-3 border ${ACCENT.activity.border}`}>
          <CardHeader
            icon={<Bell size={12} />}
            label="Recent Activity"
            accent={ACCENT.activity.text}
            viewAll={{ href: "/notifications", label: "View All" }}
          />
          {recentActivity.length === 0 ? (
            <p className="flex flex-1 items-center justify-center py-6 text-center text-sm text-muted">Nothing new.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentActivity.map((n) => (
                <Link key={n.id} href={n.href} className="card-row flex items-center gap-3 p-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      n.flagged ? "bg-warning/15 text-warning" : ACCENT.activity.chip
                    }`}
                  >
                    {n.flagged ? <AlertTriangle size={15} /> : <Bell size={15} />}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm">{n.message}</span>
                    <span className="text-metadata">{n.time}</span>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-muted" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
