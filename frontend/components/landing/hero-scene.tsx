"use client";
import { useRef } from "react";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { useTilt } from "@/components/landing/three-d";
import { cn } from "@/lib/utils";

const JOBS = [
  { title: "Backend Engineer", co: "Northwind Labs", score: 92 },
  { title: "Data Engineer", co: "Halcyon Health", score: 84 },
  { title: "Cloud Architect", co: "Meridian Pay", score: 71 },
];

function Ring({ value, size = 64 }: { value: number; size?: number }) {
  const r = size / 2 - 5, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} className="stroke-line" strokeWidth="5" fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} className="stroke-accent" strokeWidth="5" fill="none" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-ink font-mono text-[17px] font-semibold">{value}</text>
    </svg>
  );
}

/** Hero: a resume, its ATS score and ranked matches floating at different depths in one 3D scene. */
export function HeroScene() {
  const stage = useRef<HTMLDivElement>(null);
  const scene = useTilt<HTMLDivElement>(7, stage);
  return (
    <div ref={stage} className="relative mx-auto aspect-[1.08] w-full max-w-[560px] [perspective:1400px]"
      role="img" aria-label="A resume scored ATS 88 is ranked against three jobs: Backend Engineer 92, Data Engineer 84, Cloud Architect 71">
      <div ref={scene} className="hero-scene absolute inset-0 [transform-style:preserve-3d]">
        {/* Floor shadow */}
        <div aria-hidden className="absolute inset-x-[8%] bottom-[2%] h-[18%] rounded-[50%] bg-[rgb(var(--shadow)/0.22)] blur-3xl [transform:translateZ(-120px)]" />

        {/* Resume document, back layer */}
        <div className="absolute left-[4%] top-[8%] h-[78%] w-[50%] rounded-2xl bg-surface p-5 ring-1 ring-line shadow-[0_30px_80px_-30px_rgb(var(--shadow)/0.5)] [transform:translateZ(-40px)]">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-accent-soft" />
            <div className="grid gap-1.5"><div className="h-2.5 w-24 rounded-full bg-ink/80" /><div className="h-2 w-16 rounded-full bg-subtle/40" /></div>
          </div>
          {[["w-12", [92, 78, 86]], ["w-10", [70, 88]], ["w-14", [94, 72, 82, 64]]].map(([w, lines], i) => (
            <div key={i} className="mt-5">
              <div className={cn("h-2 rounded-full bg-accent", w as string)} />
              <div className="mt-2.5 grid gap-1.5">{(lines as number[]).map((l, j) => <div key={j} className="h-1.5 rounded-full bg-line" style={{ width: `${l}%` }} />)}</div>
            </div>
          ))}
          <div className="mt-5 flex flex-wrap gap-1.5">
            {["Python", "AWS", "Postgres", "Docker"].map((s) => <span key={s} className="rounded-[5px] bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent-ink">{s}</span>)}
          </div>
          {/* Scan line */}
          <div aria-hidden className="hero-scan pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-transparent via-accent/15 to-transparent">
            <div className="absolute inset-x-0 top-1/2 h-px bg-accent/60" />
          </div>
        </div>

        {/* ATS score, floating forward */}
        <div className="float-a absolute left-[34%] top-[2%] flex items-center gap-3 rounded-2xl bg-surface/95 px-4 py-3 ring-1 ring-line shadow-[0_24px_60px_-24px_rgb(var(--shadow)/0.55)] backdrop-blur [transform:translateZ(70px)]">
          <Ring value={88} size={52} />
          <div><p className="text-[11px] text-subtle">ATS score</p><p className="text-sm font-semibold">Grade A</p></div>
        </div>

        {/* Ranked jobs, stepping toward the viewer */}
        {JOBS.map((j, i) => (
          <div key={j.title}
            className={cn("absolute right-[2%] w-[48%] rounded-xl bg-surface p-3.5 ring-1 shadow-[0_24px_60px_-28px_rgb(var(--shadow)/0.55)]", i === 0 ? "ring-accent/60" : "ring-line")}
            style={{ top: `${24 + i * 20}%`, transform: `translateZ(${110 - i * 40}px)` }}>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-subtle">#{i + 1}</span>
              <span className="truncate text-[13px] font-medium">{j.title}</span>
              <span className={cn("ml-auto font-mono text-lg font-semibold tabular", j.score >= 80 ? "text-accent" : "text-warn")}>{j.score}</span>
            </div>
            <p className="mt-0.5 pl-5 text-[11px] text-subtle">{j.co}</p>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line/70">
              <div className={cn("bar-grow h-full rounded-full", j.score >= 80 ? "bg-accent" : "bg-warn")} style={{ width: `${j.score}%`, animationDelay: `${0.3 + i * 0.15}s` }} />
            </div>
          </div>
        ))}

        {/* Skill verdicts, front-most layer */}
        <div className="float-b absolute bottom-[4%] left-[14%] grid gap-1.5 rounded-xl bg-surface/95 p-3 text-[12px] ring-1 ring-line shadow-[0_24px_60px_-24px_rgb(var(--shadow)/0.6)] backdrop-blur [transform:translateZ(150px)]">
          <span className="inline-flex items-center gap-1.5"><CheckCircle size={14} weight="fill" className="text-accent" />Python, AWS, Postgres</span>
          <span className="inline-flex items-center gap-1.5"><WarningCircle size={14} weight="fill" className="text-bad" />Missing: Kubernetes</span>
        </div>
      </div>
    </div>
  );
}
