import Link from "next/link";
import { Trophy, Swords, ClipboardList, Bell } from "lucide-react";

/**
 * Circuit — "Your Circuit" homepage section (MVP rework spec section 17,
 * logged-in only). Replaces the old right-rail "Your Channel" widget
 * (fabricated follower/view/stream stats — still on disk, unwired) with
 * real data: upcoming matches, registered competitions, active
 * challenges, and recent notifications, each already queried elsewhere
 * in this codebase (player profile, notifications) — same shapes, real
 * rows only. Deliberately compact per the spec's own "not a large
 * analytics dashboard" instruction — up to 3 rows per group, no
 * "View All" link where no real list page exists for that group yet.
 */

type UpcomingMatch = { id: string; matchCode: string; context: string };
type RegisteredCompetition = { id: string; tournamentId: string; name: string; game: string };
type ActiveChallenge = { id: string; game: string; status: string };
type RecentActivity = { id: string; message: string; href: string };

function EmptyRow({ label }: { label: string }) {
  return <p className="text-metadata">{label}</p>;
}

export function YourCircuit({
  upcomingMatches,
  registeredCompetitions,
  activeChallenges,
  recentActivity,
}: {
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

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-section-heading">Your Circuit</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card flex flex-col gap-2">
          <span className="text-eyebrow flex items-center gap-1.5">
            <Trophy size={12} />
            Upcoming Matches
          </span>
          {upcomingMatches.length === 0 ? (
            <EmptyRow label="Nothing scheduled." />
          ) : (
            upcomingMatches.map((m) => (
              <Link key={m.id} href={`/matches/${m.id}`} className="truncate text-sm hover:underline">
                {m.context}
              </Link>
            ))
          )}
        </div>

        <div className="card flex flex-col gap-2">
          <span className="text-eyebrow flex items-center gap-1.5">
            <ClipboardList size={12} />
            Registered Competitions
          </span>
          {registeredCompetitions.length === 0 ? (
            <EmptyRow label="None yet." />
          ) : (
            registeredCompetitions.map((r) => (
              <Link key={r.id} href={`/tournaments/${r.tournamentId}`} className="truncate text-sm hover:underline">
                {r.name}
              </Link>
            ))
          )}
        </div>

        <div className="card flex flex-col gap-2">
          <span className="text-eyebrow flex items-center gap-1.5 text-accent-orange">
            <Swords size={12} />
            Active Challenges
          </span>
          {activeChallenges.length === 0 ? (
            <EmptyRow label="None yet." />
          ) : (
            activeChallenges.map((c) => (
              <Link key={c.id} href={`/battles/${c.id}`} className="truncate text-sm hover:underline">
                {c.game}
              </Link>
            ))
          )}
        </div>

        <div className="card flex flex-col gap-2">
          <span className="text-eyebrow flex items-center gap-1.5">
            <Bell size={12} />
            Recent Activity
          </span>
          {recentActivity.length === 0 ? (
            <EmptyRow label="Nothing new." />
          ) : (
            recentActivity.map((n) => (
              <Link key={n.id} href={n.href} className="truncate text-sm hover:underline">
                {n.message}
              </Link>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
