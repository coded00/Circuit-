import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Traces each route's actual dependency graph and prunes node_modules
  // down to just that, instead of bundling the whole (huge, Prisma-engine-
  // binary-included) tree into every one of this app's ~30+ dynamic API
  // route functions. Netlify's own documented fix for slow/timed-out
  // "functions bundling" deploys — https://ntl.fyi/next-standalone.
  output: "standalone",
};

export default nextConfig;
