import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Circle, Download, XCircle } from "lucide-react";
import { loginPath } from "@/lib/safeRedirect";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { categoryLabel, formatListingPrice } from "@/lib/marketplace";
import { CategoryIcon } from "@/components/marketplace/categoryIcon";
import { AutoDownload } from "@/components/marketplace/AutoDownload";

export const metadata = { robots: { index: false, follow: false } };

const when = (d: Date) => d.toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export default async function OrderReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string }> }) {
  const [{ id }, { placed }] = await Promise.all([params, searchParams]);
  const user = await getCurrentUser();
  if (!user) redirect(loginPath(`/marketplace/orders/${id}`));

  const order = await prisma.order.findUnique({ where: { id }, include: { listing: { select: { id: true, deliveryUrl: true, imageUrl: true } } } });
  if (!order || order.buyerId !== user.id) notFound();

  const hasDownload = order.status === "FULFILLED" && !!order.listing.deliveryUrl;
  const instant = !!order.listing.deliveryUrl;
  const cancelled = order.status === "CANCELLED";

  // Where the order is, as a short timeline.
  const steps: { label: string; detail: string; state: "done" | "current" | "todo" | "failed" }[] = [
    { label: "Paid", detail: `${formatListingPrice(order.amountKobo)} from your wallet · ${when(order.createdAt)}`, state: "done" },
    cancelled
      ? { label: "Cancelled and refunded", detail: order.cancelledAt ? `${formatListingPrice(order.amountKobo)} back in your wallet · ${when(order.cancelledAt)}` : "Back in your wallet", state: "failed" }
      : order.status === "FULFILLED"
        ? { label: instant ? "Ready to download" : "Delivered", detail: order.fulfilledAt ? when(order.fulfilledAt) : "", state: "done" }
        : { label: "Circuit is preparing it", detail: "You'll get a notification when it's ready.", state: "current" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted">
        <Link href="/marketplace/orders" className="transition hover:text-foreground">
          ← My orders
        </Link>
      </nav>

      {placed && (
        <p role="status" className="alert alert-success flex items-center gap-2">
          <CheckCircle2 size={16} aria-hidden />
          {hasDownload ? "Payment received. Your download is starting; use the button below if it doesn't." : "Payment received. Circuit will deliver your order and notify you."}
        </p>
      )}
      {placed && hasDownload && <AutoDownload orderId={order.id} />}

      <header className="flex items-start gap-4">
        <div className="cut-sm flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden bg-surface-elevated text-muted/50">
          {order.listing.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- seller-uploaded or pasted image, arbitrary host and size
            <img src={order.listing.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <CategoryIcon category={order.category} size={32} />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-eyebrow text-muted">Order receipt</span>
          <h1 className="font-display text-2xl leading-[1.05] font-bold tracking-tight uppercase sm:text-3xl">{order.listingTitle}</h1>
          <span className="text-xs text-muted">
            {categoryLabel(order.category)} · #{order.id.slice(-8).toUpperCase()}
          </span>
        </div>
      </header>

      {hasDownload && (
        <a href={`/api/marketplace/orders/${order.id}/download`} className="btn-primary w-fit">
          <Download size={15} aria-hidden /> Download
        </a>
      )}

      <section aria-label="Order status" className="cut-lg border border-border bg-surface p-5 [--cut-line:var(--border)]">
        <ol className="flex flex-col">
          {steps.map((s, i) => (
            <li key={s.label} className="flex gap-3">
              <span className="flex flex-col items-center">
                {s.state === "done" ? (
                  <CheckCircle2 size={20} className="text-success" aria-hidden />
                ) : s.state === "failed" ? (
                  <XCircle size={20} className="text-muted" aria-hidden />
                ) : (
                  <Circle size={20} className="text-accent-volt" aria-hidden />
                )}
                {i < steps.length - 1 && <span aria-hidden className="my-1 w-px flex-1 bg-border" />}
              </span>
              <span className={`flex flex-col pb-4 ${i === steps.length - 1 ? "pb-0" : ""}`}>
                <span className="text-sm font-semibold">{s.label}</span>
                {s.detail && <span className="text-[13px] text-muted">{s.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {order.fulfilmentNote && order.fulfilmentNote !== "Your download is ready." && (
        <section className="flex flex-col gap-2">
          <h2 className="text-eyebrow text-muted">{cancelled ? "Why it was cancelled" : "From Circuit"}</h2>
          <div className="rounded-[12px] border border-border bg-surface-elevated p-3.5 text-sm whitespace-pre-wrap">{order.fulfilmentNote}</div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-eyebrow text-muted">Details</h2>
        <dl className="cut-lg flex flex-col gap-2 border border-border bg-surface p-4 text-sm [--cut-line:var(--border)]">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Amount</dt>
            <dd className="text-stat">{formatListingPrice(order.amountKobo)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Paid with</dt>
            <dd>Wallet</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Ordered</dt>
            <dd>{when(order.createdAt)}</dd>
          </div>
          {order.buyerNote && (
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-muted">Your details</dt>
              <dd className="min-w-0 text-right break-words">{order.buyerNote}</dd>
            </div>
          )}
        </dl>
      </section>

      <p className="text-sm text-muted">
        Something wrong with this order?{" "}
        <Link href="/help" className="text-accent-blue hover:underline">
          Get help
        </Link>
      </p>
    </div>
  );
}
