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
    ("POST", "/resumes", 20, 300),
    ("POST", "/recruiter/jobs/", 10, 300),
    ("POST", "/match/score", 30, 300),
    ("POST", "/jobs", 30, 300),
]


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

    async def dispatch(self, request: Request, call_next):
        rule = next(((p, n, w) for m, p, n, w in LIMITS if request.method == m and request.url.path.startswith(p)), None)
        if rule:
            prefix, limit, window = rule
            key = (client_ip(request), prefix)
            now = time.monotonic()
            with self.lock:
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
        return response
