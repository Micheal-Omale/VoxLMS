import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Setup links carry a secret in the address: never leak it to other sites (spec 0004).
  async headers() {
    return [{ source: "/setup/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
