"use client";
import Link from "next/link";
import { FuzzyText } from "@/components/fx";

export default function NotFound() {
  return (
    <div className="mx-auto grid max-w-lg justify-items-center gap-4 pt-16 text-center">
      {/* React Bits FuzzyText: a glitching, static-like 404 that gets fuzzier on hover. */}
      <div aria-hidden className="grid h-40 place-items-center">
        <FuzzyText fontSize="clamp(6rem, 18vw, 9rem)" fontWeight={700} color="#0e7a5f" baseIntensity={0.18} hoverIntensity={0.5} enableHover>
          404
        </FuzzyText>
      </div>
      <h1 className="mt-2 text-[1.75rem] font-semibold tracking-[-0.025em]">This page does not exist</h1>
      <p className="text-muted">The link may be old, or the job or resume was deleted.</p>
      <div className="flex gap-3 pt-2">
        <Link href="/" className="inline-flex h-10 items-center rounded-md bg-gradient-to-b from-accent to-accent-hover px-4 text-sm font-medium text-accent-on shadow-button transition hover:-translate-y-px hover:brightness-110">Go home</Link>
        <Link href="/login" className="inline-flex h-10 items-center rounded-md bg-surface px-4 text-sm font-medium text-ink shadow-key transition hover:-translate-y-px">Log in</Link>
      </div>
    </div>
  );
}
