"use client";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

export type User = { id: number; email: string; full_name: string; role: "seeker" | "recruiter" };

export function getToken() {
  return typeof window === "undefined" ? null : localStorage.getItem("token");
}

export async function api<T = any>(path: string, opts: RequestInit & { form?: FormData | URLSearchParams } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body = opts.body;
  if (opts.form) body = opts.form;
  else if (body && typeof body === "string") headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers, body });
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth")) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login";
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function download(path: string, filename: string) {
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
