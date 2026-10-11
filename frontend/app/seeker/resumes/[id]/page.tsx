"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Sparkle } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { RequireAuth } from "@/components/providers";
import { Button, ErrorNote, Input, ListSkeleton, Panel, Score, Skeleton, Tag } from "@/components/ui";
import { MatchRow } from "@/components/match";

export default function Page() {
  return <RequireAuth role="seeker"><Suspense fallback={<ListSkeleton />}><Report /></Suspense></RequireAuth>;
}

const TABS = [["report", "ATS report"], ["matches", "Job matches"], ["coach", "Rewrite suggestions"]] as const;

function Report() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const [tab, setTab] = useState<string>(sp.get("tab") || "report");
  const [coachJob, setCoachJob] = useState<{ id: number; title: string } | null>(null);
  const { data: r, isLoading, error } = useQuery({ queryKey: ["resume", id], queryFn: () => api(`/resumes/${id}`) });

  if (isLoading) return <div className="grid gap-4"><Skeleton className="h-24 w-full" /><ListSkeleton rows={2} /></div>;
  if (error) return <ErrorNote error={error} />;
  const p = r.profile, ats = r.ats;
  const meta = [p.titles?.[0], p.seniority, p.years_experience ? `${p.years_experience} yrs` : null, p.education_label !== "None specified" ? p.education_label : null].filter(Boolean);

  return (
    <div className="grid gap-8">
      <Link href="/seeker" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted transition hover:text-ink"><ArrowLeft size={14} weight="bold" />Resumes</Link>
      <header className="flex flex-wrap items-center gap-6">
        <Score score={ats.score} size="lg" label={`ATS grade ${ats.grade}`} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">{p.contact?.name || r.filename}</h1>
          <p className="mt-1 text-muted">{meta.join(", ")}</p>
          <p className="mt-1 truncate text-sm text-subtle">{[p.contact?.email, p.contact?.phone, p.contact?.linkedin].filter(Boolean).join("   ")}</p>
        </div>
      </header>

      <div role="tablist" className="flex gap-1 border-b border-line">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); if (k !== "coach") setCoachJob(null); }}
            className={cn("-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors", tab === k ? "border-accent text-ink" : "border-transparent text-subtle hover:text-ink")}>
            {l}
          </button>
        ))}
      </div>

      {tab === "report" && <AtsReport r={r} />}
      {tab === "matches" && <Matches id={id} onTailor={(j) => { setCoachJob(j); setTab("coach"); }} />}
      {tab === "coach" && <Coach id={id} job={coachJob} onClearJob={() => setCoachJob(null)} />}
    </div>
  );
}

