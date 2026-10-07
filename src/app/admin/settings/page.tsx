/**
 * Circuit — Admin Settings. Five real sections:
 *
 * - Admin Profile: the same real `/account` settings every user has —
 *   opens in a new tab rather than duplicating that form here.
 * - Admin Users: real `isStaff`/`adminRole` management — grant, change
 *   role, revoke. SUPER_ADMIN only (see `AdminRole`'s schema comment);
 *   a MODERATOR sees the list read-only.
 * - Roles & Permissions: a static explainer of the two fixed roles —
 *   there's no per-permission matrix to browse, so this is documentation,
 *   not another actionable table.
 * - Platform Settings: the real platform-wide controls Circuit has —
 *   maintenance mode, the platform fee rate, and the organizer-revenue
 *   settlement window (see `PlatformSetting`'s own schema comment for why
 *   these are admin-configurable rather than code constants).
 * - Audit Log: a real, read-only feed of every write the routes above
 *   (plus user-suspend/tournament-cancel/tournament-edit) have logged.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { AdminUsersManager } from "@/components/admin/AdminUsersManager";
import { MaintenanceModeToggle } from "@/components/admin/MaintenanceModeToggle";
import { PlatformFeeControl } from "@/components/admin/PlatformFeeControl";
import { OrganizerRevenueSettlementControl } from "@/components/admin/OrganizerRevenueSettlementControl";
import { PayoutAutoApproveControl } from "@/components/admin/PayoutAutoApproveControl";
import { StakedBattlesControl } from "@/components/admin/StakedBattlesControl";
import { ArrowUpRight } from "lucide-react";
import { EmptyState, PageHeader, Panel, PanelRow, Section } from "@/components/admin/ui";

function timeAgo(date: Date): string {
  const ms = Date.now() - date.getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

const ACTION_LABELS: Record<string, string> = {
  "announcement.create": "posted an announcement",
  "announcement.delete": "deleted an announcement",
  "banner.create": "added a homepage slide",
  "banner.update": "edited a homepage slide",
  "banner.delete": "deleted a homepage slide",
  "calendarEvent.create": "added a calendar event",
  "calendarEvent.delete": "deleted a calendar event",
  "challenge.cancel": "cancelled a challenge",
  "community.create_official": "created an official community",
  "dispute.rule": "ruled on a dispute",
  "dispute.void": "voided a disputed match",
  "game.create": "created a game",
  "game.update": "edited a game",
  "game.delete": "deleted a game",
  "gameMode.create": "added a game mode",
  "gameMode.update": "edited a game mode",
  "gameMode.delete": "deleted a game mode",
  "gameFormat.create": "added a format",
  "gameFormat.update": "edited a format",
  "gameFormat.delete": "deleted a format",
  "quickMatch.cancel": "cancelled a Quick Match",
  "report.statusChange": "updated a report",
  "settings.platformFeeChange": "changed the platform fee",
  "settings.organizerRevenueSettlementHoursChange": "changed the revenue settlement window",
  "settings.maintenanceModeChange": "changed maintenance mode",
  "settings.stakedBattlesOn": "turned staked Battles on",
  "settings.stakedBattlesOff": "turned staked Battles off",
  "settings.maxLockedStakeChange": "changed the at-once stake limit",
  "settings.maxDailyStakeChange": "changed the daily stake limit",
  "staff.grant": "granted admin access",
  "staff.revoke": "revoked admin access",
  "staff.roleChange": "changed an admin's role",
  "tournament.cancel": "cancelled a tournament",
  "tournament.edit": "edited a tournament",
  "tournament.freezeFunds": "froze a tournament's funds",
  "tournament.unfreezeFunds": "unfroze a tournament's funds",
  "user.suspend": "suspended a user",
  "user.unsuspend": "restored a user",
  "user.selfExclusionLift": "lifted a player's staking cool-off",
  "videos.import": "imported feed videos",
  "videos.publish_all": "published all video drafts",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/[._]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

/** Where an audit entry's target lives in the admin, if it has a page. */
function targetHref(type: string | null, id: string | null): string | null {
  if (!type || !id) return null;
  if (type === "Tournament") return `/admin/competitions/${id}`;
  if (type === "User") return `/admin/users/${id}`;
  if (type === "Battle") return `/admin/challenges/${id}`;
  if (type === "Game") return `/admin/games/${id}`;
  if (type === "QuickMatchChallenge") return `/admin/quick-matches/${id}`;
  return null;
}

