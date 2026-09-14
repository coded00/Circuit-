/**
 * Circuit — Payouts view (Build Plan P5-4, maps: ORG-4). Read-only escrow
 * visibility across every tournament the organizer runs — no action here
 * can release escrow itself, only REG-6/P2-6's own claim flow can.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

function formatNaira(kobo: number): string {
  return `₦ ${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

export default async function DashboardPayoutsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const tournaments = await prisma.tournament.findMany({
    where: { organizerId: user.id },
    orderBy: { createdAt: "desc" },
    include: { escrowTxns: true },
  });

  const rows = tournaments
    .map((t) => {
      const collected = t.escrowTxns
        .filter((e) => e.type === "ENTRY_FEE" && e.status === "COMPLETE")
        .reduce((sum, e) => sum + e.amount, 0);
      const refunded = t.escrowTxns.filter((e) => e.type === "REFUND").reduce((sum, e) => sum + e.amount, 0);
      const payout = t.escrowTxns.find((e) => e.type === "PRIZE_PAYOUT");
      return { tournament: t, collected, refunded, payout };
    })
    .filter((row) => row.collected > 0 || row.refunded > 0 || row.tournament.prizeAmount);

  const totalCollected = rows.reduce((sum, r) => sum + r.collected, 0);
  const totalRefunded = rows.reduce((sum, r) => sum + r.refunded, 0);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Payouts</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Total collected</span>
          <span className="text-stat text-2xl">{formatNaira(totalCollected)}</span>
        </div>
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Total refunded</span>
          <span className="text-stat text-2xl">{formatNaira(totalRefunded)}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="card text-center text-muted">No money has moved through any of your tournaments yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Tournament</th>
                <th>Collected</th>
                <th>Refunded</th>
                <th>Prize payout</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.tournament.id}>
                  <td>
                    <Link href={`/dashboard/tournaments/${row.tournament.id}`} className="font-medium hover:text-accent-blue">
                      {row.tournament.name}
                    </Link>
                  </td>
                  <td className="font-mono tabular-nums">{formatNaira(row.collected)}</td>
                  <td className="font-mono tabular-nums">{formatNaira(row.refunded)}</td>
                  <td>{row.payout ? (row.payout.status === "COMPLETE" ? "Sent" : "Processing") : "Not yet claimed"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
