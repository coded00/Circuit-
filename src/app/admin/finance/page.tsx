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
 * "Revenue" is gross completed entry-fee volume (the same number the
 * Overview page shows) — the money that moved through paid entries, not
 * Circuit's own cut of it. "Platform Fee Revenue" is that cut: the real
 * sum of completed PLATFORM_FEE escrow rows, carved out of each entry
 * fee at confirmation per the configurable rate in Admin > Settings (see
 * PlatformSetting.platformFeeBps's own schema comment).
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
import { Download } from "lucide-react";
import { EmptyState, Field, FilterBar, naira, PageHeader, Pagination, Section, StatStrip, StatusBadge, SubNav } from "@/components/admin/ui";
import { RowLink } from "@/components/admin/ui-client";

type SearchParams = {
  tab?: string;
  q?: string;
  type?: string;
  status?: string;
  eq?: string;
  etype?: string;
  estatus?: string;
  page?: string;
};

const PAGE_SIZE = 40;

function formatDate(date: Date): string {
  return date.toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

const WALLET_TYPE: Record<string, { label: string; credit: boolean }> = {
  FUND: { label: "Deposit", credit: true },
  WITHDRAWAL: { label: "Withdrawal", credit: false },
  ENTRY_FEE_DEBIT: { label: "Entry fee", credit: false },
  ENTRY_FEE_REFUND: { label: "Entry fee refund", credit: true },
  STAKE_DEBIT: { label: "Challenge stake", credit: false },
  STAKE_CREDIT: { label: "Challenge winnings", credit: true },
  ORGANIZER_REVENUE_CREDIT: { label: "Organizer revenue", credit: true },
};

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
    case "PLATFORM_FEE":
      return "Platform fee";
    case "ORGANIZER_REVENUE":
      return "Organizer revenue";
  }
}

function TxStatus({ status }: { status: string }) {
  const s = status === "COMPLETE" ? { tone: "success" as const, label: "Complete" } : status === "FAILED" ? { tone: "danger" as const, label: "Failed" } : { tone: "attention" as const, label: "Processing" };
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>;
}

const TYPE_OPTIONS: { value: WalletTransactionType | ""; label: string }[] = [
  { value: "", label: "Any type" },
  { value: "FUND", label: "Deposit" },
  { value: "WITHDRAWAL", label: "Withdrawal" },
  { value: "ENTRY_FEE_DEBIT", label: "Entry fee" },
  { value: "ENTRY_FEE_REFUND", label: "Entry fee refund" },
  { value: "STAKE_DEBIT", label: "Challenge stake" },
  { value: "STAKE_CREDIT", label: "Challenge winnings" },
  { value: "ORGANIZER_REVENUE_CREDIT", label: "Organizer revenue" },
];

const STATUS_OPTIONS: { value: WalletTransactionStatus | ""; label: string }[] = [
  { value: "", label: "Any status" },
  { value: "PENDING", label: "Processing" },
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
  { value: "PLATFORM_FEE", label: "Platform fee" },
  { value: "ORGANIZER_REVENUE", label: "Organizer revenue" },
];

const ESCROW_STATUS_OPTIONS: { value: EscrowStatus | ""; label: string }[] = [
  { value: "", label: "Any status" },
  { value: "PENDING", label: "Processing" },
  { value: "COMPLETE", label: "Complete" },
  { value: "FAILED", label: "Failed" },
];

