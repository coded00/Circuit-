"use client";

/**
 * Circuit — "Log in" / "Sign up" links that bring the visitor back to the
 * page they were on afterwards (instead of always landing on the home feed).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { loginPath, signupPath } from "@/lib/safeRedirect";

export function GuestAuthLink({
  mode,
  className,
  onClick,
  children,
}: {
  mode: "login" | "signup";
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <Link href={mode === "login" ? loginPath(pathname) : signupPath(pathname)} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
