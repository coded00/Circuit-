/**
 * Circuit — Wallet Activity CSV export, honoring the same q/type/status
 * filters as the Admin Finance page's Wallet Activity tab (not the full
 * unfiltered table) — same csvEscape pattern as
 * tournaments/[id]/registrants.csv/route.ts.
 */

import { NextResponse } from "next/server";
import type { Prisma, WalletTransactionStatus, WalletTransactionType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";
import { csvEscape } from "@/lib/csv";

function typeLabel(type: string): string {
  if (type === "FUND") return "Deposit";
  if (type === "WITHDRAWAL") return "Withdrawal";
  return "Entry fee";
}

export async function GET(request: Request) {
  // Finding #22. This used to be requireStaff(), which put a 5,000-row export of every player's wallet
  // activity — names, handles, amounts, provider references — one click away from any staff account,
  // a MODERATOR included. The same rows are still browsable on the Finance page by anyone on staff, a
  // page at a time; this is the copy that leaves the building as a file, and that is the difference the
  // audit was pointing at. Super Admin only, like platform settings and staff management.
  const superAdminAuth = await requireSuperAdmin("Only a Super Admin can export finance data.");
  if (superAdminAuth.error) return superAdminAuth.error;

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

  // Logged before the file is built, and awaited to the point of failure — unlike the withdraw route's own
  // logAdminAction call, which swallows a broken audit log and carries on. Here the export whose record
  // failed to write is precisely the export this exists to account for, so a broken audit log refuses the
  // download rather than handing over an unrecorded copy. The filters and the row count are what make the
  // entry worth reading later: they say which slice of the ledger left, and how much of it there was.
  await logAdminAction({
    actorId: superAdminAuth.user.id,
    action: "finance.export.wallet",
    targetType: "WalletTransaction",
    metadata: { filters: { q, type, status }, rows: transactions.length },
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
