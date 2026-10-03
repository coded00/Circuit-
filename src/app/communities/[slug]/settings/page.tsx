/**
 * Circuit — running a community: details (owner/staff), channels,
 * members & bans, invite links, and the application queue (moderators).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { loginPath } from "@/lib/safeRedirect";
import { SITE_URL } from "@/lib/seo";
import { canModerate, effectiveRole } from "@/lib/community";
import { listApplications, listBans, listInvites, listMembers } from "@/lib/communityModeration";
import { listCommunityReports } from "@/lib/communityReports";
import { CommunityAvatar } from "@/components/community/CommunityAvatar";
import { CommunityForm } from "@/components/community/CommunityForm";
import { ApplicationQueue, ChannelManager, CloseCommunity, InviteManager, MemberManager, ReportQueue } from "@/components/community/CommunitySettingsPanels";

export const metadata: Metadata = { title: "Community settings", robots: { index: false, follow: false } };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "channels", label: "Channels" },
  { key: "members", label: "Members" },
  { key: "invites", label: "Invites" },
  { key: "applications", label: "Applications" },
  { key: "reports", label: "Reports" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function CommunitySettingsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug } = await params;
  const { tab: tabParam } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(loginPath(`/communities/${slug}/settings${tabParam ? `?tab=${tabParam}` : ""}`));

  const community = await prisma.community.findUnique({ where: { slug }, include: { tournament: { select: { organizerId: true } } } });
  if (!community || community.kind === "TOURNAMENT" || (!community.enabled && !user.isStaff)) notFound();
  const role = await effectiveRole(community, user);
  if (!canModerate(role)) redirect(`/communities/${slug}`);

  const isOwner = role === "OWNER";
  const canEditDetails = isOwner || user.isStaff;
  const usesInvites = community.kind === "PLAYER" || community.kind === "GAME_HUB";
  const tabs = TABS.filter((t) => (t.key !== "applications" || community.joinPolicy === "APPLY") && (t.key !== "invites" || usesInvites));
  const tab: Tab = tabs.some((t) => t.key === tabParam) ? (tabParam as Tab) : "overview";
  const name = community.name ?? "Community";
  const [pendingCount, openReports] = await Promise.all([
    community.joinPolicy === "APPLY" ? prisma.communityApplication.count({ where: { communityId: community.id, status: "PENDING" } }) : 0,
    prisma.communityReport.count({ where: { communityId: community.id, status: "OPEN" } }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <Link href={`/communities/${slug}`} className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground">
        <ArrowLeft size={15} /> Back to {name}
      </Link>
      <header className="flex items-center gap-3">
        <CommunityAvatar name={name} iconUrl={community.iconUrl} tag={community.tag} size="md" />
        <div className="flex flex-col">
          <h1 className="font-display text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted">{name}</p>
        </div>
      </header>

      <nav aria-label="Settings sections" className="scrollbar-hide -mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/communities/${slug}/settings?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${
              tab === t.key ? "border-accent-volt text-foreground" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
            {((t.key === "applications" && pendingCount > 0) || (t.key === "reports" && openReports > 0)) && (
              <span className="flex h-5 min-w-5 items-center justify-center cut-xs bg-live px-1.5 font-mono text-[11px] text-white">
                {t.key === "reports" ? openReports : pendingCount}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {tab === "overview" &&
        (canEditDetails ? (
          <div className="flex flex-col gap-8">
            <CommunityForm
              mode="edit"
              communityId={community.id}
              lockedIdentity={community.kind !== "PLAYER"}
              games={await prisma.game.findMany({ where: { enabled: true, publishedAt: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true } })}
              initial={{
                category: community.category ?? "",
                name,
                slug: community.slug ?? "",
                description: community.description ?? "",
                tag: community.tag ?? "",
                gameId: community.gameId ?? "",
                region: community.region ?? "",
                joinPolicy: community.joinPolicy,
                rules: community.rules ?? "",
                applicationQuestion: community.applicationQuestion ?? "",
                iconUrl: community.iconUrl ?? "",
                bannerUrl: community.bannerUrl ?? "",
              }}
            />
            {community.kind === "PLAYER" && community.enabled && <CloseCommunity communityId={community.id} name={name} />}
          </div>
        ) : (
          <p className="rounded-[14px] border border-border bg-surface px-4 py-4 text-sm text-muted">Only the owner can change the community&apos;s details. As a moderator you can manage channels, members and invites.</p>
        ))}

      {tab === "channels" && (
        <ChannelManager
          communityId={community.id}
          channels={(await prisma.channel.findMany({ where: { communityId: community.id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] })).map((c) => ({
            id: c.id,
            key: c.key,
            name: c.name,
            modOnly: c.modOnly,
          }))}
        />
      )}

      {tab === "members" && (
        <MemberManager
          communityId={community.id}
          members={await (async () => {
            const [members, mutes] = await Promise.all([
              listMembers(community.id),
              prisma.communityMute.findMany({ where: { communityId: community.id, until: { gt: new Date() } }, select: { userId: true, until: true } }),
            ]);
            const mutedUntil = new Map(mutes.map((m) => [m.userId, m.until.toISOString()]));
            return members.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString(), mutedUntil: mutedUntil.get(m.userId) ?? null }));
          })()}
          bans={(await listBans(community.id)).map((b) => ({ userId: b.userId, handle: b.user.handle, displayName: b.user.displayName, reason: b.reason }))}
          viewerId={user.id}
          viewerIsOwner={isOwner}
          viewerIsStaff={user.isStaff}
          canTransfer={isOwner && community.kind === "PLAYER" && community.ownerId === user.id}
        />
      )}

      {tab === "invites" && (
        <InviteManager
          communityId={community.id}
          communityName={name}
          origin={SITE_URL}
          invites={(await listInvites(community.id, user)).map((i) => ({
            id: i.id,
            code: i.code,
            uses: i.uses,
            maxUses: i.maxUses,
            expiresAt: i.expiresAt?.toISOString() ?? null,
            createdBy: i.createdBy.handle,
          }))}
        />
      )}

      {tab === "reports" && (
        <ReportQueue
          reports={(await listCommunityReports(community.id)).map((r) => ({
            id: r.id,
            status: r.status as "OPEN" | "ESCALATED",
            targetType: r.targetType,
            reason: r.reason,
            details: r.details,
            messageContent: r.messageContent,
            messageRemoved: !r.message || !!r.message.deletedAt,
            channelName: r.message?.channel.name ?? null,
            createdAt: r.createdAt.toISOString(),
            reporter: r.reporter,
            targetUser: r.targetUser,
          }))}
        />
      )}

      {tab === "applications" && (
        <ApplicationQueue
          communityId={community.id}
          question={community.applicationQuestion}
          applications={(await listApplications(community.id)).map((a) => ({ id: a.id, answer: a.answer, createdAt: a.createdAt.toISOString(), user: a.user }))}
        />
      )}
    </div>
  );
}
