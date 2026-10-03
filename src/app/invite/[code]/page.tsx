/**
 * Circuit — where an invite link lands (/invite/<code>). Built to be
 * shared on WhatsApp/X: the link unfurls with the community's name,
 * description and banner, and the page itself shows who's inside before
 * asking anyone to sign up. Guests sign up/log in and come straight back
 * here (next=), then accept.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Link2Off, MessageCircle, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { communityHref } from "@/lib/community";
import { getActivityStats } from "@/lib/communityDirectory";
import { resolveInvite } from "@/lib/communityModeration";
import { INVITE_CODE_PATTERN } from "@/lib/communityRules";
import { loginPath, signupPath } from "@/lib/safeRedirect";
import { SITE_URL } from "@/lib/seo";
import { CommunityAvatar } from "@/components/community/CommunityAvatar";
import { JoinCommunityPanel } from "@/components/community/JoinCommunityPanel";

type Params = { params: Promise<{ code: string }> };

async function load(code: string) {
  return INVITE_CODE_PATTERN.test(code) ? resolveInvite(code) : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const resolved = await load((await params).code);
  if (!resolved) return { title: "Invite not found", robots: { index: false, follow: false } };
  const { community } = resolved;
  const name = community.name ?? "a community";
  const description = community.description ?? `${community._count.members} members on Circuit. Tournaments, challenges and people to play with.`;
  const image = community.bannerUrl ? (community.bannerUrl.startsWith("/") ? `${SITE_URL}${community.bannerUrl}` : community.bannerUrl) : undefined;
  return {
    title: `Join ${name}`,
    description,
    robots: { index: false, follow: false },
    openGraph: { title: `You're invited to ${name} on Circuit`, description, images: image ? [image] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title: `Join ${name} on Circuit`, description },
  };
}

export default async function InvitePage({ params }: Params) {
  const { code } = await params;
  const [resolved, user] = await Promise.all([load(code), getCurrentUser()]);
  if (!resolved) notFound();
  const { invite, community, problem } = resolved;
  const name = community.name ?? "Community";
  const here = `/invite/${code}`;
  const href = communityHref(community);

  const [stats, membership, banned] = await Promise.all([
    getActivityStats([community.id]),
    user ? prisma.communityMember.findUnique({ where: { communityId_userId: { communityId: community.id, userId: user.id } } }) : null,
    user ? prisma.communityBan.count({ where: { communityId: community.id, userId: user.id } }) : 0,
  ]);
  const posters = stats.get(community.id)?.posters ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="relative w-full overflow-hidden cut-lg [--cut-line:var(--border)] border border-border bg-surface">
        <div className="relative h-28 w-full overflow-hidden">
          {community.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- uploaded or external banner
            <img src={community.bannerUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-[#15181d] bg-[radial-gradient(80%_140%_at_80%_0%,color-mix(in_srgb,var(--accent-volt)_35%,transparent),transparent_60%)]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        </div>
        <div className="flex flex-col items-center gap-4 px-6 pb-6 text-center">
          <CommunityAvatar name={name} iconUrl={community.iconUrl} tag={community.tag} size="xl" className="relative z-10 -mt-12" />
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted">{invite.createdBy.displayName} invited you to join</p>
            <h1 className="flex items-center justify-center gap-2 font-display text-2xl font-bold tracking-tight">
              {name}
              {community.kind === "GAME_HUB" && <BadgeCheck size={20} className="text-accent-volt" aria-label="Official" />}
            </h1>
            {community.description && <p className="line-clamp-3 text-sm text-muted">{community.description}</p>}
          </div>
          <div className="flex items-center gap-4 text-[13px] text-muted">
            <span className="flex items-center gap-1.5">
              <Users size={14} /> {community._count.members.toLocaleString("en-NG")} member{community._count.members === 1 ? "" : "s"}
            </span>
            {posters > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-success" aria-hidden /> {posters} chatting this week
              </span>
            )}
          </div>

          <div className="w-full">
            {problem ? (
              <div className="flex flex-col items-center gap-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Link2Off size={16} className="text-muted" /> {problem === "closed" ? "This community has closed." : "This invite link has expired."}
                </p>
                {problem !== "closed" && community.joinPolicy !== "INVITE" && (
                  <Link href={href} className="btn-secondary h-11 w-full">
                    View the community
                  </Link>
                )}
              </div>
            ) : membership ? (
              <Link href={href} className="btn-primary h-12 w-full gap-2 text-[15px]">
                <MessageCircle size={17} /> You&apos;re in — open chat
              </Link>
            ) : !user ? (
              <div className="flex flex-col gap-2">
                <Link href={signupPath(here)} className="btn-primary h-12 w-full text-[15px]">
                  Sign up to join
                </Link>
                <Link href={loginPath(here)} className="btn-secondary h-11 w-full">
                  I already have an account
                </Link>
              </div>
            ) : (
              <JoinCommunityPanel
                communityId={community.id}
                name={name}
                joinPolicy={community.joinPolicy}
                rules={community.rules}
                applicationQuestion={community.applicationQuestion}
                banned={banned > 0}
                inviteCode={code}
                className="[&_button]:w-full"
              />
            )}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-strong">Circuit · Tournaments, 1v1 challenges and real prizes.</p>
    </div>
  );
}
