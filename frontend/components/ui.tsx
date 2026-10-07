"use client";
import React from "react";
import { cn, scoreColor, scoreFill } from "@/lib/utils";

/* Radius rule: controls rounded-md (8px), containers rounded-xl (12px). One accent: --accent. */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "quiet" | "danger"; size?: "sm" | "md" };

export function Button({ className, variant = "primary", size = "md", ...p }: ButtonProps) {
  const v = {
    primary: "bg-accent text-accent-on hover:bg-accent-hover",
    secondary: "bg-surface text-ink ring-1 ring-inset ring-line hover:bg-sunken",
    quiet: "text-muted hover:bg-sunken hover:text-ink",
    danger: "bg-bad text-white hover:bg-bad/90",
  }[variant];
  const s = size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm";
  return (
    <button
      className={cn("inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition duration-200 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-50", v, s, className)}
      {...p}
    />
  );
}

export function Panel({ className, as: Tag = "section", ...p }: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" | "aside" | "figure" }) {
  return <Tag className={cn("rounded-xl bg-surface p-5 shadow-panel ring-1 ring-line/70", className)} {...p} />;
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

const control = "w-full rounded-md bg-surface px-3 text-sm text-ink ring-1 ring-inset ring-line placeholder:text-subtle transition focus:outline-none focus:ring-2 focus:ring-accent/60";

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
      <span className="h-1 overflow-hidden rounded-full bg-line/60">
        <span className={cn("block h-full rounded-full transition-[width] duration-500 ease-out", scoreFill(value))} style={{ width: `${value ?? 0}%` }} />
      </span>
      <span className={cn("text-right font-mono tabular", scoreColor(value))}>{value == null ? "n/a" : Math.round(value)}</span>
    </div>
  );
}

export function Score({ score, size = "md", label }: { score: number | null | undefined; size?: "sm" | "md" | "lg"; label?: string }) {
  const px = { sm: 52, md: 72, lg: 104 }[size];
  const r = px / 2 - 5, c = 2 * Math.PI * r, s = score ?? 0;
  return (
    <figure className="flex flex-col items-center gap-1">
      <svg width={px} height={px} role="img" aria-label={`${label ?? "Score"} ${score == null ? "unavailable" : Math.round(s)} of 100`}>
        <circle cx={px / 2} cy={px / 2} r={r} className="stroke-line" strokeWidth="4" fill="none" />
        <circle cx={px / 2} cy={px / 2} r={r} strokeWidth="4" fill="none" strokeLinecap="round" stroke="currentColor"
          className={cn(scoreColor(score), "transition-[stroke-dashoffset] duration-700 ease-out")}
          strokeDasharray={c} strokeDashoffset={c * (1 - s / 100)} transform={`rotate(-90 ${px / 2} ${px / 2})`} />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
          className={cn("fill-ink font-mono font-semibold tabular", size === "lg" ? "text-[26px]" : size === "md" ? "text-lg" : "text-sm")}>
          {score == null ? "-" : Math.round(s)}
        </text>
      </svg>
      {label && <figcaption className="text-xs text-subtle">{label}</figcaption>}
    </figure>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-sunken", className)} />;
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl bg-surface p-5 ring-1 ring-line/70">
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

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-[46ch] text-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, sub, actions, back }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode; back?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {back && <div className="mb-3">{back}</div>}
        <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">{title}</h1>
        {sub && <div className="mt-1 text-sm text-muted">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
