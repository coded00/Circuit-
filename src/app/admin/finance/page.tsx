/**
 * Circuit — Admin Finance (Phase 4). Top metrics and the transaction
 * table both come straight from the two real ledgers Circuit already
 * keeps: `WalletTransaction` (deposits/withdrawals/entry-fee debits,
 * per-user) and `EscrowTransaction` (entry fees/refunds/prize payouts,
 * per-tournament). "Revenue" is the same honest number the Overview page
 * uses — gross completed entry-fee volume, not a fabricated commission
 * (see that page's own header comment for why).
 */

import Link from "next/link";
import type { Prisma, WalletTransactionType, WalletTransactionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

type SearchParams = { q?: string; type?: string; status?: string };

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function typeLabel(type: string): string {
  if (type === "FUND") return "Deposit";
  if (type === "WITHDRAWAL") return "Withdrawal";
  return "Entry fee";
}

const TYPE_OPTIONS: { value: WalletTransactionType | ""; label: string }[] = [
  { value: "", label: "Any type" },
  { value: "FUND", label: "Deposit" },
  { value: "WITHDRAWAL", label: "Withdrawal" },
  { value: "ENTRY_FEE_DEBIT", label: "Entry fee" },
];

const STATUS_OPTIONS: { value: WalletTransactionStatus | ""; label: string }[] = [
  { value: "", label: "Any status" },
  { value: "PENDING", label: "Pending" },
  { value: "COMPLETE", label: "Complete" },
  { value: "FAILED", label: "Failed" },
];

export default async function AdminFinancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { q, type, status } = await searchParams;

  const and: Prisma.WalletTransactionWhereInput[] = [];
  if (q?.trim()) {
    const term = q.trim();
    and.push({
      user: {
        OR: [
          { displayName: { contains: term, mode: "insensitive" } },
          { handle: { contains: term, mode: "insensitive" } },
        ],
      },
    });
  }
  if (type) and.push({ type: type as WalletTransactionType });
  if (status) and.push({ status: status as WalletTransactionStatus });
  const where: Prisma.WalletTransactionWhereInput = and.length ? { AND: and } : {};

  const [entryFeeRevenue, deposits, withdrawals, pendingPayouts, transactions] = await Promise.all([
    prisma.escrowTransaction.aggregate({ where: { type: "ENTRY_FEE", status: "COMPLETE" }, _sum: { amount: true } }),
    prisma.walletTransaction.aggregate({ where: { type: "FUND", status: "COMPLETE" }, _sum: { amount: true } }),
    prisma.walletTransaction.aggregate({ where: { type: "WITHDRAWAL", status: "COMPLETE" }, _sum: { amount: true } }),
    prisma.escrowTransaction.aggregate({ where: { type: "PRIZE_PAYOUT", status: "PENDING" }, _sum: { amount: true } }),
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { displayName: true, handle: true } } },
    }),
  ]);

  const metrics = [
    { label: "Revenue", value: formatNaira(entryFeeRevenue._sum.amount ?? 0) },
    { label: "Deposits", value: formatNaira(deposits._sum.amount ?? 0) },
    { label: "Withdrawals", value: formatNaira(withdrawals._sum.amount ?? 0) },
    { label: "Pending Payouts", value: formatNaira(pendingPayouts._sum.amount ?? 0) },
  ];

  const hasFilters = !!(q || type || status);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Finance</h1>
        <p className="text-sm text-muted">Money moving through Circuit.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="widget flex flex-col gap-1">
            <span className="text-eyebrow">{m.label}</span>
            <span className="text-stat text-2xl">{m.value}</span>
          </div>
        ))}
      </div>

      <form className="card flex flex-wrap items-end gap-3">
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <label className="field-label" htmlFor="q">
            Player
          </label>
          <input id="q" name="q" defaultValue={q ?? ""} placeholder="Name or handle" className="field-input" />
        </div>
        <div className="flex min-w-[140px] flex-col gap-1.5">
          <label className="field-label" htmlFor="type">
            Type
          </label>
          <select id="type" name="type" defaultValue={type ?? ""} className="field-select">
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-[140px] flex-col gap-1.5">
          <label className="field-label" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" defaultValue={status ?? ""} className="field-select">
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary">
          Apply
        </button>
        {hasFilters && (
          <Link href="/admin/finance" className="text-xs font-medium text-accent-volt hover:underline">
            Clear filters
          </Link>
        )}
      </form>

      {transactions.length === 0 ? (
        <div className="card flex flex-col items-center gap-1 py-16 text-center">
          <p className="text-sm text-muted">No transactions match those filters.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Player</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td className="font-mono text-xs text-muted-strong">{t.id.slice(0, 10)}…</td>
                  <td>
                    <Link href={`/admin/users/${t.userId}`} className="font-medium hover:text-accent-volt">
                      {t.user.displayName}
                    </Link>
                  </td>
                  <td className="text-muted">{typeLabel(t.type)}</td>
                  <td className="font-mono tabular-nums">{formatNaira(t.amount)}</td>
                  <td>
                    <span
                      className={`badge ${
                        t.status === "COMPLETE" ? "badge-complete" : t.status === "FAILED" ? "badge-cancelled" : "badge-attention"
                      }`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="text-muted">{formatDate(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