export default async function AdminFinancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { tab, q, type, status, eq, etype, estatus, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
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

  const [entryFeeRevenue, platformFeeRevenue, organizerRevenueSettled, organizerRevenuePending, deposits, withdrawals, pendingWithdrawals, pendingPayouts, transactions, escrowTxns, walletTotal, escrowTotal] = await Promise.all([
    prisma.escrowTransaction.aggregate({ where: { type: "ENTRY_FEE", status: "COMPLETE" }, _sum: { amount: true } }),
    prisma.escrowTransaction.aggregate({ where: { type: "PLATFORM_FEE", status: "COMPLETE" }, _sum: { amount: true } }),
    prisma.escrowTransaction.aggregate({ where: { type: "ORGANIZER_REVENUE", status: "COMPLETE" }, _sum: { amount: true } }),
    prisma.escrowTransaction.aggregate({ where: { type: "ORGANIZER_REVENUE", status: "PENDING" }, _sum: { amount: true } }),
    prisma.walletTransaction.aggregate({ where: { type: "FUND", status: "COMPLETE" }, _sum: { amount: true } }),
    prisma.walletTransaction.aggregate({ where: { type: "WITHDRAWAL", status: "COMPLETE" }, _sum: { amount: true } }),
    prisma.walletTransaction.aggregate({ where: { type: "WITHDRAWAL", status: "PENDING" }, _sum: { amount: true }, _count: true }),
    prisma.escrowTransaction.aggregate({ where: { type: "PRIZE_PAYOUT", status: "PENDING" }, _sum: { amount: true }, _count: true }),
    activeTab === "wallet"
      ? prisma.walletTransaction.findMany({
          where: walletWhere,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          include: { user: { select: { displayName: true, handle: true } } },
        })
      : Promise.resolve([]),
    activeTab === "escrow"
      ? prisma.escrowTransaction.findMany({
          where: escrowWhere,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          include: {
            tournament: { select: { id: true, name: true } },
            battle: { select: { id: true, game: true } },
            user: { select: { displayName: true, handle: true } },
            registration: { include: { user: { select: { displayName: true, handle: true } } } },
          },
        })
      : Promise.resolve([]),
    activeTab === "wallet" ? prisma.walletTransaction.count({ where: walletWhere }) : Promise.resolve(0),
    activeTab === "escrow" ? prisma.escrowTransaction.count({ where: escrowWhere }) : Promise.resolve(0),
  ]);

  const hasWalletFilters = !!(q || type || status);
  const hasEscrowFilters = !!(eq || etype || estatus);
  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (activeTab === "escrow") {
      params.set("tab", "escrow");
      if (eq) params.set("eq", eq);
      if (etype) params.set("etype", etype);
      if (estatus) params.set("estatus", estatus);
    } else {
      if (q) params.set("q", q);
      if (type) params.set("type", type);
      if (status) params.set("status", status);
    }
    if (n > 1) params.set("page", String(n));
    const qs = params.toString();
    return qs ? `/admin/finance?${qs}` : "/admin/finance";
  };
  const exportLink = (href: string) => (
    <a href={href} className="btn-ghost">
      <Download size={14} /> Export CSV
    </a>
  );

  return (
    <>
      <PageHeader title="Finance" description="Every naira moving through Circuit — entry fees, wallets, prizes and payouts." />

      <div className="flex flex-col gap-3">
        <Section title="Money in and out">
          <StatStrip
            stats={[
              { label: "Entry fees collected", value: naira(entryFeeRevenue._sum.amount ?? 0) },
              { label: "Wallet deposits", value: naira(deposits._sum.amount ?? 0) },
              {
                label: "Wallet withdrawals",
                value: naira(withdrawals._sum.amount ?? 0),
                hint: pendingWithdrawals._count ? `${naira(pendingWithdrawals._sum.amount ?? 0)} processing` : undefined,
                tone: pendingWithdrawals._count ? "attention" : "default",
                href: pendingWithdrawals._count ? "/admin/finance?type=WITHDRAWAL&status=PENDING" : undefined,
              },
              {
                label: "Prize payouts processing",
                value: naira(pendingPayouts._sum.amount ?? 0),
                hint: pendingPayouts._count ? `${pendingPayouts._count} waiting on the provider` : "None waiting",
                tone: pendingPayouts._count ? "attention" : "default",
                href: pendingPayouts._count ? "/admin/finance?tab=escrow&etype=PRIZE_PAYOUT&estatus=PENDING" : undefined,
              },
            ]}
          />
        </Section>
        <Section title="Earnings">
          <StatStrip
            stats={[
              { label: "Circuit platform fees", value: naira(platformFeeRevenue._sum.amount ?? 0) },
              { label: "Organizer revenue paid", value: naira(organizerRevenueSettled._sum.amount ?? 0) },
              { label: "Organizer revenue pending", value: naira(organizerRevenuePending._sum.amount ?? 0), hint: "Credits after the settlement window" },
            ]}
          />
        </Section>
      </div>

      <SubNav
        active={activeTab}
        items={[
          { key: "wallet", label: "Wallet activity", href: "/admin/finance" },
          { key: "escrow", label: "Tournament & challenge money", href: "/admin/finance?tab=escrow" },
        ]}
      />

      {activeTab === "wallet" ? (
        <>
          <FilterBar
            extra={
              <>
                {hasWalletFilters && (
                  <Link href="/admin/finance" className="text-[12px] font-medium text-muted hover:text-foreground">
                    Clear
                  </Link>
                )}
                {exportLink(`/api/admin/finance/wallet-transactions.csv?${new URLSearchParams({ q: q ?? "", type: type ?? "", status: status ?? "" })}`)}
              </>
            }
          >
            <input type="hidden" name="tab" value="wallet" />
            <Field label="Player" grow htmlFor="q">
              <input id="q" name="q" defaultValue={q ?? ""} placeholder="Name or handle" className="field-input" />
            </Field>
            <Field label="Type" htmlFor="type">
              <select id="type" name="type" defaultValue={type ?? ""} className="field-select">
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status" htmlFor="status">
              <select id="status" name="status" defaultValue={status ?? ""} className="field-select">
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </FilterBar>

          {transactions.length === 0 ? (
            <EmptyState title={hasWalletFilters ? "No transactions match these filters" : "No wallet activity yet"} />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Type</th>
                      <th className="text-right">Amount</th>
                      <th>Status</th>
                      <th className="text-right">Date</th>
                      <th>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => {
                      const kind = WALLET_TYPE[t.type] ?? { label: t.type, credit: false };
                      return (
                        <RowLink key={t.id} href={`/admin/users/${t.userId}`}>
                          <td>
                            <Link href={`/admin/users/${t.userId}`} className="flex flex-col leading-tight">
                              <span className="font-medium text-foreground">{t.user.displayName}</span>
                              <span className="text-[12px] text-muted">@{t.user.handle}</span>
                            </Link>
                          </td>
                          <td className="text-muted">{kind.label}</td>
                          <td className={`text-right ${kind.credit ? "text-success" : "text-foreground"}`}>
                            {kind.credit ? "+" : "−"}
                            {naira(t.amount)}
                          </td>
                          <td>
                            <TxStatus status={t.status} />
                          </td>
                          <td className="text-right text-muted">{formatDate(t.createdAt)}</td>
                          <td className="font-code text-[11px] text-muted-strong" title={t.id}>
                            {t.id.slice(-8)}
                          </td>
                        </RowLink>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageSize={PAGE_SIZE} total={walletTotal} href={pageHref} />
            </div>
          )}
        </>
      ) : (
        <>
          <FilterBar
            extra={
              <>
                {hasEscrowFilters && (
                  <Link href="/admin/finance?tab=escrow" className="text-[12px] font-medium text-muted hover:text-foreground">
                    Clear
                  </Link>
                )}
                {exportLink(`/api/admin/finance/escrow-transactions.csv?${new URLSearchParams({ eq: eq ?? "", etype: etype ?? "", estatus: estatus ?? "" })}`)}
              </>
            }
          >
            <input type="hidden" name="tab" value="escrow" />
            <Field label="Search" grow htmlFor="eq">
              <input id="eq" name="eq" defaultValue={eq ?? ""} placeholder="Tournament, challenge or player" className="field-input" />
            </Field>
            <Field label="Type" htmlFor="etype">
              <select id="etype" name="etype" defaultValue={etype ?? ""} className="field-select">
                {ESCROW_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status" htmlFor="estatus">
              <select id="estatus" name="estatus" defaultValue={estatus ?? ""} className="field-select">
                {ESCROW_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </FilterBar>

          {escrowTxns.length === 0 ? (
            <EmptyState title={hasEscrowFilters ? "No transactions match these filters" : "No tournament or challenge money yet"} />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>For</th>
                      <th>Player</th>
                      <th>Type</th>
                      <th className="text-right">Amount</th>
                      <th>Status</th>
                      <th className="text-right">Date</th>
                      <th>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {escrowTxns.map((t) => {
                      const player = t.registration?.user ?? t.user ?? null;
                      const href = t.tournament ? `/admin/competitions/${t.tournament.id}` : t.battle ? `/admin/challenges/${t.battle.id}` : null;
                      const cells = (
                        <>
                          <td className="max-w-[260px]">
                            {t.tournament ? (
                              <Link href={`/admin/competitions/${t.tournament.id}`} className="block truncate font-medium text-foreground">
                                {t.tournament.name}
                              </Link>
                            ) : t.battle ? (
                              <Link href={`/admin/challenges/${t.battle.id}`} className="block truncate font-medium text-foreground">
                                {t.battle.game} challenge
                              </Link>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td>
                            {player ? (
                              <span className="flex flex-col leading-tight">
                                <span className="text-foreground">{player.displayName}</span>
                                <span className="text-[12px] text-muted">
                                  @{player.handle}
                                  {t.type === "PRIZE_PAYOUT" && t.place ? ` · ${t.place === 1 ? "champion" : `place ${t.place}`}` : ""}
                                </span>
                              </span>
                            ) : (
                              <span className="text-muted">{t.type === "PRIZE_PAYOUT" ? (t.place && t.place > 1 ? `Place ${t.place}` : "Champion") : "—"}</span>
                            )}
                          </td>
                          <td className="text-muted">{escrowTypeLabel(t.type)}</td>
                          <td className="text-right text-foreground">{naira(t.amount)}</td>
                          <td>
                            <TxStatus status={t.status} />
                          </td>
                          <td className="text-right text-muted">{formatDate(t.createdAt)}</td>
                          <td className="font-code text-[11px] text-muted-strong" title={t.id}>
                            {t.id.slice(-8)}
                          </td>
                        </>
                      );
                      return href ? (
                        <RowLink key={t.id} href={href}>
                          {cells}
                        </RowLink>
                      ) : (
                        <tr key={t.id}>{cells}</tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageSize={PAGE_SIZE} total={escrowTotal} href={pageHref} />
            </div>
          )}
        </>
      )}
    </>
  );
}
