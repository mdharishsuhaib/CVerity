"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { createContext, useContext, useEffect, useState } from "react";
import { User, api, readProfile, saveProfile } from "@/lib/api";
import { cn } from "@/lib/utils";

type AuthCtx = { user: User | null; ready: boolean; login: (user: User) => void; logout: () => Promise<void> };
const Ctx = createContext<AuthCtx>({ user: null, ready: false, login: () => {}, logout: async () => {} });
export const useAuth = () => useContext(Ctx);

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } }));
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Show the cached profile at once, then confirm the session cookie is still valid with the server.
    const cached = readProfile();
    if (cached) {
      setUser(cached);
      setReady(true);
    }
    api<User>("/auth/me")
      .then((u) => { setUser(u); saveProfile(u); })
      .catch((e) => {
        if (e?.status === 401) { setUser(null); saveProfile(null); } // expired, logged out elsewhere, or password changed
      })
      .finally(() => setReady(true));
  }, []);
  const login = (u: User) => {
    saveProfile(u);
    setUser(u);
  };
  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    saveProfile(null);
    setUser(null);
    qc.clear();
  };
  return (
    <QueryClientProvider client={qc}>
      <Ctx.Provider value={{ user, ready, login, logout }}>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-30 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm">Skip to content</a>
        <Nav />
        <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-8 pt-8 md:px-6">{children}</main>
        <footer className="flex w-full items-center justify-center border-t border-line px-3 py-6 text-center text-xs text-subtle">
          <span>CVerity &copy; 2026</span>
        </footer>
      </Ctx.Provider>
    </QueryClientProvider>
  );
}

const NO_NAV_PATHS = ["/login", "/register"];

/** The CVerity logo mark, shared by the navbar and the auth pages. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("grid h-6 w-6 place-items-center rounded-md bg-accent text-[11px] font-bold text-accent-on", className)}>CV</span>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = path === href || (href !== "/" && path.startsWith(href));
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={cn("rounded-md px-2.5 py-1.5 transition-colors", active ? "bg-sunken text-ink" : "text-muted hover:text-ink")}>
      {children}
    </Link>
  );
}

function Nav() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();
  // Log In and Create Account are focused pages: the brand shows above the form instead.
  if (NO_NAV_PATHS.includes(path)) return null;
  return (
    <header className="sticky top-0 z-20 border-b border-line/80 bg-bg/85 backdrop-blur">
      <div className="flex h-14 w-full items-center justify-between gap-4 px-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <BrandMark />
          CVerity
        </Link>
        <nav aria-label="Primary" className="flex min-w-0 items-center gap-1 text-sm">
          {user ? (
            <>
              <NavLink href={user.role === "recruiter" ? "/recruiter" : "/seeker"}>{user.role === "recruiter" ? "Jobs" : "Resumes"}</NavLink>
              <NavLink href="/analyze">Quick match</NavLink>
              <span className="mx-2 hidden h-4 w-px bg-line sm:block" />
              <Link href="/account" className="hidden max-w-[16ch] truncate rounded-md px-2.5 py-1.5 text-subtle transition-colors hover:text-ink sm:inline" title={`${user.email}: account settings`}>{user.full_name || user.email}</Link>
              <button onClick={async () => { await logout(); router.push("/"); }} className="rounded-md px-2.5 py-1.5 text-muted transition-colors hover:text-ink">Log out</button>
            </>
          ) : (
            <>
              <a href="/#features" className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-muted transition-colors hover:text-ink">Features</a>
              <a href="/#scoring" className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-muted transition-colors hover:text-ink">How it works</a>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function RequireAuth({ role, children }: { role?: "seeker" | "recruiter"; children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (ready && !user) router.replace("/login");
    else if (ready && user && role && user.role !== role) router.replace(user.role === "recruiter" ? "/recruiter" : "/seeker");
  }, [ready, user, role, router]);
  if (!ready || !user || (role && user.role !== role)) return null;
  return <>{children}</>;
}
