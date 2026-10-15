"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookmarkSimple, CaretDown, ChatsCircle, Copy, DownloadSimple, EnvelopeSimple, Sparkle } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { RequireAuth } from "@/components/providers";
import { AiNotice, Button, ErrorNote, Input, ListSkeleton, Panel, Score, Select, Skeleton, Tag } from "@/components/ui";
import { MatchRow } from "@/components/match";

export default function Page() {
  return <RequireAuth role="seeker"><Suspense fallback={<ListSkeleton />}><Report /></Suspense></RequireAuth>;
}

const TABS = [["report", "ATS report"], ["matches", "Job matches"], ["coach", "Rewrite suggestions"], ["cover", "Cover letter"], ["interview", "Interview prep"]] as const;

type Target = { id: number; title: string } | null;

function Report() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const [tab, setTab] = useState<string>(sp.get("tab") || "report");
  // The job being targeted by the rewrite, cover letter and interview tabs (shared so it carries across them).
  const [target, setTarget] = useState<Target>(null);
  const { data: r, isLoading, error } = useQuery({ queryKey: ["resume", id], queryFn: () => api(`/resumes/${id}`) });

  if (isLoading) return <div className="grid gap-4"><Skeleton className="h-24 w-full" /><ListSkeleton rows={2} /></div>;
  if (error) return <ErrorNote error={error} />;
  const p = r.profile, ats = r.ats;
  const meta = [p.titles?.[0], p.seniority, p.years_experience ? `${p.years_experience} yrs` : null, p.education_label !== "None specified" ? p.education_label : null].filter(Boolean);

  return (
    <div className="grid gap-8">
      <Link href="/seeker" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted transition hover:text-ink"><ArrowLeft size={14} weight="bold" />Resumes</Link>
      <header className="relative flex flex-wrap items-center gap-6 overflow-hidden rounded-2xl bg-surface p-6 shadow-depth-lg md:p-8">
        <div aria-hidden className="landing-grid absolute inset-0 opacity-60" />
        <div aria-hidden className="landing-glow absolute -right-24 -top-24 h-72 w-72 rounded-full" />
        <div className="relative [perspective:600px]"><div className="float-a [transform:rotateY(-14deg)]"><Score score={ats.score} size="lg" label={`ATS grade ${ats.grade}`} /></div></div>
        <div className="relative min-w-0 flex-1">
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em] md:text-[2.1rem]">{p.contact?.name || r.filename}</h1>
          <p className="mt-1 text-muted">{meta.join(", ")}</p>
          <p className="mt-1 truncate text-sm text-subtle">{[p.contact?.email, p.contact?.phone, p.contact?.linkedin].filter(Boolean).join("   ")}</p>
        </div>
      </header>

      <div role="tablist" className="relative -mx-1 flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl bg-sunken p-1 shadow-[inset_0_1px_3px_rgb(var(--shadow)/0.12)]">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn("shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition", tab === k ? "bg-surface text-ink shadow-key" : "text-subtle hover:text-ink")}>
            {l}
          </button>
        ))}
      </div>

      {tab === "report" && <AtsReport r={r} />}
      {tab === "matches" && <Matches id={id} onPick={(j, next) => { setTarget(j); setTab(next); }} />}
      {tab === "coach" && <Coach id={id} job={target} onClearJob={() => setTarget(null)} />}
      {tab === "cover" && <CoverLetter id={id} job={target} onPick={setTarget} />}
      {tab === "interview" && <InterviewPrep id={id} job={target} onPick={setTarget} />}
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
              <li key={c.id} className="grid grid-cols-[3.5rem_1fr] gap-3 rounded-xl bg-surface p-4 shadow-depth lift">
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

const matchesQuery = (id: string, q = "") => ({
  queryKey: ["matches", id, q],
  queryFn: () => api(`/match/resume/${id}/jobs?top_k=20${q ? `&q=${encodeURIComponent(q)}` : ""}`),
});

