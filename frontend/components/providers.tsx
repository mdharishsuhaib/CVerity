"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SignOut } from "@phosphor-icons/react";
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
        <Main>{children}</Main>
        <footer className="mt-auto w-full shrink-0 border-t border-line/70 bg-bg/60 text-xs text-subtle backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-center px-4 py-6 md:px-6">
            <span className="inline-flex items-center gap-2"><BrandMark className="h-5 w-5 text-[9px]" />CVerity &copy; 2026</span>
          </div>
        </footer>
      </Ctx.Provider>
    </QueryClientProvider>
  );
}

const NO_NAV_PATHS = ["/login", "/register"];
const FULL_BLEED_PATHS = ["/"]; // marketing pages lay out their own full-width bands

function Main({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const bleed = FULL_BLEED_PATHS.includes(path);
  return (
    <>
      {!bleed && <div aria-hidden className="app-backdrop pointer-events-none fixed inset-0 -z-10" />}
      <main id="main" key={path} className={cn("w-full flex-1", !bleed && "page-in mx-auto max-w-6xl px-4 pb-12 pt-8 md:px-6 md:pt-10")}>{children}</main>
    </>
  );
}

/** The CVerity logo mark, shared by the navbar and the auth pages. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-accent to-accent-hover text-[11px] font-bold text-accent-on shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_4px_10px_-4px_rgb(var(--accent)/0.7)]", className)}>CV</span>
  );
}

function NavLink({ href, children, not }: { href: string; children: React.ReactNode; not?: string }) {
  const path = usePathname();
  const active = (path === href || (href !== "/" && path.startsWith(href + "/"))) && !(not && path.startsWith(not));
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={cn("shrink-0 whitespace-nowrap rounded-md px-2 py-1.5 transition-colors sm:px-2.5", active ? "bg-surface text-ink shadow-key" : "text-muted hover:text-ink")}>
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
    <header className="sticky top-0 z-20 border-b border-line/70 bg-bg/70 shadow-[inset_0_-1px_0_rgb(255_255_255/0.04),0_10px_30px_-24px_rgb(var(--shadow)/0.5)] backdrop-blur-xl backdrop-saturate-150">
      <div className="flex h-14 w-full items-center justify-between gap-2 px-3 sm:gap-4 md:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          <BrandMark />
          <span className={cn(user && "hidden sm:inline")}>CVerity</span>
        </Link>
        {/* On phones a signed-in menu can be wider than the screen: it scrolls inside itself instead of pushing Log out off the page. */}
        <nav aria-label="Primary" className="relative -mr-1 flex min-w-0 items-center gap-1 overflow-x-auto pr-1 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {user ? (
            <>
              <NavLink href={user.role === "recruiter" ? "/recruiter" : "/seeker"} not="/seeker/applications">{user.role === "recruiter" ? "Jobs" : "Resumes"}</NavLink>
              {user.role === "seeker" && <NavLink href="/seeker/applications">Applications</NavLink>}
              <NavLink href="/analyze">Quick match</NavLink>
              <span className="mx-2 hidden h-4 w-px bg-line sm:block" />
              <Link href="/account" className="hidden max-w-[16ch] truncate rounded-md px-2.5 py-1.5 text-subtle transition-colors hover:text-ink sm:inline" title={`${user.email}: account settings`}>{user.full_name || user.email}</Link>
              <button onClick={async () => { await logout(); router.push("/"); }} aria-label="Log out" title="Log out" className="shrink-0 whitespace-nowrap rounded-md px-2 py-1.5 text-muted transition-colors hover:text-ink sm:px-2.5">
                <SignOut size={18} weight="bold" className="sm:hidden" aria-hidden /><span className="hidden sm:inline">Log out</span>
              </button>
            </>
          ) : (
            <>
              <a href="/#features" className="hidden whitespace-nowrap rounded-md px-2.5 py-1.5 text-muted transition-colors hover:text-ink md:inline">Features</a>
              <a href="/#how" className="hidden whitespace-nowrap rounded-md px-2.5 py-1.5 text-muted transition-colors hover:text-ink md:inline">How it works</a>
              <a href="/#trust" className="hidden whitespace-nowrap rounded-md px-2.5 py-1.5 text-muted transition-colors hover:text-ink lg:inline">Privacy</a>
              <span className="mx-2 hidden h-4 w-px bg-line md:block" />
              <Link href="/login" className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-muted transition-colors hover:text-ink">Log in</Link>
              <Link href="/register" className="ml-1 inline-flex h-8 items-center whitespace-nowrap rounded-md bg-gradient-to-b from-accent to-accent-hover px-3 text-[13px] font-medium text-accent-on shadow-button transition hover:-translate-y-px hover:brightness-110 active:scale-[0.98]">Get started</Link>
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
