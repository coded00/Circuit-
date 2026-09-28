"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";

type StaffUser = { id: string; displayName: string; handle: string; emailOrPhone: string; adminRole: string | null };

/**
 * Circuit — Settings > Admin Users. Only rendered for a SUPER_ADMIN (the
 * page itself gates this); the API routes underneath enforce the same
 * thing independently, so this component never has to trust its own
 * visibility as the real security boundary.
 */
export function AdminUsersManager({ staff, currentUserId }: { staff: StaffUser[]; currentUserId: string }) {
  const router = useRouter();
  const confirmDialog = useConfirmDialog();
  const [identifier, setIdentifier] = useState("");
  const [role, setRole] = useState("MODERATOR");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, role }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setIdentifier("");
    router.refresh();
  }

  async function changeRole(id: string, newRole: string) {
    setError(null);
    const res = await fetch(`/api/admin/staff/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    }).catch(() => null);
    if (!res?.ok) setError(((await res?.json().catch(() => null))?.error as string) ?? "Couldn't change that role.");
    router.refresh();
  }

  async function revoke(id: string, name: string) {
    if (!(await confirmDialog({ title: `Revoke admin access for ${name}?`, confirmLabel: "Revoke access" }))) return;
    setError(null);
    const res = await fetch(`/api/admin/staff/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revoke: true }),
    }).catch(() => null);
    if (!res?.ok) setError(((await res?.json().catch(() => null))?.error as string) ?? "Couldn't revoke access.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Admin</th>
              <th>Role</th>
              <th className="w-[1%]" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td>
                  <span className="flex flex-col leading-tight">
                    <span className="font-medium text-foreground">{s.displayName}</span>
                    <span className="text-[12px] text-muted">@{s.handle}</span>
                  </span>
                </td>
                <td>
                  {s.id === currentUserId ? (
                    <span className="text-[13px] text-foreground">
                      {s.adminRole === "SUPER_ADMIN" ? "Super admin" : "Moderator"} <span className="text-muted">· you</span>
                    </span>
                  ) : (
                    <select
                      defaultValue={s.adminRole ?? "MODERATOR"}
                      onChange={(e) => changeRole(s.id, e.target.value)}
                      className="field-select !w-auto !min-h-8 !py-1 !text-[12px]"
                    >
                      <option value="SUPER_ADMIN">Super Admin</option>
                      <option value="MODERATOR">Moderator</option>
                    </select>
                  )}
                </td>
                <td className="text-right">
                  {s.id !== currentUserId && (
                    <button type="button" onClick={() => revoke(s.id, s.displayName)} className="btn-ghost !min-h-8 !px-2.5 !text-[12px] hover:!text-danger">
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={grant} className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <label htmlFor="grant-identifier" className="field-label">Grant access (handle or email)</label>
          <input id="grant-identifier" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="field-input" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="grant-role" className="field-label">Role</label>
          <select id="grant-role" value={role} onChange={(e) => setRole(e.target.value)} className="field-select">
            <option value="MODERATOR">Moderator</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </select>
        </div>
        <button type="submit" disabled={submitting} className="btn-secondary">
          {submitting ? "Granting…" : "Grant access"}
        </button>
      </form>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
