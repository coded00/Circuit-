import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { loginPath } from "@/lib/safeRedirect";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { categoryLabel, formatListingPrice } from "@/lib/marketplace";
import { CategoryIcon } from "@/components/marketplace/categoryIcon";

export const metadata = { robots: { index: false, follow: false } };

const STATUS = {
  PENDING_PAYMENT: { label: "Awaiting card payment", className: "bg-surface-elevated text-muted" },
  PAID: { label: "Being prepared", className: "bg-accent-blue-soft text-accent-blue" },
  FULFILLED: { label: "Delivered", className: "bg-success/15 text-success" },
  CANCELLED: { label: "Cancelled and refunded", className: "bg-surface-elevated text-muted" },
} as const;

export default async function MyOrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect(loginPath("/marketplace/orders"));
  const orders = await prisma.order.findMany({
    where: { buyerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { listing: { select: { deliveryUrl: true } } },
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-col gap-1">
        <Link href="/marketplace" className="w-fit text-sm text-muted transition hover:text-foreground">
          ← Marketplace
        </Link>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">My orders</h1>
      </header>

      {orders.length === 0 ? (
        <div className="card state-block">
          <h2 className="state-title">No orders yet</h2>
          <p className="state-description">Things you buy show up here, with their delivery details.</p>
          <Link href="/marketplace" className="btn-primary">
            Browse the Marketplace
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((o) => (
            <li key={o.id} className="cut-lg flex flex-col gap-3 border border-border bg-surface p-4 [--cut-line:var(--border)]">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/marketplace/orders/${o.id}`} className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-display text-lg font-bold tracking-tight uppercase">{o.listingTitle}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <CategoryIcon category={o.category} size={12} />
                    {categoryLabel(o.category)} · {o.createdAt.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </Link>
                <span className="text-stat shrink-0 text-gold">{formatListingPrice(o.amountKobo)}</span>
              </div>
              <span className={`cut-xs w-fit px-2 py-1 text-xs font-semibold ${STATUS[o.status].className}`}>{o.status === "CANCELLED" && o.paymentMethod === "CARD" ? (o.refundStatus === "COMPLETE" ? "Cancelled and refunded to your card" : o.refundStatus === "FAILED" ? "Cancelled. We're sorting out your card refund" : o.refundStatus === "PENDING" ? "Cancelled. Refund to your card on its way" : "Cancelled") : STATUS[o.status].label}</span>
              {o.buyerNote && <p className="text-xs text-muted">You told us: {o.buyerNote}</p>}
              {o.status === "FULFILLED" && o.listing.deliveryUrl && (
                <a href={`/api/marketplace/orders/${o.id}/download`} className="btn-primary w-fit">
                  <Download size={15} aria-hidden /> Download
                </a>
              )}
              {o.fulfilmentNote && (
                <div className="cut-sm [--cut-line:var(--border)] border border-border bg-surface-elevated p-3 text-sm whitespace-pre-wrap">{o.fulfilmentNote}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
