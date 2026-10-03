"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { logout } from "@/lib/logout";

export default function SignOutButton() {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        setBusy(true);
        void logout("/login");
      }}
      disabled={busy}
      className="btn-secondary w-fit gap-2"
    >
      <LogOut size={15} aria-hidden /> {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
