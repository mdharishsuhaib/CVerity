import { NextRequest, NextResponse } from "next/server";

// Proxies /api/* to the FastAPI backend at runtime.
// BACKEND_URL comes from the environment (Cloudflare Worker variable, Docker env, or shell),
// so the same build works locally, in Docker and on Cloudflare.
export function middleware(req: NextRequest) {
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