function Matches({ id, onPick }: { id: string; onPick: (j: { id: number; title: string }, tab: string) => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const { data, isLoading, error } = useQuery(matchesQuery(id, q));
  const apps = useQuery({ queryKey: ["applications"], queryFn: () => api("/applications") });
  const tracked = new Set<number>((apps.data?.items ?? []).map((a: any) => a.job?.id));
  const track = useMutation({
    mutationFn: (jobId: number) => api("/applications", { method: "POST", body: JSON.stringify({ job_id: jobId, resume_id: Number(id) }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["applications"] }),
  });
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{data ? `Top ${data.items.length} of ${data.total_considered} jobs, best match first.` : " "}</p>
        <label className="w-full sm:w-72"><span className="sr-only">Filter jobs</span><Input placeholder="Filter: remote, python, Pune..." value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      <ErrorNote error={error || track.error} />
      {isLoading ? <ListSkeleton rows={4} /> : data?.items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No jobs match that filter.</p>
      ) : data?.items.map((it: any) => {
        const job = { id: it.job.id, title: it.job.title };
        const isTracked = tracked.has(it.job.id);
        return (
          <MatchRow key={it.job.id} title={it.job.title} subtitle={[it.job.company, it.job.location].filter(Boolean).join(", ")} m={it.match}
            actions={<>
              {isTracked ? (
                <Link href="/seeker/applications" className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-accent-ink hover:bg-sunken">
                  <BookmarkSimple size={14} weight="fill" />Tracking
                </Link>
              ) : (
                <Button size="sm" variant="quiet" disabled={track.isPending && track.variables === it.job.id} onClick={() => track.mutate(it.job.id)}>
                  <BookmarkSimple size={14} />Track
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => onPick(job, "cover")}><EnvelopeSimple size={14} />Cover letter</Button>
              <Button size="sm" variant="secondary" onClick={() => onPick(job, "coach")}><Sparkle size={14} weight="fill" />Tailor</Button>
            </>} />
        );
      })}
    </div>
  );
}

/** Lets the cover letter and interview tabs choose a target job from this resume's best matches. */
function JobPicker({ id, job, onPick }: { id: string; job: Target; onPick: (j: Target) => void }) {
  const { data } = useQuery(matchesQuery(id));
  const items: any[] = data?.items ?? [];
  return (
    <label className="grid gap-1.5 text-sm sm:w-80">
      <span className="font-medium">Target job</span>
      <Select value={job?.id ?? ""} onChange={(e) => {
        const it = items.find((x) => x.job.id === Number(e.target.value));
        onPick(it ? { id: it.job.id, title: it.job.title } : null);
      }}>
        <option value="">{items.length ? "Choose one of your matches" : "Loading matches..."}</option>
        {job && !items.some((x) => x.job.id === job.id) && <option value={job.id}>{job.title}</option>}
        {items.map((it) => <option key={it.job.id} value={it.job.id}>{it.job.title}{it.job.company ? `, ${it.job.company}` : ""} ({Math.round(it.match.score)})</option>)}
      </Select>
    </label>
  );
}

function CoverLetter({ id, job, onPick }: { id: string; job: Target; onPick: (j: Target) => void }) {
  const m = useMutation({ mutationFn: (jobId: number) => api(`/resumes/${id}/cover-letter?job_id=${jobId}`, { method: "POST" }) });
  const [copied, setCopied] = useState(false);
  const d = m.data && m.variables === job?.id ? m.data : null; // never show a letter written for a different job
  const text = d ? [d.subject && `Subject: ${d.subject}`, "", d.greeting, "", ...d.paragraphs.flatMap((p: string) => [p, ""]), d.closing].filter((x) => x != null).join("\n") : "";
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-surface p-5 shadow-depth">
        <JobPicker id={id} job={job} onPick={onPick} />
        <Button onClick={() => job && m.mutate(job.id)} disabled={!job || m.isPending}>
          <EnvelopeSimple size={16} weight="fill" />{m.isPending ? "Writing..." : d ? "Rewrite" : "Write cover letter"}
        </Button>
      </div>
      <ErrorNote error={m.error} />
      {!job && <p className="text-sm text-muted">Choose a job above. The letter uses your resume and that job&apos;s requirements, and never invents experience.</p>}
      {m.isPending && <Skeleton className="h-72" />}
      {d && !m.isPending && (
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <div className="grid content-start gap-3">
            {d.llm_error && <AiNotice kind={d.llm_error_kind} />}
            <article className="whitespace-pre-line rounded-xl bg-surface p-6 text-[15px] leading-relaxed shadow-depth-lg md:p-10">
              {d.subject && <p className="mb-4 text-sm text-subtle">Subject: {d.subject}</p>}
              <p>{d.greeting}</p>
              {d.paragraphs.map((p: string, i: number) => <p key={i} className="mt-4">{p}</p>)}
              <p className="mt-6">{d.closing}</p>
            </article>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={copy}><Copy size={14} />{copied ? "Copied" : "Copy"}</Button>
              <Button variant="secondary" size="sm" onClick={() => downloadText(text, `cover-letter-${slug(job?.title)}.txt`)}><DownloadSimple size={14} />Download .txt</Button>
            </div>
          </div>
          {d.tips?.length > 0 && (
            <aside>
              <h3 className="mb-2 text-sm font-semibold">Before you send it</h3>
              <ul className="grid gap-2 text-sm text-muted">{d.tips.map((t: string) => <li key={t}>{t}</li>)}</ul>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

const CATEGORY_TONE: Record<string, "accent" | "warn" | "neutral" | "bad"> = { Technical: "accent", Gap: "bad", Behavioral: "neutral", "Role fit": "neutral", Company: "warn" };

function InterviewPrep({ id, job, onPick }: { id: string; job: Target; onPick: (j: Target) => void }) {
  const m = useMutation({ mutationFn: (jobId: number) => api(`/resumes/${id}/interview-prep?job_id=${jobId}`, { method: "POST" }) });
  const d = m.data && m.variables === job?.id ? m.data : null;
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-surface p-5 shadow-depth">
        <JobPicker id={id} job={job} onPick={onPick} />
        <Button onClick={() => job && m.mutate(job.id)} disabled={!job || m.isPending}>
          <ChatsCircle size={16} weight="fill" />{m.isPending ? "Preparing..." : d ? "New questions" : "Prepare me"}
        </Button>
      </div>
      <ErrorNote error={m.error} />
      {!job && <p className="text-sm text-muted">Choose a job above to get likely questions, including ones about the skills you are missing.</p>}
      {m.isPending && <div className="grid gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>}
      {d && !m.isPending && (
        <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
          <div className="grid content-start gap-3">
            {d.llm_error && <AiNotice kind={d.llm_error_kind} />}
            <ol className="grid gap-3">
              {d.questions.map((q: any, i: number) => (
                <li key={i}>
                  <details className="group rounded-xl bg-surface shadow-depth transition-shadow open:shadow-depth-lg [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer items-start gap-3 p-4">
                      <span className="mt-0.5 font-mono text-sm tabular text-subtle">{String(i + 1).padStart(2, "0")}</span>
                      <span className="flex-1">
                        <span className="mb-1 block"><Tag tone={CATEGORY_TONE[q.category] ?? "neutral"}>{q.category}</Tag></span>
                        <span className="font-medium">{q.question}</span>
                      </span>
                      <CaretDown size={14} className="mt-1.5 text-subtle transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="grid gap-2 border-t border-line px-4 py-3 pl-12 text-sm">
                      {q.why && <p className="text-muted"><span className="font-medium text-ink">Why they ask: </span>{q.why}</p>}
                      {q.tip && <p className="text-muted"><span className="font-medium text-ink">How to answer: </span>{q.tip}</p>}
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          </div>
          <aside className="grid content-start gap-6">
            {d.focus_areas?.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold">Focus on</h3>
                <ul className="grid gap-1.5 text-sm text-muted">{d.focus_areas.map((t: string) => <li key={t}>{t}</li>)}</ul>
              </section>
            )}
            {d.questions_to_ask?.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold">Questions you can ask them</h3>
                <ul className="grid gap-1.5 text-sm text-muted">{d.questions_to_ask.map((t: string) => <li key={t}>{t}</li>)}</ul>
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

const slug = (s?: string) => (s || "job").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Coach({ id, job, onClearJob }: { id: string; job: Target; onClearJob: () => void }) {
  const m = useMutation({ mutationFn: () => api(`/resumes/${id}/improve${job ? `?job_id=${job.id}` : ""}`, { method: "POST" }) });
  const d = m.data;
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-surface p-5 shadow-depth">
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
          {d.llm_error && <AiNotice kind={d.llm_error_kind} />}
          <section>
            <h3 className="mb-2 font-semibold">Summary</h3>
            <p className="max-w-[70ch] rounded-xl bg-surface p-5 leading-relaxed shadow-depth">{d.tailored_summary}</p>
          </section>
          <section>
            <h3 className="mb-3 font-semibold">Bullet points, before and after</h3>
            {d.rewritten_bullets.length === 0 ? <p className="text-sm text-muted">Your bullet points already lead with action and results.</p> : (
              <ol className="grid gap-3">
                {d.rewritten_bullets.map((b: any, i: number) => (
                  <li key={i} className="grid gap-px overflow-hidden rounded-xl shadow-depth md:grid-cols-2">
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
        </div>
      )}
    </div>
  );
}
