"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type StaffUser = { id: string; displayName: string; handle: string; emailOrPhone: string; adminRole: string | null };

/**
 * Circuit — Settings > Admin Users. Only rendered for a SUPER_ADMIN (the
 * page itself gates this); the API routes underneath enforce the same
 * thing independently, so this component never has to trust its own
 * visibility as the real security boundary.
 */
export function AdminUsersManager({ staff, currentUserId }: { staff: StaffUser[]; currentUserId: string }) {
  const router = useRouter();
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
    await fetch(`/api/admin/staff/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    router.refresh();
  }

  async function revoke(id: string, name: string) {
    if (!confirm(`Revoke admin access for ${name}?`)) return;
    await fetch(`/api/admin/staff/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revoke: true }),
    });
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td>
                  <span className="font-medium">{s.displayName}</span> <span className="text-muted">(@{s.handle})</span>
                </td>
                <td>
                  {s.id === currentUserId ? (
                    <span className="badge badge-brand">{s.adminRole ?? "MODERATOR"} (you)</span>
                  ) : (
                    <select
                      defaultValue={s.adminRole ?? "MODERATOR"}
                      onChange={(e) => changeRole(s.id, e.target.value)}
                      className="field-select w-auto py-1 text-xs"
                    >
                      <option value="SUPER_ADMIN">Super Admin</option>
                      <option value="MODERATOR">Moderator</option>
                    </select>
                  )}
                </td>
                <td>
                  {s.id !== currentUserId && (
                    <button type="button" onClick={() => revoke(s.id, s.displayName)} className="text-xs font-medium text-danger hover:underline">
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={grant} className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <label htmlFor="grant-identifier" className="field-label">Grant access to (handle or email)</label>
          <input id="grant-identifier" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="field-input" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="grant-role" className="field-label">Role</label>
          <select id="grant-role" value={role} onChange={(e) => setRole(e.target.value)} className="field-select">
            <option value="MODERATOR">Moderator</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </select>
        </div>
        <button type="submit" disabled={submitting} className="btn-primary text-sm">
          {submitting ? "Granting…" : "Grant access"}
        </button>
      </form>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
