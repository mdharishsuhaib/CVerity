"use client";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

export type User = { id: number; email: string; full_name: string; role: "seeker" | "recruiter"; email_verified?: boolean };

/** An API error carrying which form field it is about (when the server says so). */
export class ApiError extends Error {
  constructor(message: string, public status: number, public field?: string) {
    super(message);
  }
}

// The login session lives in an HttpOnly cookie: page scripts (and any injected script) can't read it.
// Only the non-secret profile is kept here, to render the navbar instantly.
const PROFILE_KEY = "user";

export function readProfile(): User | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveProfile(u: User | null) {
  localStorage.removeItem("token"); // tokens from before the cookie switch
  if (u) localStorage.setItem(PROFILE_KEY, JSON.stringify(u));
  else localStorage.removeItem(PROFILE_KEY);
}

function endSession() {
  saveProfile(null);
  window.location.href = "/login?expired=1";
}

const RETRYABLE = new Set([502, 503, 504]); // backend waking up or redeploying
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const UNREACHABLE = "Can't reach the server. Check your connection and try again.";

function parseDetail(detail: unknown, fallback: string): { message: string; field?: string } {
  if (typeof detail === "string") return { message: detail };
  if (detail && typeof detail === "object" && "message" in detail) {
    const d = detail as { message: string; field?: string | null };
    return { message: d.message, field: d.field ?? undefined };
  }
  return { message: fallback };
}

export async function api<T = any>(path: string, opts: RequestInit & { form?: FormData | URLSearchParams } = {}): Promise<T> {
  // The custom header proves the request came from this site's own scripts (CSRF protection).
  const headers: Record<string, string> = { "X-CVerity-CSRF": "1", ...(opts.headers as Record<string, string>) };
  let body = opts.body;
  if (opts.form) body = opts.form;
  else if (body && typeof body === "string") headers["Content-Type"] = "application/json";

  // Only reads are retried: repeating a signup, login or upload could act twice.
  const method = (opts.method || "GET").toUpperCase();
  const attempts = method === "GET" ? 4 : 1;
  let res: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      res = await fetch(`${API_URL}${path}`, { ...opts, headers, body, credentials: "include" });
      if (!RETRYABLE.has(res.status) || i === attempts - 1) break;
    } catch {
      if (i === attempts - 1) throw new ApiError(UNREACHABLE, 0);
    }
    await sleep(1500 * 2 ** i);
  }
  if (!res) throw new ApiError(UNREACHABLE, 0);

  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
    endSession();
    throw new ApiError("Your session has expired. Please log in again.", 401);
  }
  if (!res.ok) {
    let msg = RETRYABLE.has(res.status) ? "The server is starting up. Please try again in a few seconds."
      : res.status >= 500 ? "Something went wrong on our side. Please try again." : res.statusText || "Request failed";
    let field: string | undefined;
    try {
      const j = await res.json();
      ({ message: msg, field } = parseDetail(j.detail, msg));
    } catch {}
    throw new ApiError(msg, res.status, field);
  }
  if (res.status === 204 || res.status === 202 && res.headers.get("content-length") === "0") return undefined as T;
  return res.json();
}

export async function download(path: string, filename: string) {
  const res = await fetch(`${API_URL}${path}`, { credentials: "include" });
  if (res.status === 401) {
    endSession();
    return;
  }
  if (!res.ok) throw new Error("Download failed. Please try again.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
