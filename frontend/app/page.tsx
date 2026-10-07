"use client";
import Link from "next/link";
import { ArrowRight, FileMagnifyingGlass, ListChecks, PencilLine, UsersThree } from "@phosphor-icons/react";
import { MatchBreakdown, type Match } from "@/components/match";
import { Panel, Score } from "@/components/ui";
import { ResumeScanArt } from "@/components/scan-art";

// Sample output rendered with the real breakdown component (illustrative data, not a screenshot).
const SAMPLE: Match = {
  score: 84.3, verdict: "Excellent match",
  components: { semantic: 78.6, skills: 91.2, experience: 100, education: 100, title: 62.4 },
  matched: ["Python", "FastAPI", "PostgreSQL", "AWS", "Docker", "Kubernetes"],
  partial: [{ skill: "Redis", via: "Memcached", kind: "related" }],
  missing_required: [], missing_preferred: ["Terraform"],
  candidate_years: 6.4, required_years: 5, highlights: [], concerns: [],
};

export default function Home() {
  return (
    <div className="grid gap-12">
      <section className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:pt-4">
        <div>
          <h1 className="max-w-[18ch] text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl">
            Know why a resume fits a job, not just that it does.
          </h1>
          <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-muted">
            Upload a resume. See its ATS score, the exact skills a role is missing, and how it ranks against open jobs.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/register" className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-5 font-medium text-accent-on transition hover:bg-accent-hover active:translate-y-px">
              Create account <ArrowRight size={16} weight="bold" />
            </Link>
            <Link href="/login" className="inline-flex h-11 items-center rounded-md px-4 font-medium text-muted transition hover:text-ink">Try a demo account</Link>
          </div>
        </div>

        <Panel as="figure" className="p-0" aria-label="Example match breakdown">
          <div className="flex items-center gap-4 border-b border-line p-5">
            <Score score={SAMPLE.score} size="md" />
            <div>
              <p className="font-medium">Senior Backend Engineer</p>
              <p className="text-sm text-subtle">Nimbus Cloud, Bengaluru</p>
            </div>
          </div>
          <div className="p-5"><MatchBreakdown m={SAMPLE} /></div>
          <figcaption className="border-t border-line px-5 py-3 text-xs text-subtle">Example output. Every score explains itself.</figcaption>
        </Panel>
      </section>

      <section className="grid gap-6">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">One upload. Four answers.</h2>
        <div className="grid items-center gap-8 lg:grid-cols-[0.9fr_1.4fr]">
          <ResumeScanArt className="w-full max-w-md" />
          <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {[
            [FileMagnifyingGlass, "Will an ATS read it?", "Eight checks on structure, action verbs, measurable results and formatting, with a fix for each section."],
            [ListChecks, "Which jobs fit?", "Matches rank on meaning, skills, experience, education and title. Skill aliases and related tools count."],
            [PencilLine, "What should I change?", "Weak bullet points rewritten with a stronger verb and a slot for the metric. Tailored to one job if you pick it."],
            [UsersThree, "Who should I call first?", "Recruiters drop in a batch of resumes and get a ranked shortlist, side by side comparison and a CSV."],
          ].map(([Icon, t, d]: any) => (
            <div key={t}>
              <dt className="flex items-center gap-2 font-medium"><Icon size={20} weight="duotone" className="text-accent" />{t}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted">{d}</dd>
            </div>
          ))}
          </dl>
        </div>
      </section>

      <section className="rounded-xl bg-sunken p-6 md:p-8">
        <div className="grid gap-8 md:grid-cols-3">
          {[
            ["35%", "Semantic fit", "Sentence embeddings compare your experience with the role's responsibilities."],
            ["35%", "Skills", "Required skills count double. Exact, alias, fuzzy and related matches each earn partial credit."],
            ["30%", "Experience, education, title", "Years come from your actual date ranges, merged so overlapping jobs are not double counted."],
          ].map(([w, t, d]) => (
            <div key={t}>
              <p className="font-mono text-3xl font-semibold tabular text-accent">{w}</p>
              <p className="mt-2 font-medium">{t}</p>
              <p className="mt-1 text-wrap text-sm leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
