"use client";
import { ChartLineUp, Envelope, MagicWand, Target } from "@phosphor-icons/react";
import CardSwap, { Card } from "@/components/rb/CardSwap";
import { cn } from "@/lib/utils";

function Head({ icon: Icon, title, tag }: { icon: typeof Target; title: string; tag: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-line/80 px-5 py-3.5">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-soft text-accent"><Icon size={16} weight="duotone" /></span>
      <span className="text-sm font-semibold text-ink">{title}</span>
      <span className="ml-auto rounded-full bg-sunken px-2.5 py-0.5 text-[11px] font-medium text-muted">{tag}</span>
    </div>
  );
}

function Bar({ v, warn }: { v: number; warn?: boolean }) {
  return <div className="h-1.5 overflow-hidden rounded-full bg-line/70"><div className={cn("h-full rounded-full", warn ? "bg-warn" : "bg-accent")} style={{ width: `${v}%` }} /></div>;
}

const CHECKS: [string, number][] = [["Structure", 96], ["Action verbs", 88], ["Measurable results", 74], ["Formatting", 92]];
const JOBS: [string, string, number][] = [["Data Analyst", "Google", 94], ["BI Developer", "Flipkart", 87], ["Analytics Engineer", "Razorpay", 72]];

/** Homepage hero: a 3D deck of real CVerity outputs that swap to the front one after another. */
export default function HeroDeck() {
  return (
    <CardSwap theme="light" width={430} height={300} cardDistance={54} verticalDistance={62} depth={110} skewAmount={5}
      delay={3600} cardRadius={20} pauseOnHover>
      <Card className="bg-surface">
        <Head icon={ChartLineUp} title="ATS report" tag="Grade A" />
        <div className="grid grid-cols-[auto_1fr] items-center gap-6 p-5">
          <div className="grid h-24 w-24 place-items-center rounded-full" style={{ background: "conic-gradient(rgb(var(--accent)) 0 88%, rgb(var(--line)) 88% 100%)" }}>
            <div className="grid h-[78px] w-[78px] place-items-center rounded-full bg-surface">
              <span className="font-mono text-3xl font-semibold text-ink">88</span>
            </div>
          </div>
          <ul className="grid gap-2.5">
            {CHECKS.map(([t, v]) => (
              <li key={t} className="grid gap-1">
                <div className="flex justify-between text-[12px]"><span className="text-muted">{t}</span><span className="font-mono text-ink">{v}</span></div>
                <Bar v={v} warn={v < 80} />
              </li>
            ))}
          </ul>
        </div>
      </Card>
      <Card className="bg-surface">
        <Head icon={Target} title="Best-fit jobs" tag="12 new" />
        <ul className="grid gap-3 p-5">
          {JOBS.map(([t, co, s]) => (
            <li key={t} className="grid gap-1.5 rounded-xl bg-sunken/70 px-4 py-3">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-ink">{t} <span className="font-normal text-subtle">· {co}</span></span>
                <span className={cn("font-mono font-semibold", s >= 80 ? "text-accent" : "text-warn")}>{s}%</span>
              </div>
              <Bar v={s} warn={s < 80} />
            </li>
          ))}
        </ul>
      </Card>
      <Card className="bg-surface">
        <Head icon={MagicWand} title="Bullet rewrite" tag="+2 points" />
        <div className="grid gap-3 p-5 text-[13px] leading-relaxed">
          <p className="rounded-xl bg-bad-soft/70 px-4 py-3 text-muted line-through decoration-bad/50">Responsible for making reports for the sales team.</p>
          <p className="rounded-xl bg-accent-soft px-4 py-3 text-accent-ink">
            Built 14 weekly Power BI dashboards for 40 sales reps, cutting reporting time by <span className="rounded bg-surface px-1 font-mono">[X]%</span>.
          </p>
          <p className="text-[11px] text-subtle">Stronger verb, real numbers, a slot for the metric you know.</p>
        </div>
      </Card>
      <Card className="bg-surface">
        <Head icon={Envelope} title="Cover letter" tag="Google" />
        <div className="grid gap-2.5 p-5 text-[13px] leading-relaxed text-muted">
          <p className="text-ink">Dear Hiring Team,</p>
          <p>As a data analyst who has shipped churn models and 14 live dashboards at Swiggy, I was excited to see the Data Analyst role...</p>
          <div className="grid gap-1.5 pt-1">{[92, 84, 60].map((w) => <div key={w} className="h-1.5 rounded-full bg-line" style={{ width: `${w}%` }} />)}</div>
        </div>
      </Card>
    </CardSwap>
  );
}
