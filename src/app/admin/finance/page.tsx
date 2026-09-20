/**
 * Circuit — Admin Finance (Phase 4, extended). Two tabs over the same
 * two real ledgers Circuit already keeps: Wallet Activity
 * (`WalletTransaction` — deposits/withdrawals/entry-fee debits, per-user)
 * and Escrow Transactions (`EscrowTransaction` — entry fees, refunds,
 * prize payouts, and Battle stakes, per-tournament/per-battle).
 *
 * The Escrow tab is the actual gap a production-readiness audit flagged:
 * this page previously only showed wallet activity, so an admin had no
 * platform-wide view of prize payouts or refunds in flight — the closest
 * thing to a "payout queue" was clicking into one tournament at a time
 * (`/admin/competitions/[id]`, which already aggregates its own escrow
 * rows). This tab is that same data, un-scoped to one tournament,
 * filterable and exportable the same way Wallet Activity already is.
 *
 * "Revenue" is the same honest number the Overview page uses — gross
 * completed entry-fee volume, not a fabricated commission (see that
 * page's own header comment for why: no platform-fee field exists yet).
 */

import Link from "next/link";
import type {
  Prisma,
  WalletTransactionType,
  WalletTransactionStatus,
  EscrowType,
  EscrowStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";

type SearchParams = {
  tab?: string;
  q?: string;
  type?: string;
  status?: string;
  eq?: string;
  etype?: string;
  estatus?: string;
};

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

function escrowTypeLabel(type: EscrowType): string {
  switch (type) {
    case "ENTRY_FEE":
      return "Entry fee";
    case "REFUND":
      return "Refund";
    case "PRIZE_PAYOUT":
      return "Prize payout";
    case "STAKE":
      return "Challenge stake";
    case "STAKE_PAYOUT":
      return "Challenge stake payout";
  }
}

function statusBadgeClass(status: string): string {
  return status === "COMPLETE" ? "badge-complete" : status === "FAILED" ? "badge-cancelled" : "badge-attention";
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

const ESCROW_TYPE_OPTIONS: { value: EscrowType | ""; label: string }[] = [
  { value: "", label: "Any type" },
  { value: "ENTRY_FEE", label: "Entry fee" },
  { value: "REFUND", label: "Refund" },
  { value: "PRIZE_PAYOUT", label: "Prize payout" },
  { value: "STAKE", label: "Challenge stake" },
  { value: "STAKE_PAYOUT", label: "Challenge stake payout" },
];

const ESCROW_STATUS_OPTIONS: { value: EscrowStatus | ""; label: string }[] = [
  { value: "", label: "Any status" },
  { value: "PENDING", label: "Pending" },
  { value: "COMPLETE", label: "Complete" },
  { value: "FAILED", label: "Failed" },
];

export default async function AdminFinancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { tab, q, type, status, eq, etype, estatus } = await searchParams;
  const activeTab = tab === "escrow" ? "escrow" : "wallet";

  const walletAnd: Prisma.WalletTransactionWhereInput[] = [];
  if (q?.trim()) {
    const term = q.trim();
    walletAnd.push({
      user: {
        OR: [
          { displayName: { contains: term, mode: "insensitive" } },
          { handle: { contains: term, mode: "insensitive" } },
        ],
      },
    });
  }
  if (type) walletAnd.push({ type: type as WalletTransactionType });
  if (status) walletAnd.push({ status: status as WalletTransactionStatus });
  const walletWhere: Prisma.WalletTransactionWhereInput = walletAnd.length ? { AND: walletAnd } : {};

  const escrowAnd: Prisma.EscrowTransactionWhereInput[] = [];
  if (eq?.trim()) {
    const term = eq.trim();
    escrowAnd.push({
      OR: [
        { tournament: { name: { contains: term, mode: "insensitive" } } },
        { battle: { game: { contains: term, mode: "insensitive" } } },
        { user: { OR: [{ displayName: { contains: term, mode: "insensitive" } }, { handle: { contains: term, mode: "insensitive" } }] } },
        { registration: { user: { OR: [{ displayName: { contains: term, mode: "insensitive" } }, { handle: { contains: term, mode: "insensitive" } }] } } },
      ],
    });
  }
  if (etype) escrowAnd.push({ type: etype as EscrowType });
  if (estatus) escrowAnd.push({ status: estatus as EscrowStatus });
  const escrowWhere: Prisma.EscrowTransactionWhereInput = escrowAnd.length ? { AND: escrowAnd } : {};

  const [entryFeeRevenue, deposits, withdrawals, pendingPayouts, transactions, escrowTxns] = await Promise.all([
    prisma.escrowTransaction.aggregate({ where: { type: "ENTRY_FEE", status: "COMPLETE" }, _sum: { amount: true } }),
    prisma.walletTransaction.aggregate({ where: { type: "FUND", status: "COMPLETE" }, _sum: { amount: true } }),
    prisma.walletTransaction.aggregate({ where: { type: "WITHDRAWAL", status: "COMPLETE" }, _sum: { amount: true } }),
    prisma.escrowTransaction.aggregate({ where: { type: "PRIZE_PAYOUT", status: "PENDING" }, _sum: { amount: true } }),
    activeTab === "wallet"
      ? prisma.walletTransaction.findMany({
          where: walletWhere,
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { user: { select: { displayName: true, handle: true } } },
        })
      : Promise.resolve([]),
    activeTab === "escrow"
      ? prisma.escrowTransaction.findMany({
          where: escrowWhere,
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            tournament: { select: { id: true, name: true } },
            battle: { select: { id: true, game: true } },
            user: { select: { displayName: true, handle: true } },
            registration: { include: { user: { select: { displayName: true, handle: true } } } },
          },
        })
      : Promise.resolve([]),
  ]);

  const metrics = [
    { label: "Revenue", value: formatNaira(entryFeeRevenue._sum.amount ?? 0) },
    { label: "Deposits", value: formatNaira(deposits._sum.amount ?? 0) },
    { label: "Withdrawals", value: formatNaira(withdrawals._sum.amount ?? 0) },
    { label: "Pending Payouts", value: formatNaira(pendingPayouts._sum.amount ?? 0) },
  ];

  const hasWalletFilters = !!(q || type || status);
  const hasEscrowFilters = !!(eq || etype || estatus);

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

      <div className="tabs">
        <Link href="/admin/finance" className={`tab ${activeTab === "wallet" ? "tab-active" : ""}`}>
          Wallet Activity
        </Link>
        <Link href="/admin/finance?tab=escrow" className={`tab ${activeTab === "escrow" ? "tab-active" : ""}`}>
          Tournament &amp; Challenge Transactions
        </Link>
      </div>

      {activeTab === "wallet" ? (
        <>
          <form className="card flex flex-wrap items-end gap-3">
            <input type="hidden" name="tab" value="wallet" />
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
            {hasWalletFilters && (
              <Link href="/admin/finance" className="text-xs font-medium text-accent-volt hover:underline">
                Clear filters
              </Link>
            )}
            <a
              href={`/api/admin/finance/wallet-transactions.csv?${new URLSearchParams({ q: q ?? "", type: type ?? "", status: status ?? "" })}`}
              className="ml-auto text-sm font-medium text-accent-blue hover:underline"
            >
              Export CSV
            </a>
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
                        <span className={`badge ${statusBadgeClass(t.status)}`}>{t.status}</span>
                      </td>
                      <td className="text-muted">{formatDate(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <form className="card flex flex-wrap items-end gap-3">
            <input type="hidden" name="tab" value="escrow" />
            <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
              <label className="field-label" htmlFor="eq">
                Tournament, Challenge, or player
              </label>
              <input id="eq" name="eq" defaultValue={eq ?? ""} placeholder="Search" className="field-input" />
            </div>
            <div className="flex min-w-[160px] flex-col gap-1.5">
              <label className="field-label" htmlFor="etype">
                Type
              </label>
              <select id="etype" name="etype" defaultValue={etype ?? ""} className="field-select">
                {ESCROW_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-[140px] flex-col gap-1.5">
              <label className="field-label" htmlFor="estatus">
                Status
              </label>
              <select id="estatus" name="estatus" defaultValue={estatus ?? ""} className="field-select">
                {ESCROW_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-primary">
              Apply
            </button>
            {hasEscrowFilters && (
              <Link href="/admin/finance?tab=escrow" className="text-xs font-medium text-accent-volt hover:underline">
                Clear filters
              </Link>
            )}
            <a
              href={`/api/admin/finance/escrow-transactions.csv?${new URLSearchParams({ eq: eq ?? "", etype: etype ?? "", estatus: estatus ?? "" })}`}
              className="ml-auto text-sm font-medium text-accent-blue hover:underline"
            >
              Export CSV
            </a>
          </form>

          {escrowTxns.length === 0 ? (
            <div className="card flex flex-col items-center gap-1 py-16 text-center">
              <p className="text-sm text-muted">No transactions match those filters.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Transaction</th>
                    <th>Context</th>
                    <th>Player</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {escrowTxns.map((t) => {
                    const player = t.registration?.user ?? t.user ?? null;
                    return (
                      <tr key={t.id}>
                        <td className="font-mono text-xs text-muted-strong">{t.id.slice(0, 10)}…</td>
                        <td className="min-w-0">
                          {t.tournament ? (
                            <Link href={`/admin/competitions/${t.tournament.id}`} className="truncate font-medium hover:text-accent-volt">
                              {t.tournament.name}
                            </Link>
                          ) : t.battle ? (
                            <Link href={`/admin/challenges/${t.battle.id}`} className="truncate font-medium hover:text-accent-volt">
                              {t.battle.game} challenge
                            </Link>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          {player ? (
                            <span className="font-medium">
                              {player.displayName} <span className="text-muted">(@{player.handle})</span>
                            </span>
                          ) : (
                            <span className="text-muted">
                              {t.type === "PRIZE_PAYOUT" ? "Champion" : "—"}
                            </span>
                          )}
                        </td>
                        <td className="text-muted">{escrowTypeLabel(t.type)}</td>
                        <td className="font-mono tabular-nums">{formatNaira(t.amount)}</td>
                        <td>
                          <span className={`badge ${statusBadgeClass(t.status)}`}>{t.status}</span>
                        </td>
                        <td className="text-muted">{formatDate(t.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
