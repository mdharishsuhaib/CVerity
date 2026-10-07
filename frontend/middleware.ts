import { NextRequest, NextResponse } from "next/server";

// Proxies /api/* to the FastAPI backend at runtime.
// BACKEND_URL comes from the environment (Cloudflare Worker variable, Docker env, or shell),
// so the same build works locally, in Docker and on Cloudflare.
export function middleware(req: NextRequest) {
  // On Cloudflare (cf-ray header present) there is no local backend, so a missing BACKEND_URL is a setup error.
  // Say so clearly instead of letting the request fail with an opaque Cloudflare "error code: 1003".
  if (!process.env.BACKEND_URL && req.headers.get("cf-ray")) {
    return NextResponse.json(
      { detail: "Backend not configured. Set the BACKEND_URL variable on this Cloudflare Worker (Settings > Variables and secrets) to your Render backend URL (for example https://cverity-api.onrender.com)." },
      { status: 503 },
    );
  }
  const backend = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
  const path = req.nextUrl.pathname.replace(/^\/api/, "") || "/";
  const target = new URL(path + req.nextUrl.search, backend);

  // Pass the real visitor IP so backend rate limits apply per user, not per proxy.
  const headers = new Headers(req.headers);
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  headers.delete("x-cverity-client-ip");
  if (ip) headers.set("x-cverity-client-ip", ip);
  headers.delete("host");

  return NextResponse.rewrite(target, { request: { headers } });
}

export const config = { matcher: "/api/:path*" };
