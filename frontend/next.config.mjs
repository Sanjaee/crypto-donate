/** @type {import('next').NextConfig} */
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
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
    // Development: hanya endpoint Go yang di-forward (Auth.js /api/auth/*
    // tetap dilayani Next.js, jangan di-rewrite).
    if (process.env.NODE_ENV === "development") {
      const target = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api";
      return [
        { source: "/api/auth/register", destination: `${target}/auth/register` },
        { source: "/api/auth/login", destination: `${target}/auth/login` },
        { source: "/api/users/:path*", destination: `${target}/users/:path*` },
        { source: "/api/donations", destination: `${target}/donations` },
        { source: "/api/donations/:path*", destination: `${target}/donations/:path*` },
        { source: "/api/webhooks/:path*", destination: `${target}/webhooks/:path*` },
        { source: "/api/widgets/:path*", destination: `${target}/widgets/:path*` },
        { source: "/api/payments/:path*", destination: `${target}/payments/:path*` },
      ];
    }
    return [];
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
