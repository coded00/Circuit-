/**
 * Circuit — robots.txt. Defense-in-depth alongside each private route's
 * own `robots: { index: false }` metadata (dashboard/admin/staff layouts,
 * account/wallet/notifications pages): those stop indexing even if
 * crawled, this stops crawling in the first place. Every path here is a
 * real private/functional route, not a guess — cross-checked against the
 * actual src/app tree.
 */

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin",
        "/admin/",
        "/dashboard",
        "/dashboard/",
        "/account",
        "/wallet",
        "/notifications",
        "/staff/",
        "/friends",
        // Utility-only, zero search value; reset-password's own query
        // param can carry a one-time token, which must never be crawled.
        // /login and /signup stay allowed — real, searched-for entry
        // points ("circuit sign up"), unlike these two.
        "/forgot-password",
        "/reset-password",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
