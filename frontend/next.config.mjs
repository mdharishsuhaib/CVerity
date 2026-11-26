/** @type {import('next').NextConfig} */
// The /api proxy to FastAPI lives in middleware.ts (reads BACKEND_URL at runtime).
// On Cloudflare Workers Builds (WORKERS_CI=1) the type check is skipped to cut build time; the same check runs in
// parallel on GitHub Actions (.github/workflows/frontend-checks.yml) and in every local `npm run build`.
const onCloudflare = process.env.WORKERS_CI === "1";
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  typescript: { ignoreBuildErrors: onCloudflare },
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      ],
    }];
  },
};
export default nextConfig;
