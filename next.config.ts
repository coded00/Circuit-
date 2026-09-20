import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Traces each route's actual dependency graph and prunes node_modules
  // down to just that, instead of bundling the whole (huge, Prisma-engine-
  // binary-included) tree into every one of this app's ~30+ dynamic API
  // route functions.
  //
  // V1 audit follow-up: the comment here used to cite Netlify's own docs
  // (https://ntl.fyi/next-standalone) as the reason — this app deploys to
  // Vercel (docs/pre-launch-checklist.md), which has never needed this
  // setting; Vercel's own build pipeline already does per-route tracing
  // natively. Harmless either way (Vercel's builder tolerates `standalone`
  // output fine), just not doing anything Vercel wasn't already doing —
  // worth removing once someone confirms it's safe to, rather than
  // leaving a misleading rationale in place.
  output: "standalone",
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
