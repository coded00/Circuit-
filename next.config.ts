import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
