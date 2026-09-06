/** @type {import('next').NextConfig} */
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Pastikan tracing standalone tidak mengikuti workspace root yang
  // salah (mis. ada package-lock.json di folder induk).
  outputFileTracingRoot: __dirname,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "media.giphy.com" },
      { protocol: "https", hostname: "media.tenor.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  async rewrites() {
    const target = process.env.API_INTERNAL_URL || "http://sawer-api:8080/api";

    return [
      { source: "/api/auth/register", destination: `${target}/auth/register` },
      { source: "/api/auth/login", destination: `${target}/auth/login` },
      { source: "/api/users/:path*", destination: `${target}/users/:path*` },
      { source: "/api/donations", destination: `${target}/donations` },
      { source: "/api/donations/:path*", destination: `${target}/donations/:path*` },
      { source: "/api/webhooks/:path*", destination: `${target}/webhooks/:path*` },
      { source: "/api/widgets/:path*", destination: `${target}/widgets/:path*` },
      { source: "/api/payments/:path*", destination: `${target}/payments/:path*` },
      { source: "/api/admin/:path*", destination: `${target}/admin/:path*` },
      { source: "/api/stream-settings", destination: `${target}/stream-settings` },
      { source: "/api/stream-settings/:path*", destination: `${target}/stream-settings/:path*` },
      { source: "/api/wallet", destination: `${target}/wallet` },
      { source: "/api/wallet/:path*", destination: `${target}/wallet/:path*` },
      { source: "/api/withdrawals", destination: `${target}/withdrawals` },
      { source: "/api/media/:path*", destination: `${target}/media/:path*` },
    ];
  },

  async headers() {
    return [
      {
        source: "/widgets/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Frame-Options", value: "ALLOWALL" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
