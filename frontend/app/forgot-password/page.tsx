"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { EMAIL_MAX, emailError, normalizeEmail } from "@/lib/validation";
import { AuthShell, FormError, Notice, useAuthForm } from "@/components/auth-fields";
import { Button, Field, Input } from "@/components/ui";

export default function Page() {
  const f = useAuthForm({ email: "" });
  const ref = useRef<HTMLInputElement>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);
  const error = emailError(f.values.email);

  useEffect(() => {
    api<{ email_enabled: boolean }>("/auth/capabilities").then((c) => setAvailable(c.email_enabled)).catch(() => {});
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (f.check({ email: error }, ["email"])) return ref.current?.focus();
    f.run(async () => {
      const r = await api<{ message: string }>("/auth/forgot-password", {
        method: "POST", body: JSON.stringify({ email: normalizeEmail(f.values.email) }),
      });
      setSent(r.message);
    });
  };

  if (!available) {
    return (
      <AuthShell title="Reset your password">
        <Notice>Password reset by email isn't available yet. Please contact the site owner for help with your account.</Notice>
        <Link className="text-sm font-medium text-accent hover:underline" href="/login">Back to log in</Link>
      </AuthShell>
    );
  }
  if (sent) {
    return (
      <AuthShell title="Check your inbox">
        <Notice tone="good">{sent} The link works once and expires in 30 minutes.</Notice>
        <Link className="text-sm font-medium text-accent hover:underline" href="/login">Back to log in</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Reset your password" sub="Enter your account's email and we'll send you a link to choose a new password.">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="Email" error={f.shown("email", error)}>
          <Input ref={ref} type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
            maxLength={EMAIL_MAX + 10} value={f.values.email} aria-invalid={!!f.shown("email", error)}
            onChange={(e) => f.set("email", e.target.value)} onBlur={() => f.blur("email")} />
        </Field>
        <FormError message={f.formErr} />
        <Button className="w-full" disabled={f.busy}>{f.busy ? "Sending..." : "Send reset link"}</Button>
      </form>
      <Link className="text-sm font-medium text-accent hover:underline" href="/login">Back to log in</Link>
    </AuthShell>
  );
}
