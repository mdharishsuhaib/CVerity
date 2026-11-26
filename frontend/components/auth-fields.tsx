"use client";
import Link from "next/link";
import React, { useState } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/providers";
import { Field, Input } from "@/components/ui";
import { useTilt } from "@/components/landing/three-d";
import { Folder, Lanyard } from "@/components/fx";
import { badgeFront, emailFirstName } from "@/lib/auth-art";

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

export function AuthShell({ title, sub, children, brand, scene, who = "" }: {
  title: string; sub?: React.ReactNode; children?: React.ReactNode; brand?: boolean;
  /** React Bits effect beside the form: "login" (3D Folder) or "signup" (3D Lanyard badge). */
  scene?: "login" | "signup";
  /** What the visitor has typed: the Full name on Sign up, the Email on Log in. Personalizes the 3D art live. */
  who?: string;
}) {
  const form = (
    <div className="grid gap-8">
      <div>
        {brand && (
          <Link href="/" aria-label="CVerity home" className="mb-8 inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight">
            <BrandMark className="h-8 w-8 text-sm" />
            CVerity
          </Link>
        )}
        <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em]">{title}</h1>
        {sub && <p className="mt-1.5 text-sm text-muted">{sub}</p>}
      </div>
      {children}
    </div>
  );
  if (!brand) {
    return <div className="mx-auto max-w-md rounded-2xl bg-surface p-7 shadow-depth-lg md:p-9">{form}</div>;
  }
  // Log in / Create account: full-height split screen with the form beside a 3D product scene.
  return (
    <div className="mx-auto grid min-h-[calc(100dvh-10rem)] max-w-6xl items-center gap-12 py-4 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-20">
      <div className="w-full max-w-sm justify-self-center lg:justify-self-start">{form}</div>
      {scene === "login" ? <LoginArt email={who} /> : scene === "signup" ? <SignupArt name={who} /> : <AuthArt />}
    </div>
  );
}

