/**
 * Circuit — admin control-center shell. A separate surface from the
 * player app (see `AppShell.tsx`'s bare-route list), gated the same way
 * `/staff/*` already is: signed-in + `User.isStaff`, redirect otherwise.
 * There's no separate "admin" role in the schema yet — staff access is
 * the real, existing concept this reuses rather than inventing a new one.
 *
 * Dark end-to-end via `data-surface="dark"` on the whole subtree — the
 * same scoping mechanism the player app's own hero/sidebar already use,
 * so every shared class (`.card`, `.btn-primary`, `.badge`, ...) renders
 * correctly here with zero new component variants.
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopBar } from "@/components/admin/AdminTopBar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/admin");
  }
  if (!user.isStaff) {
    redirect("/");
  }

  return (
    <div data-surface="dark" className="flex min-h-screen w-full bg-background text-foreground">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar admin={{ displayName: user.displayName, avatarUrl: user.avatarUrl }} />
        <main className="flex flex-1 flex-col gap-6 p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
