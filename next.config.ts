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
