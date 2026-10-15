"use client";
import Link from "next/link";
import { ArrowRight, Fingerprint, Lock, Scales, Trash } from "@phosphor-icons/react";
import { useAuth } from "@/components/providers";
import { TiltCard } from "@/components/landing/three-d";

const STEPS = [
  ["01", "Upload", "Drop a PDF, DOCX or TXT. CVerity extracts sections, contact details, dated experience and skills."],
  ["02", "Score", "Eight ATS checks and a match score against every open role, each with its reasons."],
  ["03", "Improve", "Rewrite weak bullets, add missing keywords, then generate a cover letter and interview prep."],
  ["04", "Apply and track", "Save the roles you want and move them from applied to offer on one board."],
];

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 border-b border-line/70 bg-surface/60">
      <div className="mx-auto max-w-6xl px-4 py-24 md:px-6 md:py-32">
        <div className="grid gap-6 md:grid-cols-[1fr_1.2fr] md:items-end">
          <h2 className="text-3xl font-semibold tracking-[-0.025em] md:text-[2.75rem] md:leading-[1.08]">From upload to offer in four steps.</h2>
          <p className="max-w-[48ch] text-lg leading-relaxed text-muted md:justify-self-end">The first report takes a few seconds. No templates to fill in and no setup.</p>
        </div>
        <ol className="mt-16 grid gap-10 md:grid-cols-4 md:gap-8">
          {STEPS.map(([n, t, d]) => (
            <li key={n} className="relative border-t border-line pt-6">
              <span aria-hidden className="absolute -top-px left-0 h-px w-10 bg-accent" />
              <p className="font-mono text-sm tabular text-accent">{n}</p>
              <h3 className="mt-3 text-lg font-semibold">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// Mirrors the backend defaults in app/core/settings.py (weight_semantic ... weight_title).
const WEIGHTS = [
  ["Semantic fit", 35, "Sentence embeddings compare your experience with the role's responsibilities, not just keywords."],
  ["Skills", 35, "Required skills count double. Exact, alias, fuzzy and related matches each earn partial credit."],
  ["Experience", 15, "Years come from your real date ranges, merged so overlapping jobs are never counted twice."],
  ["Education", 10, "Highest degree compared with what the role asks for."],
  ["Title", 5, "How close your recent titles are to this one."],
] as const;

export function Scoring() {
  return (
    <section id="scoring" className="scroll-mt-20 border-b border-line/70">
      <div className="mx-auto grid max-w-6xl gap-16 px-4 py-24 md:px-6 md:py-32 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <p className="text-sm font-medium text-accent">Explainable by design</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.025em] md:text-[2.75rem] md:leading-[1.08]">A score you can argue with.</h2>
          <p className="mt-4 max-w-[46ch] text-lg leading-relaxed text-muted">
            Every match breaks down into five signals with published weights. You see which skills matched, which were close and which are missing.
          </p>
          <div className="mt-10 flex items-start gap-4 rounded-xl bg-sunken p-5">
            <Scales size={22} weight="duotone" className="mt-0.5 shrink-0 text-accent" />
            <p className="text-sm leading-relaxed text-muted">
              Missing signals are left out instead of counted as zero, so a job that lists no education requirement never penalizes anyone for it.
            </p>
          </div>
        </div>
        <ul className="grid content-center gap-7">
          {WEIGHTS.map(([t, w, d]) => (
            <li key={t}>
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="font-semibold">{t}</h3>
                <span className="font-mono text-sm tabular text-accent">{w}%</span>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line/70">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(w / 35) * 100}%` }} />
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">{d}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const TRUST = [
  [Fingerprint, "Contact details stay out of AI prompts", "Emails, phone numbers, LinkedIn and GitHub links are stripped before any text reaches a language model."],
  [Lock, "Private by default", "Sessions use HttpOnly cookies with CSRF protection. Your resumes are visible only to you."],
  [Trash, "Yours to take or delete", "Download everything we store as JSON, or delete your account and all its data from Account settings."],
] as const;

export function Trust() {
  return (
    <section id="trust" className="scroll-mt-20 border-b border-line/70 bg-surface/60">
      <div className="mx-auto max-w-6xl px-4 py-24 md:px-6 md:py-28">
        <h2 className="max-w-[22ch] text-3xl font-semibold tracking-[-0.025em] md:text-[2.75rem] md:leading-[1.08]">A resume is personal. We treat it that way.</h2>
        <ul className="mt-14 grid gap-4 md:grid-cols-3">
          {TRUST.map(([Icon, t, d]) => (
            <li key={t}>
              <TiltCard className="h-full rounded-2xl bg-surface p-7 ring-1 ring-line/80 shadow-[0_20px_40px_-30px_rgb(var(--shadow)/0.35)]">
                <Icon size={28} weight="duotone" className="relative z-[2] text-accent [transform:translateZ(40px)]" />
                <h3 className="relative z-[2] mt-5 font-semibold [transform:translateZ(24px)]">{t}</h3>
                <p className="relative z-[2] mt-2 text-sm leading-relaxed text-muted [transform:translateZ(12px)]">{d}</p>
              </TiltCard>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const FAQ = [
  ["Is CVerity free?", "Yes. Create an account and upload as many resumes as you like."],
  ["Which file types work?", "PDF, DOCX and TXT, up to 10 MB each. Scanned image-only PDFs can't be read, so export a text PDF from your editor."],
  ["Will the AI invent experience for me?", "No. Rewrites and cover letters only use what is in your resume and put [placeholders] where a number is unknown, so you fill in the truth."],
  ["How is this different from a keyword checker?", "Keyword tools count words. CVerity also compares meaning, credits related tools, reads your real dates for experience and explains every point of the score."],
];

export function Faq() {
  return (
    <section aria-labelledby="faq-title" className="border-b border-line/70">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-24 md:px-6 md:py-28 lg:grid-cols-[1fr_1.6fr]">
        <h2 id="faq-title" className="text-3xl font-semibold tracking-[-0.025em] md:text-[2.75rem] md:leading-[1.08]">Questions, answered.</h2>
        <dl className="grid gap-8 sm:grid-cols-2">
          {FAQ.map(([q, a]) => (
            <div key={q}>
              <dt className="font-semibold">{q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted">{a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function FinalCta() {
  const { user } = useAuth();
  const href = user ? (user.role === "recruiter" ? "/recruiter" : "/seeker") : "/register";
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="landing-glow pointer-events-none absolute -bottom-56 left-1/2 h-[30rem] w-[44rem] -translate-x-1/2 rounded-full" />
      <div className="relative mx-auto max-w-3xl px-4 py-24 text-center md:py-32">
        <h2 className="text-3xl font-semibold tracking-[-0.03em] md:text-5xl md:leading-[1.05]">Your next application deserves a better first read.</h2>
        <p className="mx-auto mt-5 max-w-[46ch] text-lg leading-relaxed text-muted">Upload a resume and see your ATS score and best-fit jobs in under a minute.</p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href={href} className="inline-flex h-12 items-center gap-2 rounded-md bg-gradient-to-b from-accent to-accent-hover px-6 font-medium text-accent-on shadow-button transition hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.98]">
            {user ? "Open your dashboard" : "Get started free"} <ArrowRight size={16} weight="bold" />
          </Link>
          {!user && (
            <Link href="/login" className="inline-flex h-12 items-center rounded-md px-5 font-medium text-muted transition hover:text-ink">
              I already have an account
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