export default async function AdminSettingsPage() {
  const admin = await getCurrentUser();
  const isSuperAdmin = admin?.adminRole === "SUPER_ADMIN";

  const [staff, platformSetting, auditLog] = await Promise.all([
    prisma.user.findMany({
      where: { isStaff: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, displayName: true, handle: true, emailOrPhone: true, adminRole: true },
    }),
    prisma.platformSetting.findUnique({ where: { id: "singleton" } }),
    prisma.auditLogEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { actor: { select: { displayName: true, handle: true } } },
    }),
  ]);

  const sections = [
    { id: "platform", label: "Platform" },
    { id: "access", label: "Admin access" },
    { id: "audit", label: "Audit log" },
    { id: "profile", label: "Your profile" },
  ];

  return (
    <>
      <PageHeader title="Settings" description="Platform-wide controls, who has admin access, and everything staff have changed." />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[160px_minmax(0,1fr)]">
        <nav className="hidden flex-col gap-0.5 self-start lg:sticky lg:top-20 lg:flex" aria-label="Settings sections">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-[6px] px-2.5 py-1.5 text-[13px] text-muted transition-colors hover:bg-surface hover:text-foreground">
              {s.label}
            </a>
          ))}
        </nav>

        <div className="flex min-w-0 flex-col gap-10">
          <Section
            id="platform"
            title="Platform"
            description={isSuperAdmin ? "Changes apply to everyone immediately and are recorded in the audit log." : "Only a super admin can change these."}
          >
            <Panel padded={false}>
              <PanelRow>
                <div className="w-full">
                  <MaintenanceModeToggle enabled={platformSetting?.maintenanceMode ?? false} canEdit={isSuperAdmin} />
                </div>
              </PanelRow>
              <PanelRow>
                <div className="w-full">
                  <PlatformFeeControl platformFeeBps={platformSetting?.platformFeeBps ?? 500} canEdit={isSuperAdmin} />
                </div>
              </PanelRow>
              <PanelRow>
                <div className="w-full">
                  <OrganizerRevenueSettlementControl hours={platformSetting?.organizerRevenueSettlementHours ?? 24} canEdit={isSuperAdmin} />
                </div>
              </PanelRow>
              <PanelRow>
                <div className="w-full">
                  <PayoutAutoApproveControl enabled={platformSetting?.payoutAutoApprove ?? true} maxKobo={platformSetting?.payoutAutoApproveMaxKobo ?? 50_000_000} canEdit={isSuperAdmin} />
                </div>
              </PanelRow>
              <PanelRow>
                <div className="w-full">
                  <StakedBattlesControl
                    enabled={platformSetting?.stakedBattlesEnabled ?? true}
                    maxLockedKobo={platformSetting?.maxLockedStakeKobo ?? 50_000_000}
                    maxDailyKobo={platformSetting?.maxDailyStakeKobo ?? 100_000_000}
                    canEdit={isSuperAdmin}
                  />
                </div>
              </PanelRow>
            </Panel>
          </Section>

          <Section id="access" title="Admin access" description="Moderators run day-to-day operations; super admins also manage admins and platform settings.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Panel>
                <p className="text-[13px] font-medium text-foreground">Moderator</p>
                <p className="mt-1 text-[12px] leading-5 text-muted">
                  Suspend and restore users, manage competitions and challenges, rule on escalated disputes, and edit homepage and calendar content.
                </p>
              </Panel>
              <Panel>
                <p className="text-[13px] font-medium text-foreground">Super admin</p>
                <p className="mt-1 text-[12px] leading-5 text-muted">Everything a moderator can do, plus granting, changing and revoking admin access, and platform settings.</p>
              </Panel>
            </div>
            {isSuperAdmin ? (
              <AdminUsersManager staff={staff.map((s) => ({ ...s }))} currentUserId={admin!.id} />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Admin</th>
                      <th>Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <span className="font-medium text-foreground">{s.displayName}</span> <span className="text-muted">@{s.handle}</span>
                        </td>
                        <td className="text-muted">{s.adminRole === "SUPER_ADMIN" ? "Super admin" : "Moderator"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section id="audit" title="Audit log" description="The last 30 staff actions.">
            {auditLog.length === 0 ? (
              <EmptyState title="No admin actions logged yet" />
            ) : (
              <Panel padded={false}>
                {auditLog.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-[13px] last:border-b-0 sm:px-5">
                    <span className="min-w-0 flex-1 truncate text-muted">
                      <span className="font-medium text-foreground">{entry.actor.displayName}</span> {actionLabel(entry.action)}
                      {targetHref(entry.targetType, entry.targetId) && (
                        <>
                          {" "}
                          <Link href={targetHref(entry.targetType, entry.targetId)!} className="text-foreground hover:underline">
                            View
                          </Link>
                        </>
                      )}
                    </span>
                    <span className="shrink-0 text-[12px] text-muted-strong" title={entry.createdAt.toLocaleString("en-NG")}>
                      {timeAgo(entry.createdAt)}
                    </span>
                  </div>
                ))}
              </Panel>
            )}
          </Section>

          <Section id="profile" title="Your profile" description="Display name, handle, bio and password. The same settings every Circuit account has.">
            <div>
              <Link href="/account" target="_blank" className="btn-secondary">
                Edit profile <ArrowUpRight size={14} />
              </Link>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
