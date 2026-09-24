/**
 * Circuit — Wallet Activity CSV export, honoring the same q/type/status
 * filters as the Admin Finance page's Wallet Activity tab (not the full
 * unfiltered table) — same csvEscape pattern as
 * tournaments/[id]/registrants.csv/route.ts.
 */

import { NextResponse } from "next/server";
import type { Prisma, WalletTransactionStatus, WalletTransactionType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function typeLabel(type: string): string {
  if (type === "FUND") return "Deposit";
  if (type === "WITHDRAWAL") return "Withdrawal";
  return "Entry fee";
}

export async function GET(request: Request) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const type = searchParams.get("type") ?? "";
  const status = searchParams.get("status") ?? "";

  const and: Prisma.WalletTransactionWhereInput[] = [];
  if (q) {
    and.push({
      user: {
        OR: [
          { displayName: { contains: q, mode: "insensitive" } },
          { handle: { contains: q, mode: "insensitive" } },
        ],
      },
    });
  }
  if (type) and.push({ type: type as WalletTransactionType });
  if (status) and.push({ status: status as WalletTransactionStatus });

  const transactions = await prisma.walletTransaction.findMany({
    where: and.length ? { AND: and } : {},
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: { user: { select: { displayName: true, handle: true } } },
  });

  const rows = [
    ["Transaction ID", "Player", "Handle", "Type", "Amount (kobo)", "Provider", "Provider ref", "Status", "Created"],
    ...transactions.map((t) => [
      t.id,
      t.user.displayName,
      t.user.handle,
      typeLabel(t.type),
      String(t.amount),
      t.provider ?? "",
      t.providerRef ?? "",
      t.status,
      t.createdAt.toISOString(),
    ]),
  ];
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="circuit-wallet-transactions.csv"`,
    },
  });
}
