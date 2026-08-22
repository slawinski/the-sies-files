import type { NextConfig } from "next";
import { buildCspPolicy } from "./src/lib/security";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(), microphone=()" },
];

const nextConfig: NextConfig = {
  // Standalone builds must bundle the protected map assets read at runtime
  // from `assets/maps/` (map-reveal-system-spec §8 — they are deliberately
  // NOT under public/).
  outputFileTracingIncludes: {
    "/api/v1/games/[gameId]/map/layers/[layerId]": ["./assets/maps/**/*"],
  },
  async headers() {
    const isProduction = process.env.NODE_ENV === "production";
    const pageHeaders = isProduction
      ? [...securityHeaders, { key: "Content-Security-Policy", value: buildCspPolicy() }]
      : securityHeaders;

    return [
      // API responses are never cacheable (secret projections, docs/03 §17/§19).
      {
        source: "/api/:path*",
        headers: [...securityHeaders, { key: "Cache-Control", value: "no-store" }],
      },
      // Public terrain art is content-hashed — immutable cache (spec §15).
      {
        source: "/maps/:path*",
        headers: [...securityHeaders, { key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      { source: "/:path*", headers: pageHeaders },
    ];
  },
};

export default nextConfig;
