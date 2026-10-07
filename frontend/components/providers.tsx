"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { createContext, useContext, useEffect, useState } from "react";
import { User } from "@/lib/api";
import { cn } from "@/lib/utils";

type AuthCtx = { user: User | null; ready: boolean; login: (token: string, user: User) => void; logout: () => void };
const Ctx = createContext<AuthCtx>({ user: null, ready: false, login: () => {}, logout: () => {} });
export const useAuth = () => useContext(Ctx);

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } }));
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const u = localStorage.getItem("user");
    if (u && localStorage.getItem("token")) setUser(JSON.parse(u));
    setReady(true);
  }, []);
  const login = (token: string, u: User) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(u));
    setUser(u);
  };
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    qc.clear();
  };
  return (
    <QueryClientProvider client={qc}>
      <Ctx.Provider value={{ user, ready, login, logout }}>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-30 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm">Skip to content</a>
        <Nav />
        <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-24 pt-10 md:px-6">{children}</main>
        <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 border-t border-line px-4 py-6 text-xs text-subtle md:px-6">
          <span>CVerity</span>
          <span>Files are parsed in memory and never stored. Contact details are removed before any text reaches an AI model.</span>
        </footer>
      </Ctx.Provider>
    </QueryClientProvider>
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
  return (
    <header className="sticky top-0 z-20 border-b border-line/80 bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="grid h-6 w-6 place-items-center rounded-md bg-accent text-[11px] font-bold text-accent-on">CV</span>
          CVerity
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1 text-sm">
          {user ? (
            <>
              <NavLink href={user.role === "recruiter" ? "/recruiter" : "/seeker"}>{user.role === "recruiter" ? "Jobs" : "Resumes"}</NavLink>
              <NavLink href="/analyze">Quick match</NavLink>
              <span className="mx-2 hidden h-4 w-px bg-line sm:block" />
              <span className="hidden max-w-[16ch] truncate text-subtle sm:inline" title={user.email}>{user.full_name || user.email}</span>
              <button onClick={() => { logout(); router.push("/"); }} className="rounded-md px-2.5 py-1.5 text-muted transition-colors hover:text-ink">Log out</button>
            </>
          ) : (
            <>
              <NavLink href="/login">Log in</NavLink>
              <Link href="/register" className="ml-1 rounded-md bg-accent px-3 py-1.5 font-medium text-accent-on transition hover:bg-accent-hover active:translate-y-px">Create account</Link>
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
