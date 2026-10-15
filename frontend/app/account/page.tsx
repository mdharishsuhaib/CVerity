"use client";
import { useRef, useState } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { User, api, download } from "@/lib/api";
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
    <AuthShell brand={false} title="Account" sub={<>{user?.full_name} · {user?.email}</>}>
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
      <YourData />
    </AuthShell>
  );
}

function YourData() {
  const { logout } = useAuth();
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const pwRef = useRef<HTMLInputElement>(null);
  const f = useAuthForm({ password: "" });

  const exportData = async () => {
    setExportErr(null);
    setExporting(true);
    try {
      await download("/auth/export", "cverity-data.json");
    } catch (e) {
      setExportErr((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const remove = (e: React.FormEvent) => {
    e.preventDefault();
    const err = loginPasswordError(f.values.password);
    if (f.check({ password: err }, ["password"])) return pwRef.current?.focus();
    f.run(async () => {
      await api("/auth/delete-account", { method: "POST", body: JSON.stringify({ password: f.values.password }) });
      await logout();
      window.location.replace("/"); // full navigation: beats RequireAuth's redirect to /login
    });
  };

  return (
    <div className="grid gap-6 border-t border-line pt-8">
      <section className="grid gap-3">
        <h2 className="font-medium">Your data</h2>
        <p className="text-sm text-muted">Download everything CVerity stores about you: account details, resumes and their reports, jobs, candidates and tracked applications.</p>
        <FormError message={exportErr} />
        <Button variant="secondary" className="w-full" onClick={exportData} disabled={exporting}>
          <DownloadSimple size={16} />{exporting ? "Preparing..." : "Download my data (JSON)"}
        </Button>
      </section>

      <section className="grid gap-3">
        <h2 className="font-medium text-bad">Delete account</h2>
        <p className="text-sm text-muted">Permanently removes your account, resumes, jobs, candidates and applications. This can&apos;t be undone.</p>
        {!confirming ? (
          <Button variant="secondary" className="w-full text-bad" onClick={() => { setConfirming(true); setTimeout(() => pwRef.current?.focus(), 0); }}>
            Delete my account
          </Button>
        ) : (
          <form onSubmit={remove} className="grid gap-3 rounded-xl bg-bad-soft/50 p-4 ring-1 ring-bad/20" noValidate>
            <PasswordField ref={pwRef} label="Enter your password to confirm" autoComplete="current-password" value={f.values.password}
              onChange={(v) => f.set("password", v)} onBlur={() => f.blur("password")}
              error={f.shown("password", loginPasswordError(f.values.password))} />
            <FormError message={f.formErr} />
            <div className="flex gap-2">
              <Button variant="danger" className="flex-1" disabled={f.busy}>{f.busy ? "Deleting..." : "Delete permanently"}</Button>
              <Button type="button" variant="quiet" onClick={() => { setConfirming(false); f.set("password", ""); }}>Cancel</Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
