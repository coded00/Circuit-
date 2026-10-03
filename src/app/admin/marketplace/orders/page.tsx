/**
 * Circuit — Admin Marketplace orders. Circuit is the seller, so every paid
 * order lands here to be delivered (or cancelled and refunded). Paid orders
 * come first.
 */

import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { categoryLabel, formatListingPrice } from "@/lib/marketplace";
import { EmptyState, PageHeader, StatusBadge, SubNav, plural, type BadgeTone } from "@/components/admin/ui";
import { OrderActions } from "@/components/marketplace/OrderActions";

const STATUS_TONE: Record<OrderStatus, BadgeTone> = { PAID: "attention", FULFILLED: "success", CANCELLED: "neutral" };
const STATUS_LABEL: Record<OrderStatus, string> = { PAID: "To deliver", FULFILLED: "Delivered", CANCELLED: "Cancelled" };
const FILTERS: { key: string; label: string; status: OrderStatus | null }[] = [
  { key: "paid", label: "To deliver", status: "PAID" },
  { key: "fulfilled", label: "Delivered", status: "FULFILLED" },
  { key: "cancelled", label: "Cancelled", status: "CANCELLED" },
  { key: "all", label: "All", status: null },
];

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  const active = FILTERS.find((f) => f.key === show) ?? FILTERS[0];
  const [orders, toDeliver] = await Promise.all([
    prisma.order.findMany({
      where: active.status ? { status: active.status } : {},
      orderBy: active.key === "paid" ? { createdAt: "asc" } : { createdAt: "desc" },
      take: 100,
      include: { buyer: { select: { displayName: true, handle: true } } },
    }),
    prisma.order.count({ where: { status: "PAID" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Orders"
        back={{ href: "/admin/marketplace", label: "Marketplace" }}
        description={`${plural(toDeliver, "order")} waiting for delivery.`}
      />
      <SubNav
        active={active.key}
        items={FILTERS.map((f) => ({ key: f.key, label: f.label, href: `/admin/marketplace/orders?show=${f.key}`, count: f.key === "paid" ? toDeliver : undefined }))}
      />

      {orders.length === 0 ? (
        <EmptyState title="Nothing here" description={active.key === "paid" ? "No orders are waiting for delivery." : "No orders match."} />
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((o) => (
            <li key={o.id} className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Link href={`/admin/marketplace/${o.listingId}`} className="truncate font-medium text-foreground hover:underline">
                    {o.listingTitle}
                  </Link>
                  <span className="text-[12px] text-muted">
                    {categoryLabel(o.category)} · {o.buyer.displayName} (@{o.buyer.handle}) · {o.createdAt.toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-stat">{formatListingPrice(o.amountKobo)}</span>
                  <StatusBadge tone={STATUS_TONE[o.status]} dot>
                    {STATUS_LABEL[o.status]}
                  </StatusBadge>
                </div>
              </div>
              {o.buyerNote && <p className="text-[13px]"><span className="text-muted">Buyer details: </span>{o.buyerNote}</p>}
              {o.fulfilmentNote && <p className="text-[13px] whitespace-pre-wrap"><span className="text-muted">Note to buyer: </span>{o.fulfilmentNote}</p>}
              {o.status === "PAID" && <OrderActions id={o.id} />}
              {o.status === "FULFILLED" && <OrderActions id={o.id} delivered />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
