"use client";
import Link from "next/link";
import { ArrowRight, CheckCircle } from "@phosphor-icons/react";
import { HeroScene } from "@/components/landing/hero-scene";
import { useAuth } from "@/components/providers";

export function Hero() {
  const { user } = useAuth();
  const home = user ? (user.role === "recruiter" ? "/recruiter" : "/seeker") : null;
  return (
    <section className="relative overflow-hidden border-b border-line/70">
      <div aria-hidden className="landing-grid pointer-events-none absolute inset-0" />
      <div aria-hidden className="pointer-events-none absolute inset-x-[-20%] bottom-0 h-[45%]">
        <div className="landing-floor absolute inset-0 top-[10%]" />
      </div>
      <div aria-hidden className="landing-glow pointer-events-none absolute -top-40 right-[-10%] h-[36rem] w-[36rem] rounded-full" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 md:px-6 md:pb-28 md:pt-20 lg:grid-cols-[1.1fr_1fr]">
        <div className="fade-up">
          <h1 className="max-w-[16ch] text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.035em] md:text-6xl">
            Know why a resume fits a job, <span className="text-accent">not just that it does.</span>
          </h1>
          <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-muted">
            CVerity reads a resume the way an ATS and a recruiter would. It scores it, shows the exact skills a role is missing,
            ranks it against open jobs and writes the fixes, the cover letter and the interview prep.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            {home ? (
              <Link href={home} className="inline-flex h-12 items-center gap-2 rounded-md bg-gradient-to-b from-accent to-accent-hover px-6 font-medium text-accent-on shadow-button transition hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.98]">
                Open your dashboard <ArrowRight size={16} weight="bold" />
              </Link>
            ) : (
              <>
                <Link href="/register" className="inline-flex h-12 items-center gap-2 rounded-md bg-gradient-to-b from-accent to-accent-hover px-6 font-medium text-accent-on shadow-button transition hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.98]">
                  Check my resume free <ArrowRight size={16} weight="bold" />
                </Link>
                <Link href="/register?role=recruiter" className="inline-flex h-12 items-center rounded-md bg-surface px-5 font-medium text-ink shadow-key transition hover:-translate-y-0.5 hover:bg-sunken active:scale-[0.98]">
                  I&apos;m hiring
                </Link>
              </>
            )}
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-subtle">
            {["Free to start", "PDF, DOCX or TXT", "Report in seconds"].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5"><CheckCircle size={16} weight="fill" className="text-accent" />{t}</li>
            ))}
          </ul>
        </div>
        <div className="fade-up relative [animation-delay:120ms]">
          <HeroScene />
        </div>
      </div>
    </section>
  );
}
