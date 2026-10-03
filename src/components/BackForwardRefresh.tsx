"use client";

/**
 * Circuit — when a browser restores a page from its back/forward cache
 * (Safari does this even for no-store pages), the page is a frozen
 * snapshot: after logging out, Back could show the previous account's
 * wallet or notifications. Re-render it against the current session
 * instead; a protected page then redirects to login as it normally would.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function BackForwardRefresh() {
  const router = useRouter();
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) router.refresh();
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [router]);
  return null;
}
