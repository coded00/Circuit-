/**
 * Circuit — Admin Marketplace: every listing in any state, filterable. Staff
 * are the only sellers for now, so this is where the catalog is stocked and
 * managed. A row opens its detail page (edit, pause, sold, remove).
 */

import Link from "next/link";
import type { ListingCategory, ListingStatus, Prisma } from "@prisma/client";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { LISTING_CATEGORIES, categoryLabel, formatListingPrice, parseCategory } from "@/lib/marketplace";
import { EmptyState, Field, FilterBar, PageHeader, Pagination, plural, StatusBadge, type BadgeTone } from "@/components/admin/ui";
import { RowLink } from "@/components/admin/ui-client";

type SearchParams = { q?: string; category?: string; status?: string; page?: string };

const PAGE_SIZE = 30;
const STATUS_TONE: Record<ListingStatus, BadgeTone> = { ACTIVE: "success", PAUSED: "attention", SOLD: "info", REMOVED: "neutral" };
const STATUS_LABEL: Record<ListingStatus, string> = { ACTIVE: "Live", PAUSED: "Paused", SOLD: "Sold", REMOVED: "Removed" };

export default async function AdminMarketplacePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { q, category: rawCategory, status: rawStatus, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const category: ListingCategory | null = parseCategory(rawCategory);
  const status = (Object.keys(STATUS_LABEL) as ListingStatus[]).find((s) => s === rawStatus) ?? null;

  const where: Prisma.ListingWhereInput = {
    ...(q?.trim() ? { OR: [{ title: { contains: q.trim(), mode: "insensitive" } }, { description: { contains: q.trim(), mode: "insensitive" } }] } : {}),
    ...(category ? { category } : {}),
    ...(status ? { status } : {}),
  };
  const [total, live, toDeliver, listings] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.count({ where: { status: "ACTIVE" } }),
    prisma.order.count({ where: { status: "PAID" } }),
    prisma.listing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { seller: { select: { displayName: true } } },
    }),
  ]);

  const hasFilters = !!(q || category || status);
  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (category) p.set("category", category);
    if (status) p.set("status", status);
    if (n > 1) p.set("page", String(n));
    const qs = p.toString();
    return qs ? `/admin/marketplace?${qs}` : "/admin/marketplace";
  };

  return (
    <>
      <PageHeader
        title="Marketplace"
        description={`${plural(total, "listing")}${hasFilters ? " match these filters" : ""}. ${live} live on the Marketplace now.`}
        actions={
          <>
            <Link href="/admin/marketplace/orders" className="btn-secondary">
              Orders{toDeliver > 0 ? ` (${toDeliver})` : ""}
            </Link>
            <Link href="/admin/marketplace/new" className="btn-primary">
              <Plus size={15} /> New listing
            </Link>
          </>
        }
      />

      <FilterBar
        extra={
          hasFilters && (
            <Link href="/admin/marketplace" className="text-[12px] font-medium text-muted hover:text-foreground">
              Clear
            </Link>
          )
        }
      >
        <Field label="Search" grow htmlFor="q">
          <input id="q" name="q" defaultValue={q ?? ""} placeholder="Title or description" className="field-input" />
        </Field>
        <Field label="Category" htmlFor="category">
          <select id="category" name="category" defaultValue={category ?? ""} className="field-select">
            <option value="">Any category</option>
            {LISTING_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status" htmlFor="status">
          <select id="status" name="status" defaultValue={status ?? ""} className="field-select">
            <option value="">Any status</option>
            {(Object.keys(STATUS_LABEL) as ListingStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
      </FilterBar>

      {listings.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No listings match these filters" : "Nothing on the Marketplace yet"}
          description={hasFilters ? "Try a broader search or clear the filters." : "Add the first product: a service, a digital good, an item or organizer merch."}
          action={
            !hasFilters && (
              <Link href="/admin/marketplace/new" className="btn-secondary">
                New listing
              </Link>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Listing</th>
                  <th>Category</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">Stock</th>
                  <th>Status</th>
                  <th className="text-right">Added</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => (
                  <RowLink key={l.id} href={`/admin/marketplace/${l.id}`}>
                    <td className="max-w-[360px]">
                      <Link href={`/admin/marketplace/${l.id}`} className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate font-medium text-foreground">{l.title}</span>
                        <span className="truncate text-[12px] text-muted">
                          {l.game ? `${l.game} · ` : ""}by {l.seller.displayName}
                        </span>
                      </Link>
                    </td>
                    <td className="text-muted">{categoryLabel(l.category)}</td>
                    <td className="text-stat text-right">{formatListingPrice(l.priceKobo)}</td>
                    <td className="text-right text-muted">{l.stock ?? "∞"}</td>
                    <td>
                      <StatusBadge tone={STATUS_TONE[l.status]} dot>
                        {STATUS_LABEL[l.status]}
                      </StatusBadge>
                    </td>
                    <td className="text-right text-muted">{l.createdAt.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</td>
                  </RowLink>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={pageHref} />
        </div>
      )}
    </>
  );
}
