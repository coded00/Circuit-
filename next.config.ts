import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-only "Compiling..." pill and round N button sat on top of the sidebar and
  // the mobile tab bar while clicking around. Errors still show in the error overlay.
  devIndicators: false,
  // `output: "standalone"` was removed here — it was a leftover from a
  // past Netlify-targeted config (this app deploys to Vercel per
  // docs/pre-launch-checklist.md, whose own build pipeline already does
  // the same per-route dependency tracing natively) and turned out not
  // to be merely redundant: it actively breaks `next start`, which CI's
  // e2e suite needs to smoke-test a real production build
  // (playwright.config.ts) — confirmed by running that suite against
  // this build locally before wiring it into CI.
  async redirects() {
    return [
      // The old single post feed was replaced by /communities (channels,
      // mentions, reactions); keep old links and bookmarks working.
      { source: "/community", destination: "/communities", permanent: true },
      // The directory is now /communities itself.
      { source: "/communities/browse", destination: "/communities", permanent: true },
      // Mention notifications from before communities had their own pages
      // linked the Circuit chat as /communities?channel=…&message=…
      // (the query is carried over to the destination).
      { source: "/communities", has: [{ type: "query", key: "channel" }], destination: "/communities/circuit", permanent: false },
      // The staff queues moved into the admin control center.
      { source: "/staff/disputes", destination: "/admin/disputes", permanent: false },
      { source: "/staff/reports", destination: "/admin/reports", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        // Fixed brand images keep one name, so they can't be "immutable"; a week plus
        // revalidate beats Next's default 4 hours for files that almost never change.
        source: "/:file(circuit-logo.png|auth-hero.jpg)",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
      {
        // The Content-Security-Policy is deliberately absent from this list. It moved to src/proxy.ts,
        // because a nonce has to be generated per request and this file's headers are the same for every
        // response. Leaving a policy here would not be harmless either: it would be enforced *alongside*
        // the proxy's rather than replaced by it, and two policies intersect — the one without a nonce
        // would block every script the other had just approved.
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            // Always HTTPS from here on. Without this a visitor's first request can be downgraded to http.
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
