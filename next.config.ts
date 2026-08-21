import type { NextConfig } from "next";
import { buildCspPolicy } from "./src/lib/security";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(), microphone=()" },
];

const nextConfig: NextConfig = {
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
      { source: "/:path*", headers: pageHeaders },
    ];
  },
};

export default nextConfig;
