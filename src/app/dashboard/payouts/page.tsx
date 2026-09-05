/**
 * Circuit — Payouts view (Build Plan P5-4, maps: ORG-4). Read-only escrow
 * visibility across every tournament the organizer runs — no action here
 * can release escrow itself, only REG-6/P2-6's own claim flow can.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
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
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Payouts</h1>

      <div className="card grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-muted">Total collected</div>
          <div className="font-mono text-lg font-semibold tabular-nums">{formatNaira(totalCollected)}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Total refunded</div>
          <div className="font-mono text-lg font-semibold tabular-nums">{formatNaira(totalRefunded)}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="card text-center text-muted">No money has moved through any of your tournaments yet.</p>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="px-4 pt-4 pb-2 font-medium">Tournament</th>
                <th className="px-4 pt-4 pb-2 text-right font-medium">Collected</th>
                <th className="px-4 pt-4 pb-2 text-right font-medium">Refunded</th>
                <th className="px-4 pt-4 pb-2 text-right font-medium">Prize payout</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.tournament.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/dashboard/tournaments/${row.tournament.id}`} className="hover:underline">
                      {row.tournament.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{formatNaira(row.collected)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{formatNaira(row.refunded)}</td>
                  <td className="px-4 py-3 text-right text-muted">
                    {row.payout ? (row.payout.status === "COMPLETE" ? "Sent" : "Processing") : "Not yet claimed"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
