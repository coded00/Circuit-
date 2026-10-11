"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** One refresh right after mount. The header (wallet chip) renders in the
 *  layout, alongside the page — so on a payment callback that credits the
 *  wallet while the page renders, the layout may already have read the old
 *  balance. Refreshing once re-reads it. */
export default function RefreshOnce() {
  const router = useRouter();

  useEffect(() => {
    router.refresh();
  }, [router]);

  return null;
}
