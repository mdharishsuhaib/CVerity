"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers";
import { Button, ErrorNote, Field, Input } from "@/components/ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { login } = useAuth();
  const router = useRouter();
  const [f, setF] = useState({ email: "", password: "", full_name: "", role: "seeker" });
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = isLogin
        ? await api("/auth/login", { method: "POST", form: new URLSearchParams({ username: f.email, password: f.password }) })
        : await api("/auth/register", { method: "POST", body: JSON.stringify(f) });
      login(res.access_token, res.user);
      router.push(res.user.role === "recruiter" ? "/recruiter" : "/seeker");
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-sm gap-8 pt-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{isLogin ? "Log in" : "Create your account"}</h1>
        <p className="mt-1 text-sm text-muted">{isLogin ? "Pick up where you left off." : "Free. No credit card needed."}</p>
      </div>
      <form onSubmit={submit} className="grid gap-4" noValidate={false}>
        {!isLogin && (
          <Field label="Full name"><Input autoComplete="name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        )}
        <Field label="Email"><Input type="email" required autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Password" hint={isLogin ? undefined : "At least 8 characters."}>
          <Input type="password" required minLength={isLogin ? 1 : 8} autoComplete={isLogin ? "current-password" : "new-password"} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        {!isLogin && (
          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">I am</legend>
            <div className="grid grid-cols-2 gap-2">
              {([["seeker", "Looking for a job"], ["recruiter", "Hiring"]] as const).map(([r, l]) => (
                <button type="button" key={r} onClick={() => setF({ ...f, role: r })} aria-pressed={f.role === r}
                  className={cn("rounded-md px-3 py-2.5 text-left text-sm ring-1 ring-inset transition", f.role === r ? "bg-accent-soft font-medium text-accent-ink ring-accent/40" : "bg-surface text-muted ring-line hover:text-ink")}>
                  {l}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <ErrorNote error={err} />
        <Button className="w-full" disabled={busy}>{busy ? "One moment..." : isLogin ? "Log in" : "Create account"}</Button>
      </form>
      {isLogin && (
        <div className="rounded-xl bg-sunken p-4 text-sm">
          <p className="font-medium">Demo accounts</p>
          <p className="mt-1 text-muted">Password for both: <code className="font-mono text-ink">demo12345</code></p>
          <div className="mt-3 flex gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setF({ ...f, email: "seeker@demo.com", password: "demo12345" })}>Use job seeker</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setF({ ...f, email: "recruiter@demo.com", password: "demo12345" })}>Use recruiter</Button>
          </div>
        </div>
      )}
      <p className="text-sm text-muted">
        {isLogin ? <>New here? <Link className="font-medium text-accent hover:underline" href="/register">Create account</Link></> : <>Already registered? <Link className="font-medium text-accent hover:underline" href="/login">Log in</Link></>}
      </p>
    </div>
  );
}