function AtsReport({ r }: { r: any }) {
  const ats = r.ats, p = r.profile;
  const failing = ats.checks.filter((c: any) => c.status !== "pass");
  const passing = ats.checks.filter((c: any) => c.status === "pass");
  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      <div className="grid content-start gap-8">
        <section>
          <h2 className="mb-3 font-semibold">{failing.length === 0 ? "Nothing to fix" : failing.length === 1 ? "1 thing to fix" : `${failing.length} things to fix`}</h2>
          <ul className="grid gap-2">
            {failing.map((c: any) => (
              <li key={c.id} className="grid grid-cols-[3.5rem_1fr] gap-3 rounded-xl bg-surface p-4 ring-1 ring-line/70">
                <span className={cn("font-mono text-sm tabular", c.status === "warn" ? "text-warn" : "text-bad")}>{Math.round(c.score)}/{c.max}</span>
                <div><p className="font-medium">{c.name}</p><p className="mt-0.5 text-sm text-muted">{c.message}</p></div>
              </li>
            ))}
          </ul>
          {passing.length > 0 && (
            <p className="mt-4 text-sm text-muted">
              <span className="font-medium text-accent-ink">Passing:</span> {passing.map((c: any) => c.name).join(", ")}.
            </p>
          )}
        </section>

        {Object.keys(ats.section_feedback).length > 0 && (
          <section>
            <h2 className="mb-3 font-semibold">Section by section</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              {Object.entries(ats.section_feedback as Record<string, string[]>).map(([s, tips]) => (
                <div key={s}>
                  <dt className="text-sm font-medium capitalize">{s === "header" ? "Contact details" : s}</dt>
                  {tips.map((t) => <dd key={t} className="mt-1 text-sm leading-relaxed text-muted">{t}</dd>)}
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>

      <aside className="grid content-start gap-6">
        <Panel>
          <h2 className="font-semibold">Skills we found</h2>
          <p className="text-sm text-subtle">{p.skills.length} across {Object.keys(p.skills_by_category).length} categories</p>
          <div className="mt-4 grid gap-4">
            {Object.entries(p.skills_by_category as Record<string, string[]>).map(([cat, s]) => (
              <div key={cat}>
                <p className="mb-1.5 text-xs text-subtle">{cat}</p>
                <div className="flex flex-wrap gap-1">{s.map((x) => <Tag key={x}>{x}</Tag>)}</div>
              </div>
            ))}
          </div>
          {p.certifications?.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-1.5 text-xs text-subtle">Certifications</p>
              <div className="flex flex-wrap gap-1">{p.certifications.map((c: string) => <Tag key={c} tone="good">{c}</Tag>)}</div>
            </div>
          )}
        </Panel>
        <dl className="grid grid-cols-3 gap-4 px-1 text-sm">
          {[["Words", ats.stats.words], ["Bullets", ats.stats.bullets], ["With numbers", `${Math.round(ats.stats.quantified_ratio * 100)}%`]].map(([l, v]) => (
            <div key={l as string}><dt className="text-xs text-subtle">{l}</dt><dd className="font-mono text-lg tabular">{v}</dd></div>
          ))}
        </dl>
      </aside>
    </div>
  );
}

function Matches({ id, onTailor }: { id: string; onTailor: (j: { id: number; title: string }) => void }) {
  const [q, setQ] = useState("");
  const { data, isLoading, error } = useQuery({ queryKey: ["matches", id, q], queryFn: () => api(`/match/resume/${id}/jobs?top_k=20${q ? `&q=${encodeURIComponent(q)}` : ""}`) });
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{data ? `Top ${data.items.length} of ${data.total_considered} jobs, best match first.` : " "}</p>
        <label className="w-full sm:w-72"><span className="sr-only">Filter jobs</span><Input placeholder="Filter: remote, python, Pune..." value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      <ErrorNote error={error} />
      {isLoading ? <ListSkeleton rows={4} /> : data?.items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No jobs match that filter.</p>
      ) : data?.items.map((it: any) => (
        <MatchRow key={it.job.id} title={it.job.title} subtitle={[it.job.company, it.job.location].filter(Boolean).join(", ")} m={it.match}
          actions={<Button size="sm" variant="secondary" onClick={() => onTailor({ id: it.job.id, title: it.job.title })}><Sparkle size={14} weight="fill" />Tailor</Button>} />
      ))}
    </div>
  );
}

function Coach({ id, job, onClearJob }: { id: string; job: { id: number; title: string } | null; onClearJob: () => void }) {
  const m = useMutation({ mutationFn: () => api(`/resumes/${id}/improve${job ? `?job_id=${job.id}` : ""}`, { method: "POST" }) });
  const d = m.data;
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-sunken p-5">
        <div className="max-w-[60ch]">
          <p className="font-medium">{job ? `Tailoring for ${job.title}` : "General suggestions"}</p>
          <p className="mt-0.5 text-sm text-muted">
            {job ? <>Uses this job's required skills. <button onClick={onClearJob} className="font-medium text-accent hover:underline">Use general mode</button></> : "Pick Tailor on any job match to focus the rewrite on that role."}
          </p>
        </div>
        <Button onClick={() => m.mutate()} disabled={m.isPending}><Sparkle size={16} weight="fill" />{m.isPending ? "Writing..." : d ? "Regenerate" : "Generate"}</Button>
      </div>
      <ErrorNote error={m.error} />
      {m.isPending && <div className="grid gap-3"><Skeleton className="h-20" /><Skeleton className="h-32" /></div>}
      {d && !m.isPending && (
        <div className="grid gap-8">
          {d.llm_error && <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{
            d.llm_error_kind === "quota" ? "The AI service has reached its usage limit, so these suggestions come from built-in rules. Try again later."
            : d.llm_error_kind === "auth" ? "The AI service key is not valid, so these suggestions come from built-in rules."
            : d.llm_error_kind === "timeout" ? "The AI service took too long to answer, so these suggestions come from built-in rules. Try again."
            : d.llm_error_kind === "model" ? "The configured AI model is not available, so these suggestions come from built-in rules."
            : "The AI model is unavailable right now, so these suggestions come from built-in rules."
          }</p>}
          <section>
            <h3 className="mb-2 font-semibold">Summary</h3>
            <p className="max-w-[70ch] rounded-xl bg-surface p-5 leading-relaxed ring-1 ring-line/70">{d.tailored_summary}</p>
          </section>
          <section>
            <h3 className="mb-3 font-semibold">Bullet points, before and after</h3>
            {d.rewritten_bullets.length === 0 ? <p className="text-sm text-muted">Your bullet points already lead with action and results.</p> : (
              <ol className="grid gap-3">
                {d.rewritten_bullets.map((b: any, i: number) => (
                  <li key={i} className="grid gap-px overflow-hidden rounded-xl ring-1 ring-line/70 md:grid-cols-2">
                    <p className="bg-sunken p-4 text-sm text-muted line-through decoration-line">{b.original}</p>
                    <p className="bg-surface p-4 text-sm">{b.improved}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <div className="grid gap-8 md:grid-cols-2">
            <section>
              <h3 className="mb-2 font-semibold">Keywords to add</h3>
              {d.missing_keywords.length ? <div className="flex flex-wrap gap-1">{d.missing_keywords.map((k: string) => <Tag key={k} tone="bad">{k}</Tag>)}</div> : <p className="text-sm text-muted">None missing.</p>}
              <ul className="mt-3 grid gap-1.5 text-sm text-muted">{d.keyword_tips.map((t: string) => <li key={t}>{t}</li>)}</ul>
            </section>
            <section>
              <h3 className="mb-2 font-semibold">Cover letter outline</h3>
              <ol className="grid list-decimal gap-1.5 pl-5 text-sm text-muted">{d.cover_letter_points.map((t: string) => <li key={t}>{t}</li>)}</ol>
            </section>
          </div>
          <p className="text-xs text-subtle">Source: {d.source === "rules" ? "built-in rules" : `AI model via ${({ groq: "Groq", openai: "OpenAI", ollama: "Ollama" } as Record<string, string>)[d.source.replace("llm:", "")] ?? d.source.replace("llm:", "")}`}</p>
        </div>
      )}
    </div>
  );
}