/** Log in: React Bits Folder, a 3D folder of your saved CVerity work that opens on click; drag a page out or click to zoom. */
function LoginArt({ email }: { email: string }) {
  const page = "absolute inset-0 flex flex-col gap-1.5 overflow-hidden rounded-[6px] bg-white p-3 text-left text-[9px] leading-snug text-[#52525b]";
  const items = [
    { title: "ATS report", content: (
      <div className={page}>
        <p className="text-[10px] font-semibold text-[#18181b]">ATS report</p>
        <div className="mx-auto mt-1 grid h-14 w-14 place-items-center rounded-full" style={{ background: "conic-gradient(#0e7a5f 0 92%, #e4e4e7 92% 100%)" }}>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-white font-mono text-base font-bold text-[#18181b]">92</span>
        </div>
        <p className="text-center font-semibold text-[#0e7a5f]">Grade A</p>
        {[96, 88, 74].map((w) => <span key={w} className="h-1 rounded-full bg-[#e5f2ed]"><span className="block h-full rounded-full bg-[#0e7a5f]" style={{ width: `${w}%` }} /></span>)}
      </div>
    ) },
    { title: "Top matches", content: (
      <div className={page}>
        <p className="text-[10px] font-semibold text-[#18181b]">Top matches</p>
        {([["Data Analyst", 94], ["BI Developer", 87], ["Analytics Eng.", 72]] as const).map(([t, s]) => (
          <div key={t} className="rounded bg-[#f4f4f5] px-1.5 py-1">
            <div className="flex justify-between"><span className="text-[#18181b]">{t}</span><span className="font-mono font-semibold text-[#0e7a5f]">{s}%</span></div>
          </div>
        ))}
      </div>
    ) },
    { title: "Cover letter", content: (
      <div className={page}>
        <p className="text-[10px] font-semibold text-[#18181b]">Cover letter</p>
        <p>Dear Hiring Team, as a data analyst who shipped 14 live dashboards...</p>
        {[90, 78, 84, 60].map((w) => <span key={w} className="h-1 rounded-full bg-[#e4e4e7]" style={{ width: `${w}%` }} />)}
      </div>
    ) },
    { title: "Interview prep", content: (
      <div className={page}>
        <p className="text-[10px] font-semibold text-[#18181b]">Interview prep</p>
        <p className="rounded bg-[#e5f2ed] px-1.5 py-1 text-[#0a5845]">Q. Walk me through a dashboard you built.</p>
        <p className="rounded bg-[#fdf3e7] px-1.5 py-1 text-[#9a5b13]">Q. How would you learn Looker fast?</p>
      </div>
    ) },
  ];
  return (
    <div className="relative hidden h-[36rem] overflow-hidden rounded-[28px] bg-gradient-to-b from-accent/10 via-sunken to-sunken shadow-depth-lg lg:block">
      <div aria-hidden className="landing-grid absolute inset-0 opacity-60" />
      <div className="absolute inset-0 grid place-items-center pt-28">
        <Folder items={items} label={`${emailFirstName(email)}'s CVerity`} theme="light" color="#0e7a5f" paperColor="#ffffff" variant="solid" mode="flap"
          layout="spread" size={1.2} tilt={0.6} bounce={0.45} peek intro draggable zoomOnClick />
      </div>
      <p className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-sm font-medium text-muted">
        Welcome back. Your work is right where you left it. Click to open.
      </p>
    </div>
  );
}

/** Create account: React Bits Lanyard, a physics 3D badge on a strap you can grab, swing and flip. */
function SignupArt({ name }: { name: string }) {
  // Rebuild the badge face once typing pauses, so the 3D texture isn't regenerated on every keystroke.
  const [shown, setShown] = useState(name);
  React.useEffect(() => {
    const t = setTimeout(() => setShown(name), 150);
    return () => clearTimeout(t);
  }, [name]);
  const front = React.useMemo(() => badgeFront(shown), [shown]);
  return (
    <div className="relative hidden h-[36rem] overflow-hidden rounded-[28px] bg-gradient-to-b from-accent/10 via-sunken to-sunken shadow-depth-lg lg:block">
      <div aria-hidden className="landing-grid absolute inset-0 opacity-60" />
      <div className="absolute inset-0">
        <Lanyard frontImage={front} backImage="/badge/back.svg" finish="glossy" metal="silver" strapColor="#0e7a5f"
          strapWidth={0.9} strapLength={0.36} size={0.58} breeze={0.45} cornerRadius={0.08} />
      </div>
      <p className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-sm font-medium text-muted">
        Your verified resume badge. Grab it, swing it, flip it.
      </p>
    </div>
  );
}

const AUTH_JOBS = [["Backend Engineer", 92], ["Data Engineer", 84], ["Cloud Architect", 71]] as const;

/** Decorative 3D panel for the auth screens: floating layers that tilt with the pointer. */
function AuthArt() {
  const stage = React.useRef<HTMLDivElement>(null);
  const scene = useTilt<HTMLDivElement>(6, stage);
  return (
    <div ref={stage} aria-hidden className="relative hidden h-[34rem] overflow-hidden rounded-[28px] bg-gradient-to-br from-accent/10 via-sunken to-sunken shadow-depth-lg lg:block">
      <div className="landing-grid absolute inset-0 opacity-70" />
      <div className="absolute inset-x-[-20%] bottom-0 h-1/2"><div className="landing-floor absolute inset-0" /></div>
      <div className="absolute inset-0 grid place-items-center [perspective:1200px]">
        <div ref={scene} className="hero-scene relative h-[22rem] w-[24rem] [transform-style:preserve-3d]">
          <div className="absolute left-0 top-6 h-72 w-52 rounded-2xl bg-surface p-4 shadow-depth-lg [transform:translateZ(-30px)]">
            <div className="flex items-center gap-2.5"><div className="h-8 w-8 rounded-lg bg-accent-soft" /><div className="grid gap-1.5"><div className="h-2 w-20 rounded-full bg-ink/80" /><div className="h-1.5 w-12 rounded-full bg-subtle/40" /></div></div>
            {[[86, 70, 90], [64, 82], [92, 58, 76]].map((ls, i) => (
              <div key={i} className="mt-5"><div className="h-1.5 w-10 rounded-full bg-accent" /><div className="mt-2 grid gap-1.5">{ls.map((w, j) => <div key={j} className="h-1.5 rounded-full bg-line" style={{ width: `${w}%` }} />)}</div></div>
            ))}
            <div className="hero-scan pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-transparent via-accent/15 to-transparent"><div className="absolute inset-x-0 top-1/2 h-px bg-accent/60" /></div>
          </div>
          <div className="float-a absolute left-32 top-0 rounded-2xl bg-surface/95 px-4 py-3 shadow-depth-lg backdrop-blur [transform:translateZ(80px)]">
            <p className="text-[11px] text-subtle">ATS score</p>
            <p className="font-mono text-2xl font-semibold text-accent">88</p>
          </div>
          {AUTH_JOBS.map(([t, s], i) => (
            <div key={t} className="absolute right-0 w-48 rounded-xl bg-surface p-3 shadow-depth-lg"
              style={{ top: `${5.5 + i * 4.75}rem`, transform: `translateZ(${120 - i * 40}px)` }}>
              <div className="flex items-center text-[12px] font-medium">{t}<span className={cn("ml-auto font-mono text-base", s >= 80 ? "text-accent" : "text-warn")}>{s}</span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line/70"><div className={cn("bar-grow h-full rounded-full", s >= 80 ? "bg-accent" : "bg-warn")} style={{ width: `${s}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
      <p className="absolute inset-x-0 bottom-8 text-center text-sm font-medium text-muted">Your resume, scored and ranked against every open job.</p>
    </div>
  );
}
