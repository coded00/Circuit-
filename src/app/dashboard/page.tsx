/**
 * Circuit — Tournaments view, the dashboard's default panel. Kanban board
 * across the tournament lifecycle (Draft → Registration Open → Live →
 * Completed).
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
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Tournaments</h1>
        <Link href="/tournaments/new" className="btn-primary">
          Create a tournament
        </Link>
      </div>

      {tournaments.length === 0 ? (
        <p className="card text-center text-muted">You haven&apos;t created any tournaments yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 overflow-x-auto sm:grid-cols-2 lg:grid-cols-5">
          {COLUMNS.map((column) => {
            const items = tournaments.filter((t) => (column.statuses as readonly string[]).includes(t.status));
            return (
              <div key={column.title} className="flex min-w-0 flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">{column.title}</h2>
                  <span className="badge badge-neutral">{items.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {items.map((t) => (
                    <Link key={t.id} href={`/dashboard/tournaments/${t.id}`} className="card-row flex flex-col gap-1 p-3">
                      <span className="truncate font-medium">{t.name}</span>
                      <span className="truncate text-xs text-muted">
                        {t.game} ·{" "}
                        <span className="font-mono tabular-nums">
                          {t._count.registrations}/{t.participantCap}
                        </span>
                      </span>
                    </Link>
                  ))}
                  {items.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted">
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
