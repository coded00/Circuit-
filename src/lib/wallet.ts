/**
 * Circuit — real wallet activity, shared by the Wallet page and the
 * header's balance chip so both derive the exact same numbers.
 *
 * Two independent things live here:
 * - `balance` is the real, spendable `User.walletBalance` — funded via
 *   Fund Wallet, spent on entry fees, cashed out via Withdraw. Backed by
 *   the `WalletTransaction` ledger (`fundingHistory`: FUND/WITHDRAWAL
 *   rows only).
 * - `rows`/`totalPaid`/`totalRefunded`/`totalWon`/`net` are the older,
 *   separate "tournament activity statement" (every entry fee, refund,
 *   and prize win, regardless of how the entry fee was paid) — read-only
 *   history derived from `EscrowTransaction`, not itself a balance.
 */

import { prisma } from "@/lib/db";

export type WalletRow = {
  id: string;
  createdAt: Date;
  tournamentName: string;
  tournamentGame: string;
  type: "ENTRY_FEE" | "REFUND" | "PRIZE_PAYOUT";
  amount: number;
  status: string;
};

export type FundingRow = {
  id: string;
  createdAt: Date;
  type: "FUND" | "WITHDRAWAL";
  amount: number;
  status: string;
};

export type WalletActivity = {
  balance: number;
  fundingHistory: FundingRow[];
  rows: WalletRow[];
  totalPaid: number;
  totalRefunded: number;
  totalWon: number;
  net: number;
};

export async function getWalletActivity(userId: string): Promise<WalletActivity> {
  const [user, fundingTxns] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { walletBalance: true } }),
    prisma.walletTransaction.findMany({
      where: { userId, type: { in: ["FUND", "WITHDRAWAL"] } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const fundingHistory: FundingRow[] = fundingTxns.map((t) => ({
    id: t.id,
    createdAt: t.createdAt,
    type: t.type as "FUND" | "WITHDRAWAL",
    amount: t.amount,
    status: t.status,
  }));

  const myRegistrations = await prisma.registration.findMany({
    where: { userId },
    select: { id: true, tournament: { select: { name: true, game: true } } },
  });
  const registrationById = new Map(myRegistrations.map((r) => [r.id, r.tournament]));

  const entryAndRefundTxns = myRegistrations.length
    ? await prisma.escrowTransaction.findMany({
        where: { registrationId: { in: myRegistrations.map((r) => r.id) } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  // A prize payout has no direct recipient field — derive "is this mine"
  // the same way the payout route itself decides who's allowed to claim:
  // whoever won the tournament's real final round (highest `round`
  // number for that tournament), not just any match they happened to win.
  const myMatches = await prisma.match.findMany({
    where: { tournamentId: { not: null }, OR: [{ playerAId: userId }, { playerBId: userId }] },
    select: { tournamentId: true, round: true, winnerId: true },
  });
  const myTournamentIds = [...new Set(myMatches.map((m) => m.tournamentId!))];
  const allMatchesInThoseTournaments = myTournamentIds.length
    ? await prisma.match.findMany({
        where: { tournamentId: { in: myTournamentIds } },
        select: { tournamentId: true, round: true },
      })
    : [];
  const finalRoundByTournament = new Map<string, number>();
  for (const m of allMatchesInThoseTournaments) {
    const current = finalRoundByTournament.get(m.tournamentId!) ?? 0;
    if ((m.round ?? 0) > current) finalRoundByTournament.set(m.tournamentId!, m.round ?? 0);
  }
  const championTournamentIds = myTournamentIds.filter((tid) =>
    myMatches.some((m) => m.tournamentId === tid && m.round === finalRoundByTournament.get(tid) && m.winnerId === userId)
  );

  const prizeTxns = championTournamentIds.length
    ? await prisma.escrowTransaction.findMany({
        where: { tournamentId: { in: championTournamentIds }, type: "PRIZE_PAYOUT" },
        include: { tournament: { select: { name: true, game: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const rows: WalletRow[] = [
    ...entryAndRefundTxns
      .filter((t): t is typeof t & { type: "ENTRY_FEE" | "REFUND" } => t.type === "ENTRY_FEE" || t.type === "REFUND")
      .map((t) => {
        const tournament = registrationById.get(t.registrationId ?? "");
        return {
          id: t.id,
          createdAt: t.createdAt,
          tournamentName: tournament?.name ?? "Unknown tournament",
          tournamentGame: tournament?.game ?? "",
          type: t.type,
          amount: t.amount,
          status: t.status,
        };
      }),
    ...prizeTxns.map((t) => ({
      id: t.id,
      createdAt: t.createdAt,
      tournamentName: t.tournament?.name ?? "Unknown tournament",
      tournamentGame: t.tournament?.game ?? "",
      type: "PRIZE_PAYOUT" as const,
      amount: t.amount,
      status: t.status,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const totalPaid = entryAndRefundTxns.filter((t) => t.type === "ENTRY_FEE" && t.status === "COMPLETE").reduce((s, t) => s + t.amount, 0);
  const totalRefunded = entryAndRefundTxns.filter((t) => t.type === "REFUND" && t.status === "COMPLETE").reduce((s, t) => s + t.amount, 0);
  const totalWon = prizeTxns.filter((t) => t.status === "COMPLETE").reduce((s, t) => s + t.amount, 0);

  return {
    balance: user.walletBalance,
    fundingHistory,
    rows,
    totalPaid,
    totalRefunded,
    totalWon,
    net: totalWon + totalRefunded - totalPaid,
  };
}
