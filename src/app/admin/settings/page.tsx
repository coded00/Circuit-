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
 * - Platform Settings: the two real platform-wide controls Circuit has
 *   — maintenance mode, and the platform fee rate (see `PlatformSetting`'s
 *   own schema comment for why the fee is admin-configurable rather than
 *   a code constant).
 * - Audit Log: a real, read-only feed of every write the routes above
 *   (plus user-suspend/tournament-cancel/tournament-edit) have logged.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { AdminUsersManager } from "@/components/admin/AdminUsersManager";
import { MaintenanceModeToggle } from "@/components/admin/MaintenanceModeToggle";
import { PlatformFeeControl } from "@/components/admin/PlatformFeeControl";

function timeAgo(date: Date): string {
  const ms = Date.now() - date.getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function actionLabel(action: string): string {
  return action.replace(/\./g, " · ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
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

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted">Your profile, admin access, platform-wide controls, and the audit trail.</p>
      </div>

      <div className="card flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-card-title">Admin Profile</h2>
          <p className="text-xs text-muted">Display name, handle, bio, password — same settings every Circuit account has.</p>
        </div>
        <Link href="/account" target="_blank" className="btn-secondary text-sm">
          Edit profile ↗
        </Link>
      </div>

      <div className="card flex flex-col gap-3">
        <h2 className="text-card-title">Admin Users</h2>
        {isSuperAdmin ? (
          <AdminUsersManager
            staff={staff.map((s) => ({ ...s }))}
            currentUserId={admin!.id}
          />
        ) : (
          <>
            <p className="text-xs text-muted">Only a Super Admin can grant, change, or revoke admin access.</p>
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
                        {s.displayName} <span className="text-muted">(@{s.handle})</span>
                      </td>
                      <td className="text-muted">{s.adminRole ?? "MODERATOR"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="card flex flex-col gap-3">
        <h2 className="text-card-title">Roles &amp; Permissions</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="widget flex flex-col gap-1.5">
            <span className="badge badge-brand w-fit">Super Admin</span>
            <p className="text-xs text-muted">
              Everything a Moderator can do, plus: grant/revoke admin access, change admin roles, and toggle Platform Settings.
            </p>
          </div>
          <div className="widget flex flex-col gap-1.5">
            <span className="badge badge-neutral w-fit">Moderator</span>
            <p className="text-xs text-muted">
              Suspend/unsuspend users, manage competitions and challenges, and edit homepage/calendar content. Can&apos;t manage
              other admins or platform-wide settings.
            </p>
          </div>
        </div>
      </div>

      <div className="card flex flex-col gap-4">
        <h2 className="text-card-title">Platform Settings</h2>
        <MaintenanceModeToggle enabled={platformSetting?.maintenanceMode ?? false} canEdit={isSuperAdmin} />
        <div className="border-t border-border pt-4">
          <PlatformFeeControl platformFeeBps={platformSetting?.platformFeeBps ?? 500} canEdit={isSuperAdmin} />
        </div>
        {!isSuperAdmin && <p className="text-xs text-muted">Only a Super Admin can change these.</p>}
      </div>

      <div className="card flex flex-col gap-3">
        <h2 className="text-card-title">Audit Log</h2>
        {auditLog.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No admin actions logged yet.</p>
        ) : (
          <div className="flex flex-col">
            {auditLog.map((entry, i) => (
              <div key={entry.id} className={`flex items-center justify-between gap-3 py-2.5 text-sm ${i > 0 ? "border-t border-border" : ""}`}>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{entry.actor.displayName}</span>{" "}
                  <span className="text-muted">{actionLabel(entry.action)}</span>
                  {entry.targetId && <span className="text-muted-strong"> · {entry.targetType}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-strong">{timeAgo(entry.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
