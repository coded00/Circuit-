/**
 * Circuit — Admin Communities: every game hub and player community, with
 * real numbers (members, last activity, owner) and a take-down/restore
 * switch. Tournament communities are managed from their tournament.
 */

import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { communityHref } from "@/lib/community";
import { CommunityAvatar } from "@/components/community/CommunityAvatar";
import { CommunityEnabledToggle } from "@/components/admin/CommunityEnabledToggle";
import { NewOfficialCommunity } from "@/components/admin/NewOfficialCommunity";

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

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Communities</h1>
        <p className="text-sm text-muted">Game hubs are created automatically for every published game. Suspend anything that breaks the rules — owners can appeal from Reports & appeals.</p>
      </div>

      <NewOfficialCommunity />

      <form className="card filter-bar">
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <label className="field-label" htmlFor="q">
            Search
          </label>
          <input id="q" name="q" defaultValue={q ?? ""} placeholder="Name or link" className="field-input" />
        </div>
        <div className="flex min-w-[140px] flex-col gap-1.5">
          <label className="field-label" htmlFor="kind">
            Type
          </label>
          <select id="kind" name="kind" defaultValue={kind ?? ""} className="field-select">
            <option value="">All</option>
            <option value="GAME_HUB">Game hubs</option>
            <option value="OFFICIAL">Cities &amp; interests</option>
            <option value="PLAYER">Player communities</option>
          </select>
        </div>
        <div className="flex min-w-[140px] flex-col gap-1.5">
          <label className="field-label" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" defaultValue={status ?? ""} className="field-select">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="disabled">Suspended / closed</option>
          </select>
        </div>
        <button type="submit" className="btn-primary h-11 px-5">
          Filter
        </button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">Community</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Members</th>
              <th className="px-4 py-3 font-medium">Last active</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {communities.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <Link href={communityHref(c)} className="flex items-center gap-3 hover:underline">
                    <CommunityAvatar name={c.name ?? "?"} iconUrl={c.iconUrl} tag={c.tag} size="sm" />
                    <span className="flex flex-col">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-muted">/{c.slug}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">{c.kind === "GAME_HUB" ? "Game hub" : c.kind === "OFFICIAL" ? `Official · ${c.category === "LOCATION" ? "location" : "interest"}` : c.kind === "GLOBAL" ? "Circuit" : `Player · ${c.joinPolicy.toLowerCase()}`}</td>
                <td className="px-4 py-3 text-muted">{c.owner ? `@${c.owner.handle}` : "Staff"}</td>
                <td className="px-4 py-3 tabular-nums">{c._count.members.toLocaleString("en-NG")}</td>
                <td className="px-4 py-3 text-muted">{formatDate(c.lastActivityAt)}</td>
                <td className="px-4 py-3">{c.kind === "GLOBAL" ? <span className="text-muted">Always on</span> : <span className="flex items-center gap-2">
                      {!c.enabled && <span className="badge badge-cancelled">{c.suspendedAt ? "Suspended" : "Closed"}</span>}
                      <CommunityEnabledToggle communityId={c.id} enabled={c.enabled} name={c.name ?? "this community"} />
                    </span>}</td>
              </tr>
            ))}
            {communities.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  No communities match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
