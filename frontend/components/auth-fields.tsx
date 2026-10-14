"use client";
import React, { useState } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Field, Input } from "@/components/ui";

/** Password input with show/hide and Caps Lock warning. Paste and password-manager autofill stay enabled. */
export const PasswordField = React.forwardRef<HTMLInputElement, {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; error?: string; hint?: React.ReactNode;
  autoComplete: "current-password" | "new-password"; id?: string;
}>(function PasswordField({ label, value, onChange, onBlur, error, hint, autoComplete, id }, ref) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const capsCheck = (e: React.KeyboardEvent) => setCaps(e.getModifierState?.("CapsLock") ?? false);
  return (
    <Field label={label} error={error}>
      <div className="relative">
        <Input ref={ref} id={id} type={show ? "text" : "password"} autoComplete={autoComplete} value={value}
          spellCheck={false} autoCapitalize="none" autoCorrect="off"
          aria-invalid={!!error} className={cn("pr-10", error && "ring-bad/70 focus:ring-bad/70")}
          onChange={(e) => onChange(e.target.value)} onBlur={() => { setCaps(false); onBlur?.(); }}
          onKeyDown={capsCheck} onKeyUp={capsCheck} />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={show} className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md text-subtle transition hover:text-ink">
          {show ? <EyeSlash size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {caps && <span role="status" className="text-xs text-warn">Caps Lock is on.</span>}
      {hint && !error && <span className="text-xs text-subtle" aria-live="polite">{hint}</span>}
    </Field>
  );
});

/** Shared form state: values, per-field errors after blur/submit, and server errors placed on their field. */
export function useAuthForm<K extends string>(initial: Record<K, string>) {
  const [values, setValues] = useState(initial);
  const [touched, setTouched] = useState<Partial<Record<K, boolean>>>({});
  const [serverErr, setServerErr] = useState<Partial<Record<K, string>>>({});
  const [formErr, setFormErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: K, v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    setServerErr((s) => ({ ...s, [k]: undefined }));
    setFormErr(null);
  };
  const blur = (k: K) => setTouched((t) => ({ ...t, [k]: true }));
  const shown = (k: K, err: string | null) => serverErr[k] || (touched[k] ? err : null) || undefined;

  /** Marks all fields touched; returns the first field with an error (for focusing), or null. */
  const check = (errors: Record<K, string | null>, order: K[]) => {
    setTouched(Object.fromEntries(order.map((k) => [k, true])) as Partial<Record<K, boolean>>);
    return order.find((k) => errors[k]) ?? null;
  };

  /** Runs a request once (duplicate submissions are ignored) and routes errors to fields. */
  const run = async (fn: () => Promise<void>, fieldMap: Partial<Record<string, K>> = {}) => {
    if (busy) return;
    setBusy(true);
    setFormErr(null);
    try {
      await fn();
    } catch (e) {
      const err = e as ApiError;
      const k = err.field ? fieldMap[err.field] ?? (err.field in values ? (err.field as K) : undefined) : undefined;
      if (k) setServerErr({ [k]: err.message } as Partial<Record<K, string>>);
      else setFormErr(err.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return { values, set, blur, shown, check, run, busy, formErr, setFormErr };
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">{message}</p>;
}

export function Notice({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" }) {
  return (
    <div role="status" className={cn("rounded-md px-3 py-2.5 text-sm", tone === "good" ? "bg-accent-soft text-accent-ink" : "bg-sunken text-muted")}>
      {children}
    </div>
  );
}

export function AuthShell({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-sm gap-8 pt-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
