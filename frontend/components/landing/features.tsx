"use client";
import {
  ChatsCircle, EnvelopeSimple, Eye, FileMagnifyingGlass, Kanban, ListChecks, PencilLine, UsersThree,
} from "@phosphor-icons/react";
import { ShortlistArt } from "@/components/shortlist-art";
import { Frame3D, TiltCard } from "@/components/landing/three-d";

/** A short strip of the questions CVerity answers: what users get, stated plainly. */
export function ValueStrip() {
  const items = [
    ["8", "ATS checks on every upload"],
    ["5", "signals behind each match score"],
    ["100", "resumes ranked per batch"],
    ["0", "made-up experience in any rewrite"],
  ];
  return (
    <section aria-label="At a glance" className="border-b border-line/70 bg-surface/60">
      <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-4 py-10 md:grid-cols-4 md:px-6">
        {items.map(([n, l], i) => (
          <div key={l} className={i > 0 ? "md:border-l md:border-line md:pl-8" : ""}>
            <dt className="sr-only">{l}</dt>
            <dd className="font-mono text-3xl font-semibold tabular tracking-tight md:text-4xl">{n}</dd>
            <dd className="mt-1 max-w-[20ch] text-sm text-muted">{l}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const SEEKER = [
  [FileMagnifyingGlass, "Will an ATS read it?", "Eight checks on structure, action verbs, measurable results and formatting, with a fix for every section."],
  [ListChecks, "Which jobs fit?", "Every open role ranked on meaning, skills, experience, education and title. Aliases and related tools count."],
  [PencilLine, "What should I change?", "Weak bullets rewritten with a stronger verb and a slot for the metric, tailored to the job you pick."],
  [EnvelopeSimple, "A cover letter that sounds like you", "Written from your real experience and the job's requirements. Copy it or download it."],
  [ChatsCircle, "Walk in prepared", "Likely interview questions, including the ones about the skills you are missing, with how to answer."],
  [Kanban, "Track every application", "Saved, applied, interviewing, offer. Notes and match scores in one board."],
] as const;

const RECRUITER = [
  [UsersThree, "A ranked shortlist in minutes", "Drop up to 100 resumes on a job. Each is parsed, scored and ranked while you watch."],
  [Kanban, "A hiring pipeline per role", "Move candidates from new to hired, keep private notes and filter by stage."],
  [Eye, "Blind screening", "Hide names and file names with one switch, so the first pass is about skills and experience."],
] as const;

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 border-b border-line/70">
      <div className="mx-auto max-w-6xl px-4 py-24 md:px-6 md:py-32">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-accent">For job seekers</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.025em] md:text-[2.75rem] md:leading-[1.08]">One upload. Every answer you need to get hired.</h2>
          <p className="mt-4 text-lg leading-relaxed text-muted">Stop guessing why applications go quiet. See what the screening software sees, then fix it.</p>
        </div>
        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SEEKER.map(([Icon, t, d]) => (
            <li key={t}>
              <TiltCard className="h-full rounded-2xl bg-surface p-7 ring-1 ring-line/80 shadow-[0_1px_0_rgb(var(--line)/0.6),0_20px_40px_-30px_rgb(var(--shadow)/0.35)] hover:shadow-[0_30px_60px_-30px_rgb(var(--shadow)/0.45)]">
                <span className="relative z-[2] grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent ring-1 ring-accent/15 [transform:translateZ(40px)]">
                  <Icon size={22} weight="duotone" />
                </span>
                <h3 className="relative z-[2] mt-5 font-semibold [transform:translateZ(24px)]">{t}</h3>
                <p className="relative z-[2] mt-2 text-sm leading-relaxed text-muted [transform:translateZ(12px)]">{d}</p>
              </TiltCard>
            </li>
          ))}
        </ul>

        <div className="mt-28 grid items-center gap-14 lg:grid-cols-[1fr_1.05fr]">
          <div className="order-2 lg:order-1">
            <Frame3D base="tilt-left">
              <ShortlistArt className="relative z-[2] w-full" />
            </Frame3D>
          </div>
          <div className="order-1 lg:order-2">
            <p className="text-sm font-medium text-accent">For hiring teams</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.025em] md:text-[2.75rem] md:leading-[1.08]">Call the right five people first.</h2>
            <p className="mt-4 max-w-[48ch] text-lg leading-relaxed text-muted">Every score comes with its reasons, so you can defend a shortlist instead of trusting a black box.</p>
            <dl className="mt-10 grid gap-7">
              {RECRUITER.map(([Icon, t, d]) => (
                <div key={t} className="grid grid-cols-[2.5rem_1fr] gap-4">
                  <dt className="contents">
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent-soft text-accent"><Icon size={20} weight="duotone" /></span>
                    <span className="self-center font-semibold">{t}</span>
                  </dt>
                  <dd className="col-start-2 -mt-3 text-sm leading-relaxed text-muted">{d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
