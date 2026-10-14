import { NextRequest, NextResponse } from "next/server";

// Proxies /api/* to the FastAPI backend at runtime.
// BACKEND_URL comes from the environment (Cloudflare Worker variable, Docker env, or shell),
// so the same build works locally, in Docker and on Cloudflare.
export function middleware(req: NextRequest) {
  // On Cloudflare (cf-ray header present) there is no local backend, so a missing BACKEND_URL is a setup error.
  // Say so clearly instead of letting the request fail with an opaque Cloudflare "error code: 1003".
  if (!process.env.BACKEND_URL && req.headers.get("cf-ray")) {
    return NextResponse.json(
      { detail: "Backend not configured. Set BACKEND_URL in frontend/wrangler.jsonc (\"vars\") or as a runtime variable on this Cloudflare Worker (Settings > Variables and Secrets) to your Render backend URL, then redeploy." },
      { status: 503 },
    );
  }
  const backend = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
  const path = req.nextUrl.pathname.replace(/^\/api/, "") || "/";

  // Never proxy URLs with a static-file extension (e.g. the old ".../export.csv"): Cloudflare caches those by
  // default without regard to who is logged in, and copies cached before the fix may still exist.
  if (/\.(csv|json|xml|txt|pdf|zip|xlsx?)$/i.test(path)) {
    return NextResponse.json({ detail: "Not found" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  const target = new URL(path + req.nextUrl.search, backend);

  // Pass the real visitor IP so backend rate limits apply per user, not per proxy.
  const headers = new Headers(req.headers);
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  headers.delete("x-cverity-client-ip");
  if (ip) headers.set("x-cverity-client-ip", ip);
  headers.delete("host");

  const res = NextResponse.rewrite(target, { request: { headers } });
  // API responses are per-user (e.g. a recruiter's candidate CSV): never let Cloudflare's cache share them.
  res.headers.set("Cache-Control", "private, no-store, max-age=0");
  res.headers.set("CDN-Cache-Control", "no-store");
  res.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
  return res;
}

export const config = { matcher: "/api/:path*" };
