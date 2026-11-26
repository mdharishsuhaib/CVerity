"use client";
import Stack from "@/components/rb/Stack";
import { cn } from "@/lib/utils";

const CANDIDATES = [
  { name: "Priya Sharma", role: "Backend Engineer · 6 yrs", score: 96, color: "bg-accent", skills: ["Python", "AWS", "Postgres"], gap: null },
  { name: "Arjun Mehta", role: "Platform Engineer · 5 yrs", score: 91, color: "bg-[#3a63d6]", skills: ["Go", "Kubernetes", "AWS"], gap: "Postgres" },
  { name: "Neha Iyer", role: "Python Developer · 4 yrs", score: 88, color: "bg-[#b0569b]", skills: ["Python", "FastAPI", "Redis"], gap: "AWS" },
  { name: "Rohan Das", role: "Software Engineer · 4 yrs", score: 84, color: "bg-[#d0812c]", skills: ["Java", "Postgres", "Docker"], gap: "Python" },
];

function CandidateCard({ c, rank }: { c: (typeof CANDIDATES)[number]; rank: number }) {
  return (
    <div className="flex h-full w-full select-none flex-col bg-surface p-5 text-left">
      <div className="flex items-center gap-3">
        <span className={cn("grid h-11 w-11 place-items-center rounded-full text-sm font-semibold text-white", c.color)}>
          {c.name.split(" ").map((s) => s[0]).join("")}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{c.name}</p>
          <p className="truncate text-xs text-muted">{c.role}</p>
        </div>
        <span className="ml-auto font-mono text-xs text-subtle">#{rank}</span>
      </div>
      <div className="mt-5 flex items-end justify-between">
        <span className="text-xs font-medium text-muted">Match score</span>
        <span className="font-mono text-3xl font-semibold text-accent">{c.score}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-line/70"><div className="h-full rounded-full bg-accent" style={{ width: `${c.score}%` }} /></div>
      <div className="mt-5 flex flex-wrap gap-1.5">
        {c.skills.map((s) => <span key={s} className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent-ink">{s}</span>)}
        {c.gap && <span className="rounded-full bg-warn-soft px-2.5 py-1 text-[11px] font-medium text-warn">Missing {c.gap}</span>}
      </div>
      <p className="mt-auto pt-4 text-[11px] text-subtle">Drag the card to see the next candidate</p>
    </div>
  );
}

/** Recruiter section: a fanned 3D stack of ranked candidates; drag or let it play to flick through the shortlist. */
export default function ShortlistStack() {
  return (
    <div className="mx-auto h-[330px] w-[290px] sm:h-[360px] sm:w-[320px]">
      <Stack layout="fan" visible={4} spread={0.55} depth={0.55} radius={20} tilt={24} autoplay autoplayDelay={2800} pauseOnHover
        cards={CANDIDATES.map((c, i) => <CandidateCard key={c.name} c={c} rank={i + 1} />)} />
    </div>
  );
}
