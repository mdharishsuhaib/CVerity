"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ApiError, User, api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  EMAIL_MAX, NAME_MAX, cleanName, confirmError, emailError, emailSuggestion, loginPasswordError, nameError,
  newPasswordError, normalizeEmail, passwordHint,
} from "@/lib/validation";
import { useAuth } from "@/components/providers";
import { AuthShell, FormError, Notice, PasswordField, useAuthForm } from "@/components/auth-fields";
import { Button, Field, Input } from "@/components/ui";

type AuthResult = { user: User; password_update_recommended?: boolean };

function EmailField({ value, onChange, onBlur, error, inputRef, autoComplete }: {
  value: string; onChange: (v: string) => void; onBlur: () => void; error?: string;
  inputRef: React.Ref<HTMLInputElement>; autoComplete: "email" | "username";
}) {
  const suggestion = emailSuggestion(value);
  return (
    <div className="grid gap-1.5">
      <Field label="Email" error={error}>
        <Input ref={inputRef} type="email" inputMode="email" autoComplete={autoComplete} autoCapitalize="none" spellCheck={false}
          maxLength={EMAIL_MAX + 10} value={value} aria-invalid={!!error} placeholder="name@example.com"
          className={cn(error && "ring-bad/70 focus:ring-bad/70")} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
      </Field>
      {suggestion && !error && (
        <button type="button" onClick={() => onChange(suggestion)} className="justify-self-start text-left text-xs text-muted">
          Did you mean <span className="font-medium text-accent underline">{suggestion}</span>?
        </button>
      )}
    </div>
  );
}

// ---------------- Create account ----------------

export function RegisterForm() {
  const { login } = useAuth();
  const router = useRouter();
  const [role, setRole] = useState<"seeker" | "recruiter">("seeker");
  useEffect(() => {
    // "I'm hiring" links to /register?role=recruiter
    if (new URLSearchParams(window.location.search).get("role") === "recruiter") setRole("recruiter");
  }, []);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const f = useAuthForm({ full_name: "", email: "", password: "", confirm_password: "" });
  const refs = {
    full_name: useRef<HTMLInputElement>(null), email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null), confirm_password: useRef<HTMLInputElement>(null),
  };
  const { full_name, email, password, confirm_password } = f.values;
  const errors = {
    full_name: nameError(full_name),
    email: emailError(email),
    password: newPasswordError(password, email, full_name),
    confirm_password: confirmError(password, confirm_password),
  };
  const order = ["full_name", "email", "password", "confirm_password"] as const;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const bad = f.check(errors, [...order]);
    if (bad) return refs[bad].current?.focus();
    f.run(async () => {
      try {
        const res = await api<AuthResult & { verification_required?: boolean; email?: string }>("/auth/register", {
          method: "POST",
          body: JSON.stringify({ full_name: cleanName(full_name), email: normalizeEmail(email), password, confirm_password, role }),
        });
        if (res.verification_required) return setSentTo(res.email!);
        if (!res.user) throw new ApiError("Account creation could not be confirmed. Please try logging in.", 500);
        login(res.user);
        router.push(res.user.role === "recruiter" ? "/recruiter" : "/seeker");
      } catch (err) {
        const k = (err as ApiError).field as keyof typeof refs | undefined;
        if (k && refs[k]) setTimeout(() => refs[k].current?.focus());
        throw err;
      }
    });
  };

  if (sentTo) return <CheckInbox email={sentTo} />;

  return (
    <AuthShell brand title="Create your account" sub="Free. No credit card needed.">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="Full name" error={f.shown("full_name", errors.full_name)}>
          <Input ref={refs.full_name} autoComplete="name" maxLength={NAME_MAX + 50} value={full_name} placeholder="Mohammed Haris Suhaib"
            aria-invalid={!!f.shown("full_name", errors.full_name)}
            className={cn(f.shown("full_name", errors.full_name) && "ring-bad/70 focus:ring-bad/70")}
            onChange={(e) => f.set("full_name", e.target.value)} onBlur={() => f.blur("full_name")} />
        </Field>
        <EmailField value={email} onChange={(v) => f.set("email", v)} onBlur={() => f.blur("email")}
          error={f.shown("email", errors.email)} inputRef={refs.email} autoComplete="email" />
        <PasswordField ref={refs.password} label="Password" autoComplete="new-password" value={password}
          onChange={(v) => f.set("password", v)} onBlur={() => f.blur("password")}
          error={f.shown("password", errors.password)} hint={passwordHint(password)} />
        <PasswordField ref={refs.confirm_password} label="Confirm password" autoComplete="new-password" value={confirm_password}
          onChange={(v) => f.set("confirm_password", v)} onBlur={() => f.blur("confirm_password")}
          error={f.shown("confirm_password", errors.confirm_password)} />

        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">I am</legend>
          <div className="grid grid-cols-2 gap-2">
            {([["seeker", "Looking for a job"], ["recruiter", "Hiring"]] as const).map(([r, l]) => (
              <button type="button" key={r} onClick={() => setRole(r)} aria-pressed={role === r}
                className={cn("rounded-md px-3 py-2.5 text-left text-sm transition", role === r ? "bg-accent-soft font-medium text-accent-ink shadow-[inset_0_0_0_1px_rgb(var(--accent)/0.45),0_6px_16px_-10px_rgb(var(--accent)/0.6)]" : "bg-surface text-muted shadow-key hover:-translate-y-px hover:text-ink")}>
                {l}
              </button>
            ))}
          </div>
        </fieldset>
        <FormError message={f.formErr} />
        <Button className="w-full" disabled={f.busy}>{f.busy ? "Creating account..." : "Create account"}</Button>
      </form>
      <p className="text-sm text-muted">Already registered? <Link className="font-medium text-accent hover:underline" href="/login">Log in</Link></p>
    </AuthShell>
  );
}

