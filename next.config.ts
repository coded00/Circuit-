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
            // The part of a Content-Security-Policy that cannot break this app: no plugins, no
            // <base> tag hijack, and no framing by other sites. A script-src policy needs per-request
            // nonces and a staged rollout, so it is not switched on here.
            key: "Content-Security-Policy",
            value: "object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
          },
          {
            // The full policy, in report-only mode first: nothing is blocked, but every violation is reported to
            // /api/csp-report so the allow-list can be checked against real traffic before it is enforced.
            // Inline scripts stay allowed ('unsafe-inline') because the framework emits them without a per-request
            // nonce; what this policy limits is where scripts load from and where the page can send data.
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://cdn.onesignal.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://onesignal.com https://*.onesignal.com",
              "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
              "media-src 'self' blob: https:",
              "worker-src 'self' blob:",
              "manifest-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
              "report-uri /api/csp-report",
            ].join("; "),
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
