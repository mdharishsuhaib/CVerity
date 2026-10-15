"""Lightweight production middleware: per-IP rate limiting and security headers."""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

# (method, path prefix) -> (max requests, window seconds). Per worker process.
LIMITS: list[tuple[str, str, int, int]] = [
    ("POST", "/auth/login", 10, 60),
    ("POST", "/auth/register", 5, 300),
    ("POST", "/auth/verify-email", 10, 300),
    ("POST", "/auth/resend-verification", 3, 300),
    ("POST", "/auth/forgot-password", 3, 300),
    ("POST", "/auth/reset-password", 10, 300),
    ("POST", "/auth/change-password", 5, 300),
    ("POST", "/auth/delete-account", 5, 300),
    ("POST", "/resumes", 20, 300),
    ("POST", "/recruiter/jobs/", 10, 300),
    ("POST", "/match/score", 30, 300),
    ("POST", "/jobs", 30, 300),
]

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
CSRF_HEADER = "x-cverity-csrf"


def client_ip(request: Request) -> str:
    # Behind the Next.js / Cloudflare Worker proxy the real visitor IP arrives in headers.
    for h in ("x-cverity-client-ip", "cf-connecting-ip", "x-real-ip"):
        if v := request.headers.get(h):
            return v.strip()
    if fwd := request.headers.get("x-forwarded-for"):
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.hits: dict[tuple[str, str], deque] = defaultdict(deque)
        self.lock = threading.Lock()
        self._last_sweep = time.monotonic()

    def _sweep(self, now: float) -> None:
        # Drop visitors with no recent requests so memory stays flat however many IPs arrive.
        if now - self._last_sweep < 60:
            return
        self._last_sweep = now
        longest = max(w for *_, w in LIMITS)
        for key in [k for k, q in self.hits.items() if not q or now - q[-1] > longest]:
            del self.hits[key]

    async def dispatch(self, request: Request, call_next):
        # CSRF: browsers attach the session cookie to cross-site requests, but other sites cannot add a
        # custom header without passing CORS. So any state-changing request must carry it.
        # (Bearer-token API clients aren't exposed to CSRF and are exempt.)
        if (request.method not in SAFE_METHODS and not request.headers.get("authorization")
                and request.headers.get(CSRF_HEADER) != "1"):
            return JSONResponse({"detail": "Request blocked by CSRF protection. Please reload the page and try again."},
                                status_code=403)
        rule = next(((p, n, w) for m, p, n, w in LIMITS if request.method == m and request.url.path.startswith(p)), None)
        if rule:
            prefix, limit, window = rule
            key = (client_ip(request), prefix)
            now = time.monotonic()
            with self.lock:
                self._sweep(now)
                q = self.hits[key]
                while q and now - q[0] > window:
                    q.popleft()
                if len(q) >= limit:
                    retry = int(window - (now - q[0])) + 1
                    return JSONResponse({"detail": f"Too many requests. Try again in {retry} seconds."},
                                        status_code=429, headers={"Retry-After": str(retry)})
                q.append(now)
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        # Every API response is per-user data (resumes, candidate CSVs, scores). "private, no-store" stops any shared
        # cache, notably Cloudflare's, which caches .csv URLs by default and ignores who is logged in, from ever
        # storing one user's response and serving it to someone else. The response varies by login cookie, too.
        response.headers["Cache-Control"] = "private, no-store, max-age=0"
        if response.headers.get("content-type", "").startswith("text/event-stream"):
            # Live progress streams: "no-transform" stops proxies (the Next.js server, Cloudflare) from gzipping the
            # stream, which holds events back in a buffer so the progress bar never moves in real time.
            response.headers["Cache-Control"] = "private, no-store, no-transform, max-age=0"
        response.headers["Vary"] = ", ".join(dict.fromkeys(
            [v.strip() for v in response.headers.get("Vary", "").split(",") if v.strip()] + ["Cookie", "Authorization"]))
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if request.headers.get("x-forwarded-proto", request.url.scheme) == "https":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response
