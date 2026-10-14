"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { User, api } from "@/lib/api";
import { confirmError, newPasswordError, passwordHint } from "@/lib/validation";
import { useAuth } from "@/components/providers";
import { AuthShell, FormError, Notice, PasswordField, useAuthForm } from "@/components/auth-fields";
import { Button } from "@/components/ui";

export default function Page() {
  const { login } = useAuth();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const f = useAuthForm({ password: "", confirm_password: "" });
  const refs = { password: useRef<HTMLInputElement>(null), confirm_password: useRef<HTMLInputElement>(null) };
  const { password, confirm_password } = f.values;
  const errors = { password: newPasswordError(password), confirm_password: confirmError(password, confirm_password) };

  useEffect(() => {
    setToken(new URLSearchParams(window.location.hash.slice(1)).get("token") || "");
    history.replaceState(null, "", window.location.pathname); // keep the token out of the address bar and history
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const bad = f.check(errors, ["password", "confirm_password"]);
    if (bad) return refs[bad].current?.focus();
    f.run(async () => {
      const res = await api<{ user: User }>("/auth/reset-password", {
        method: "POST", body: JSON.stringify({ token, password, confirm_password }),
      });
      login(res.user);
      router.push(res.user.role === "recruiter" ? "/recruiter" : "/seeker");
    });
  };

  if (token === null) return null;
  if (!token) {
    return (
      <AuthShell title="Reset link incomplete">
        <Notice>Please open the reset link from your email again, or request a new one.</Notice>
        <Link className="text-sm font-medium text-accent hover:underline" href="/forgot-password">Request a new link</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choose a new password" sub="You'll be logged out on every other device.">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <PasswordField ref={refs.password} label="New password" autoComplete="new-password" value={password}
          onChange={(v) => f.set("password", v)} onBlur={() => f.blur("password")}
          error={f.shown("password", errors.password)} hint={passwordHint(password)} />
        <PasswordField ref={refs.confirm_password} label="Confirm new password" autoComplete="new-password" value={confirm_password}
          onChange={(v) => f.set("confirm_password", v)} onBlur={() => f.blur("confirm_password")}
          error={f.shown("confirm_password", errors.confirm_password)} />
        <FormError message={f.formErr} />
        {f.formErr && <Link className="text-sm font-medium text-accent hover:underline" href="/forgot-password">Request a new link</Link>}
        <Button className="w-full" disabled={f.busy}>{f.busy ? "Saving..." : "Set new password"}</Button>
      </form>
    </AuthShell>
  );
}