// ---------------- Log in ----------------

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [unverified, setUnverified] = useState<string | null>(null);
  const [weakPw, setWeakPw] = useState(false);
  const [canReset, setCanReset] = useState(false);
  const f = useAuthForm({ email: "", password: "" });
  const refs = { email: useRef<HTMLInputElement>(null), password: useRef<HTMLInputElement>(null) };
  const { email, password } = f.values;
  // Log In only checks presence and format; never the new-account password rules.
  const errors = { email: emailError(email), password: loginPasswordError(password) };

  useEffect(() => {
    // "Forgot password?" needs email sending; show it only once an email provider is configured.
    api<{ email_enabled: boolean }>("/auth/capabilities").then((c) => setCanReset(c.email_enabled)).catch(() => {});
    const q = new URLSearchParams(window.location.search);
    if (q.get("expired") === "1") setNotice("Your session has ended. Please log in again.");
    if (q.get("reset") === "1") setNotice("Your password was changed. Please log in with your new password.");
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setUnverified(null);
    const bad = f.check(errors, ["email", "password"]);
    if (bad) return refs[bad].current?.focus();
    f.run(async () => {
      try {
        // The password is sent exactly as typed: no trimming or case changes.
        const res = await api<AuthResult>("/auth/login", {
          method: "POST", form: new URLSearchParams({ username: normalizeEmail(email), password }),
        });
        if (!res?.user) throw new ApiError("Login could not be confirmed. Please try again.", 500);
        login(res.user);
        if (res.password_update_recommended) return setWeakPw(true);
        router.push(res.user.role === "recruiter" ? "/recruiter" : "/seeker");
      } catch (err) {
        const ae = err as ApiError;
        if (ae.field === "unverified") {
          setUnverified(normalizeEmail(email));
          return;
        }
        throw ae.status === 401 ? new ApiError(ae.message, 401) : ae; // generic credential error, not on a field
      }
    });
  };

  if (weakPw) {
    return (
      <AuthShell brand title="Update your password" sub="You're logged in.">
        <Notice>Your password is shorter or simpler than our current rules allow for new accounts. Please choose a stronger one to keep your account safe.</Notice>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => router.push("/account")}>Update password</Button>
          <Button variant="quiet" onClick={() => router.push("/")}>Not now</Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell brand title="Log in" sub="Pick up where you left off.">
      {notice && !f.formErr && <Notice>{notice}</Notice>}
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <EmailField value={email} onChange={(v) => f.set("email", v)} onBlur={() => f.blur("email")}
          error={f.shown("email", errors.email)} inputRef={refs.email} autoComplete="username" />
        <PasswordField ref={refs.password} label="Password" autoComplete="current-password" value={password}
          onChange={(v) => f.set("password", v)} onBlur={() => f.blur("password")} error={f.shown("password", errors.password)} />
        {canReset && <Link href="/forgot-password" className="-mt-2 justify-self-end text-xs font-medium text-accent hover:underline">Forgot password?</Link>}
        {unverified && <ResendVerification email={unverified} />}
        <FormError message={f.formErr} />
        <Button className="w-full" disabled={f.busy}>{f.busy ? "Logging in..." : "Log in"}</Button>
      </form>
      <p className="text-sm text-muted">New here? <Link className="font-medium text-accent hover:underline" href="/register">Create account</Link></p>
    </AuthShell>
  );
}

// ---------------- Email verification helpers ----------------

function CheckInbox({ email }: { email: string }) {
  return (
    <AuthShell brand title="Check your inbox" sub="One last step to activate your account.">
      <Notice tone="good">
        We sent a verification link to <strong className="font-medium">{email}</strong>. Open it to activate your account. The link works once and expires in 24 hours.
      </Notice>
      <ResendVerification email={email} />
      <p className="text-sm text-muted">Already verified? <Link className="font-medium text-accent hover:underline" href="/login">Log in</Link></p>
    </AuthShell>
  );
}

export function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const resend = async () => {
    if (state !== "idle") return;
    setState("busy");
    try {
      const r = await api<{ message: string }>("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) });
      setMsg(r.message);
      setState("sent");
      setTimeout(() => setState("idle"), 60_000); // matches the server's cooldown
    } catch (e) {
      setMsg((e as Error).message);
      setState("idle");
    }
  };
  return (
    <div className="grid gap-2 rounded-md bg-sunken px-3 py-2.5 text-sm text-muted" role="status">
      <p>{msg ?? "Your email address isn't verified yet. Didn't get the email? Check your spam folder or send a new link."}</p>
      <Button type="button" variant="secondary" size="sm" className="justify-self-start" onClick={resend} disabled={state !== "idle"}>
        {state === "busy" ? "Sending..." : state === "sent" ? "Sent. You can resend in a minute" : "Resend verification email"}
      </Button>
    </div>
  );
}
