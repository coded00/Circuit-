/**
 * Circuit — Tournaments view, the dashboard's default panel (Build Plan
 * P5-1, maps: ORG-1). Kanban board across the tournament lifecycle
 * (Draft → Registration Open → Live → Completed), per
 * docs/circuit-ui-references.md's Linear reference — "a natural fit for
 * an organizer tracking multiple tournaments across their lifecycle
 * stages."
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

const COLUMNS = [
  { statuses: ["DRAFT"], title: "Draft" },
  { statuses: ["OPEN", "CLOSED"], title: "Registration Open" },
  { statuses: ["LIVE"], title: "Live" },
  { statuses: ["COMPLETE"], title: "Completed" },
  { statuses: ["CANCELLED"], title: "Cancelled" },
] as const;

export default async function DashboardTournamentsPage() {
  const user = await getCurrentUser();
  if (!user) return null; // layout already redirects; satisfies the type checker

  const tournaments = await prisma.tournament.findMany({
    where: { organizerId: user.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { registrations: { where: { status: "CONFIRMED" } } } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tournaments</h1>
        <Link href="/tournaments/new" className="btn-primary">
          Create a tournament
        </Link>
      </div>

      {tournaments.length === 0 ? (
        <p className="card text-center text-muted">You haven&apos;t created any tournaments yet.</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((column) => {
            const items = tournaments.filter((t) => (column.statuses as readonly string[]).includes(t.status));
            return (
              <div key={column.title} className="flex w-64 shrink-0 flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-xs font-bold tracking-wide text-muted uppercase">{column.title}</h2>
                  <span className="font-mono text-xs tabular-nums text-muted">{items.length}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {items.map((t) => (
                    <Link key={t.id} href={`/dashboard/tournaments/${t.id}`} className="card-row flex flex-col gap-1 p-2.5">
                      <span className="font-medium">{t.name}</span>
                      <span className="text-xs text-muted">
                        {t.game} ·{" "}
                        <span className="font-mono tabular-nums">
                          {t._count.registrations}/{t.participantCap}
                        </span>
                      </span>
                    </Link>
                  ))}
                  {items.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border p-2.5 text-center text-xs text-muted">
                      Nothing here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
