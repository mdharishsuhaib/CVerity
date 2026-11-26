"use client";
import Link from "next/link";
import { ArrowRight, CheckCircle } from "@phosphor-icons/react";
import SplitText from "@/components/rb/SplitText";
import { HeroDeck, LiquidEther } from "@/components/fx";
import { useAuth } from "@/components/providers";

export function Hero() {
  const { user } = useAuth();
  const home = user ? (user.role === "recruiter" ? "/recruiter" : "/seeker") : null;
  return (
    <section className="relative overflow-hidden border-b border-line/70">
      {/* React Bits LiquidEther: a live fluid simulation in brand greens that swirls behind the hero and follows the cursor. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-50">
        <LiquidEther lightMode colors={["#0e7a5f", "#5fd3ae", "#b9ecdb"]} intensity={1.3} cursorSize={110} autoDemo autoSpeed={0.45}
          autoIntensity={1.6} resolution={0.45} maxDevicePixelRatio={1.5} />
      </div>
      {/* Soft veil on the text side keeps the headline crisp while the fluid shows through around it. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-full bg-[radial-gradient(ellipse_55%_60%_at_25%_45%,rgb(var(--bg)/0.85),transparent_70%)] lg:w-3/4" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 md:px-6 md:pb-28 md:pt-20 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <h1 className="max-w-[16ch] text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.035em] md:text-6xl">
            <SplitText tag="span" text="Beat the ATS." className="block" splitType="chars" delay={26} duration={0.8}
              effect="rise" mask trigger="load" hoverEffect="wave" textAlign="left" />
            <SplitText tag="span" text="Land the interview." className="block text-accent" splitType="chars" delay={26} duration={0.8}
              effect="rise" mask trigger="load" hoverEffect="wave" textAlign="left" />
          </h1>
          <p className="fade-up mt-6 max-w-[52ch] text-lg leading-relaxed text-muted [animation-delay:500ms]">
            CVerity reads a resume the way an ATS and a recruiter would. It scores it, shows the exact skills a role is missing,
            ranks it against open jobs and writes the fixes, the cover letter and the interview prep.
          </p>
          <div className="fade-up mt-9 flex flex-wrap items-center gap-3 [animation-delay:650ms]">
            {home ? (
              <Link href={home} className="inline-flex h-12 items-center gap-2 rounded-md bg-gradient-to-b from-accent to-accent-hover px-6 font-medium text-accent-on shadow-button transition hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.98]">
                My dashboard <ArrowRight size={16} weight="bold" />
              </Link>
            ) : (
              <>
                <Link href="/register" className="inline-flex h-12 items-center gap-2 rounded-md bg-gradient-to-b from-accent to-accent-hover px-6 font-medium text-accent-on shadow-button transition hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.98]">
                  Scan my resume <ArrowRight size={16} weight="bold" />
                </Link>
                <Link href="/register?role=recruiter" className="inline-flex h-12 items-center rounded-md bg-surface px-5 font-medium text-ink shadow-key transition hover:-translate-y-0.5 hover:bg-sunken active:scale-[0.98]">
                  I&apos;m hiring
                </Link>
              </>
            )}
          </div>
          <ul className="fade-up mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-subtle [animation-delay:800ms]">
            {["PDF, DOCX or TXT", "Results in seconds", "Every score explained"].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5"><CheckCircle size={16} weight="fill" className="text-accent" />{t}</li>
            ))}
          </ul>
        </div>
        {/* React Bits CardSwap: a 3D deck of CVerity outputs that swap to the front; drag or hover to play with it. */}
        <div className="relative mx-auto aspect-[6/5] w-full max-w-[520px] sm:aspect-auto sm:h-[440px]">
          <HeroDeck />
        </div>
      </div>
    </section>
  );
}
