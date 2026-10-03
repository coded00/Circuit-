/**
 * Circuit — Admin Communities: every game hub and player community, with
 * real numbers (members, last activity, owner) and a take-down/restore
 * switch. Tournament communities are managed from their tournament.
 */

import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { communityHref } from "@/lib/community";
import { CommunityEnabledToggle } from "@/components/admin/CommunityEnabledToggle";
import { NewOfficialCommunity } from "@/components/admin/NewOfficialCommunity";
import { Avatar, EmptyState, Field, FilterBar, PageHeader, StatusBadge } from "@/components/admin/ui";

type SearchParams = { q?: string; kind?: string; status?: string };

function formatDate(date: Date | null): string {
  return date ? date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" }) : "—";
}

export default async function AdminCommunitiesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { q, kind, status } = await searchParams;
  const where: Prisma.CommunityWhereInput = {
    kind: kind === "GAME_HUB" || kind === "PLAYER" || kind === "OFFICIAL" ? kind : { in: ["GAME_HUB", "OFFICIAL", "PLAYER", "GLOBAL"] },
    ...(status === "disabled" ? { enabled: false } : status === "active" ? { enabled: true } : {}),
    ...(q?.trim() ? { OR: [{ name: { contains: q.trim(), mode: "insensitive" } }, { slug: { contains: q.trim().toLowerCase() } }] } : {}),
  };
  const communities = await prisma.community.findMany({
    where,
    orderBy: [{ kind: "asc" }, { lastActivityAt: { sort: "desc", nulls: "last" } }],
    take: 100,
    include: { owner: { select: { handle: true } }, _count: { select: { members: true } } },
  });

  const hasFilters = !!(q || kind || status);
  const kindLabel = (c: (typeof communities)[number]) =>
    c.kind === "GAME_HUB" ? "Game hub" : c.kind === "OFFICIAL" ? `Official · ${c.category === "LOCATION" ? "city" : "interest"}` : c.kind === "GLOBAL" ? "Circuit" : `Player · ${c.joinPolicy.toLowerCase()}`;

  return (
    <>
      <PageHeader
        title="Communities"
        description="Game hubs are created for every published game. Suspend anything that breaks the rules. Owners see the reason and can appeal from Reports & appeals."
        actions={<NewOfficialCommunity />}
      />

      <FilterBar
        extra={
          hasFilters && (
            <Link href="/admin/communities" className="text-[12px] font-medium text-muted hover:text-foreground">
              Clear
            </Link>
          )
        }
      >
        <Field label="Search" grow htmlFor="q">
          <input id="q" name="q" defaultValue={q ?? ""} placeholder="Name or link" className="field-input" />
        </Field>
        <Field label="Type" htmlFor="kind">
          <select id="kind" name="kind" defaultValue={kind ?? ""} className="field-select">
            <option value="">All types</option>
            <option value="GAME_HUB">Game hubs</option>
            <option value="OFFICIAL">Cities &amp; interests</option>
            <option value="PLAYER">Player communities</option>
          </select>
        </Field>
        <Field label="Status" htmlFor="status">
          <select id="status" name="status" defaultValue={status ?? ""} className="field-select">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="disabled">Suspended / closed</option>
          </select>
        </Field>
      </FilterBar>

      {communities.length === 0 ? (
        <EmptyState title={hasFilters ? "No communities match these filters" : "No communities yet"} />
      ) : (
        <div className="table-wrap">
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                <th>Community</th>
                <th>Type</th>
                <th>Owner</th>
                <th className="text-right">Members</th>
                <th className="text-right">Last active</th>
                <th>Status</th>
                <th className="w-[1%]" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {communities.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={communityHref(c)} target="_blank" className="flex items-center gap-3">
                      <Avatar name={c.name ?? "?"} src={c.iconUrl} size={30} square />
                      <span className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate font-medium text-foreground">{c.name}</span>
                        <span className="truncate text-[12px] text-muted">/{c.slug}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="text-muted">{kindLabel(c)}</td>
                  <td className="text-muted">{c.owner ? `@${c.owner.handle}` : "Staff"}</td>
                  <td className="text-right">{c._count.members.toLocaleString("en-NG")}</td>
                  <td className="text-right text-muted">{formatDate(c.lastActivityAt)}</td>
                  <td>
                    {c.kind === "GLOBAL" ? (
                      <StatusBadge tone="neutral">Always on</StatusBadge>
                    ) : c.enabled ? (
                      <StatusBadge tone="success" dot>
                        Active
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="danger">{c.suspendedAt ? "Suspended" : "Closed"}</StatusBadge>
                    )}
                  </td>
                  <td className="text-right">{c.kind !== "GLOBAL" && <CommunityEnabledToggle communityId={c.id} enabled={c.enabled} name={c.name ?? "this community"} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
