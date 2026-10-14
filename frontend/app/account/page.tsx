"use client";
import { useRef, useState } from "react";
import { User, api } from "@/lib/api";
import { confirmError, loginPasswordError, newPasswordError, passwordHint } from "@/lib/validation";
import { RequireAuth, useAuth } from "@/components/providers";
import { AuthShell, FormError, Notice, PasswordField, useAuthForm } from "@/components/auth-fields";
import { Button } from "@/components/ui";

export default function Page() {
  return <RequireAuth><Account /></RequireAuth>;
}

function Account() {
  const { user, login } = useAuth();
  const [done, setDone] = useState(false);
  const f = useAuthForm({ current_password: "", password: "", confirm_password: "" });
  const refs = {
    current_password: useRef<HTMLInputElement>(null), password: useRef<HTMLInputElement>(null),
    confirm_password: useRef<HTMLInputElement>(null),
  };
  const { current_password, password, confirm_password } = f.values;
  const errors = {
    current_password: loginPasswordError(current_password),
    password: newPasswordError(password, user?.email, user?.full_name),
    confirm_password: confirmError(password, confirm_password),
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const bad = f.check(errors, ["current_password", "password", "confirm_password"]);
    if (bad) return refs[bad].current?.focus();
    f.run(async () => {
      const res = await api<{ user: User }>("/auth/change-password", {
        method: "POST", body: JSON.stringify({ current_password, password, confirm_password }),
      });
      login(res.user);
      setDone(true);
      (["current_password", "password", "confirm_password"] as const).forEach((k) => f.set(k, ""));
    });
  };

  return (
    <AuthShell title="Account" sub={<>{user?.full_name} · {user?.email}</>}>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <h2 className="font-medium">Change password</h2>
        {done && <Notice tone="good">Password updated. You've been logged out on every other device.</Notice>}
        <PasswordField ref={refs.current_password} label="Current password" autoComplete="current-password" value={current_password}
          onChange={(v) => { setDone(false); f.set("current_password", v); }} onBlur={() => f.blur("current_password")}
          error={f.shown("current_password", errors.current_password)} />
        <PasswordField ref={refs.password} label="New password" autoComplete="new-password" value={password}
          onChange={(v) => f.set("password", v)} onBlur={() => f.blur("password")}
          error={f.shown("password", errors.password)} hint={passwordHint(password)} />
        <PasswordField ref={refs.confirm_password} label="Confirm new password" autoComplete="new-password" value={confirm_password}
          onChange={(v) => f.set("confirm_password", v)} onBlur={() => f.blur("confirm_password")}
          error={f.shown("confirm_password", errors.confirm_password)} />
        <FormError message={f.formErr} />
        <Button className="w-full" disabled={f.busy}>{f.busy ? "Saving..." : "Update password"}</Button>
      </form>
    </AuthShell>
  );
}
