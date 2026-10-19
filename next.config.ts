import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Setup links carry a secret in the address: never leak it to other sites (spec 0004).
  async headers() {
    // A shown result is one child's personal data: never indexed, cached or leaked onward (spec 0014, AC-16).
    const shownResult = [
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ];
    return [
      { source: "/setup/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/result/:path*", has: [{ type: "cookie", key: "vox_result" }], headers: shownResult },
      { source: "/result", has: [{ type: "cookie", key: "vox_result" }], headers: shownResult },
    ];
  },
  // The report card font reaches the server bundle only through these (spec 0012).
  outputFileTracingIncludes: {
    "/\\[school\\]/classes/\\[classId\\]/report-cards": ["src/assets/fonts/**/*"],
    "/admin/schools/\\[schoolId\\]/results/slips": ["src/assets/fonts/**/*"],
    "/result/card": ["src/assets/fonts/**/*"],
    "/design/pin-slips": ["src/assets/fonts/**/*"],
    "/design/report-card": ["src/assets/fonts/**/*", "src/app/design/report-card/*.png"],
  },
  partialPrefetching: true,
  // The Excel import's reader (spec 0013) uses Node streams; loaded with Node's own require, never bundled.
  serverExternalPackages: ["exceljs"],
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
