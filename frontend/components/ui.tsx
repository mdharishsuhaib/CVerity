"use client";
import React from "react";
import { cn, scoreColor, scoreFill } from "@/lib/utils";

/* Radius rule: controls rounded-md (8px), containers rounded-xl (12px). One accent: --accent. */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "quiet" | "danger"; size?: "sm" | "md" };

export function Button({ className, variant = "primary", size = "md", ...p }: ButtonProps) {
  const v = {
    // Lit from above: a top highlight, a darker lower edge and an accent-tinted drop shadow give buttons physical depth.
    primary: "bg-gradient-to-b from-accent to-accent-hover text-accent-on shadow-button hover:-translate-y-px hover:brightness-110",
    secondary: "bg-surface text-ink shadow-key hover:-translate-y-px hover:bg-sunken",
    quiet: "text-muted hover:bg-sunken hover:text-ink",
    danger: "bg-gradient-to-b from-bad to-bad/90 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_8px_18px_-10px_rgb(var(--bad)/0.8)] hover:-translate-y-px hover:brightness-110",
  }[variant];
  const s = size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm";
  return (
    <button
      className={cn("inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition duration-200 ease-out active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50", v, s, className)}
      {...p}
    />
  );
}

export function Panel({ className, as: Tag = "section", ...p }: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" | "aside" | "figure" }) {
  return <Tag className={cn("rounded-xl bg-surface p-5 shadow-depth", className)} {...p} />;
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("grid gap-1.5 text-sm", className)}>
      <span className="font-medium text-ink">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-subtle">{hint}</span>}
      {error && <span className="text-xs text-bad">{error}</span>}
    </label>
  );
}

const control = "w-full rounded-md bg-surface px-3 text-sm text-ink shadow-[inset_0_1px_2px_rgb(var(--shadow)/0.06)] ring-1 ring-inset ring-line placeholder:text-subtle transition focus:outline-none focus:ring-2 focus:ring-accent/60 focus:shadow-[0_0_0_4px_rgb(var(--accent)/0.12)]";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(p, ref) {
  return <input ref={ref} {...p} className={cn(control, "h-10", p.className)} />;
});

export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cn(control, "py-2.5 leading-relaxed", p.className)} />;
}

export function Select(p: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cn(control, "h-10", p.className)} />;
}

export function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "accent" }) {
  const t = {
    neutral: "bg-sunken text-muted ring-line",
    good: "bg-accent-soft text-accent-ink ring-accent/20",
    accent: "bg-accent-soft text-accent-ink ring-accent/20",
    warn: "bg-warn-soft text-warn ring-warn/20",
    bad: "bg-bad-soft text-bad ring-bad/20",
  }[tone];
  return <span className={cn("inline-flex items-center rounded-[5px] px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset", t)}>{children}</span>;
}

/** Compact component score: label, number, thin bar. */
export function Meter({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3 text-sm">
      <span className="capitalize text-muted">{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-sunken shadow-[inset_0_1px_2px_rgb(var(--shadow)/0.15)]">
        <span className={cn("block h-full rounded-full shadow-[inset_0_1px_0_rgb(255_255_255/0.3)] transition-[width] duration-500 ease-out", scoreFill(value))} style={{ width: `${value ?? 0}%` }} />
      </span>
      <span className={cn("text-right font-mono tabular", scoreColor(value))}>{value == null ? "n/a" : Math.round(value)}</span>
    </div>
  );
}

export function Score({ score, size = "md", label }: { score: number | null | undefined; size?: "sm" | "md" | "lg"; label?: string }) {
  const px = { sm: 52, md: 72, lg: 104 }[size];
  const r = px / 2 - 5, c = 2 * Math.PI * r, s = score ?? 0;
  const gid = React.useId().replace(/:/g, "");
  return (
    <figure className="flex flex-col items-center gap-1">
      <span className="relative grid place-items-center rounded-full bg-gradient-to-b from-surface to-sunken shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_0_0_1px_rgb(var(--line)/0.8),0_10px_24px_-14px_rgb(var(--shadow)/0.5)]"
        style={{ width: px, height: px }}>
        <svg width={px} height={px} role="img" className="absolute inset-0" aria-label={`${label ?? "Score"} ${score == null ? "unavailable" : Math.round(s)} of 100`}>
          <defs>
            <linearGradient id={`g${gid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="1" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0.55" />
            </linearGradient>
          </defs>
        <circle cx={px / 2} cy={px / 2} r={r} className="stroke-line" strokeWidth="4" fill="none" />
          <circle cx={px / 2} cy={px / 2} r={r} strokeWidth="4" fill="none" strokeLinecap="round" stroke={`url(#g${gid})`}
            className={cn(scoreColor(score), "transition-[stroke-dashoffset] duration-700 ease-out [filter:drop-shadow(0_0_3px_currentColor)]")}
            strokeDasharray={c} strokeDashoffset={c * (1 - s / 100)} transform={`rotate(-90 ${px / 2} ${px / 2})`} />
        </svg>
        <span aria-hidden className={cn("relative font-mono font-semibold tabular text-ink", size === "lg" ? "text-[26px]" : size === "md" ? "text-lg" : "text-sm")}>
          {score == null ? "-" : Math.round(s)}
        </span>
      </span>
      {label && <figcaption className="text-xs text-subtle">{label}</figcaption>}
    </figure>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-md bg-sunken", className)} />;
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl bg-surface p-5 shadow-depth">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/2" /></div>
        </div>
      ))}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">{(error as Error).message || String(error)}</p>;
}

/** Shown when the AI service failed and the result came from built-in rules instead. */
export function AiNotice({ kind }: { kind?: string }) {
  const why = {
    quota: "The AI service has reached its usage limit",
    auth: "The AI service key is not valid",
    timeout: "The AI service took too long to answer",
    model: "The configured AI model is not available",
  }[kind ?? ""] ?? "The AI model is unavailable right now";
  return <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{why}, so this was written from built-in rules. You can try again later.</p>;
}

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-dashed border-line bg-surface/50 px-6 py-14 text-center">
      <EmptyStack />
      <p className="mt-6 font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-[46ch] text-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Three floating 3D sheets, used as the illustration for empty states. */
export function EmptyStack() {
  return (
    <div aria-hidden className="mx-auto h-16 w-20 [perspective:400px]">
      <div className="float-a relative h-full w-full [transform-style:preserve-3d] [transform:rotateX(52deg)_rotateZ(-38deg)]">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn("absolute inset-0 rounded-lg ring-1", i === 2 ? "bg-accent-soft ring-accent/40" : "bg-surface ring-line")}
            style={{ transform: `translateZ(${i * 12}px)`, boxShadow: "0 10px 20px -10px rgb(var(--shadow) / 0.35)" }}>
            {i === 2 && <div className="m-2.5 grid gap-1"><div className="h-1 w-8 rounded-full bg-accent" /><div className="h-1 w-11 rounded-full bg-accent/40" /><div className="h-1 w-6 rounded-full bg-accent/40" /></div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageHeader({ title, sub, actions, back }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode; back?: React.ReactNode }) {
  return (
    <header className="page-in mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {back && <div className="mb-3">{back}</div>}
        <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em] md:text-[2.1rem]">{title}</h1>
        {sub && <div className="mt-1.5 text-sm text-muted">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
