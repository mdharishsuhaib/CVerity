"use client";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, Gauge, MagicWand, Plus, Star, UsersThree } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { EDU_LABELS } from "@/lib/utils";
import { RequireAuth } from "@/components/providers";
import { Button, Empty, ErrorNote, Field, Input, ListSkeleton, PageHeader, Panel, Select, Tag, Textarea } from "@/components/ui";
import { TiltCard } from "@/components/landing/three-d";

export default function Page() {
  return <RequireAuth role="recruiter"><Dashboard /></RequireAuth>;
}

function Dashboard() {
  const [showNew, setShowNew] = useState(false);
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: () => api("/recruiter/stats") });
  const { data: jobs, isLoading, error } = useQuery({ queryKey: ["myjobs"], queryFn: () => api("/jobs?mine=true&limit=200") });
  return (
    <>
      <PageHeader title="Jobs" sub="Open a job to upload resumes and see the ranked shortlist."
        actions={!showNew && <Button onClick={() => setShowNew(true)}><Plus size={16} weight="bold" />New job</Button>} />

      <dl className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {[["Open jobs", stats?.jobs, Briefcase], ["Candidates", stats?.candidates, UsersThree], ["Average match", stats?.avg_score, Gauge], ["Scored 65 or higher", stats?.strong_matches, Star]].map(([l, v, Icon]: any, i) => (
          <div key={l} className="fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <TiltCard max={5} className="h-full rounded-xl bg-surface p-5 shadow-depth">
              <dt className="relative z-[2] flex items-center gap-2 text-xs text-subtle [transform:translateZ(16px)]">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-soft text-accent"><Icon size={15} weight="duotone" /></span>{l}
              </dt>
              <dd className="relative z-[2] mt-3 font-mono text-3xl font-semibold tabular [transform:translateZ(30px)]">{v ?? "-"}</dd>
            </TiltCard>
          </div>
        ))}
      </dl>

      {showNew && <NewJob onDone={() => setShowNew(false)} />}
      <ErrorNote error={error} />
      {isLoading ? <ListSkeleton rows={4} /> : jobs?.items.length === 0 ? (
        <Empty title="No jobs yet" body="Create one, then upload resumes to get a ranked shortlist." action={!showNew && <Button onClick={() => setShowNew(true)}><Plus size={16} weight="bold" />New job</Button>} />
      ) : (
        <ul className="grid gap-3">
          {jobs?.items.map((j: any, i: number) => (
            <li key={j.id} className="fade-up" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
              <Link href={`/recruiter/jobs/${j.id}`} className="lift grid gap-2 rounded-xl bg-surface p-5 shadow-depth md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0">
                  <p className="font-medium">{j.title}</p>
                  <p className="text-sm text-subtle">{[j.company, j.location, j.min_years_experience ? `${j.min_years_experience}+ yrs` : null].filter(Boolean).join(", ")}</p>
                  <div className="mt-2 flex flex-wrap gap-1">{j.required_skills.slice(0, 7).map((s: string) => <Tag key={s}>{s}</Tag>)}</div>
                </div>
                <p className="text-sm text-muted md:text-right">
                  <span className="font-mono tabular text-ink">{stats?.candidates_per_job?.[j.id] ?? 0}</span> candidates
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function NewJob({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<any>({ title: "", company: "", location: "", description: "", required_skills: [], preferred_skills: [], min_years_experience: 0, education_level: 0 });
  const [parsed, setParsed] = useState(false);
  const parse = useMutation({
    mutationFn: () => api("/jobs/parse", { method: "POST", body: JSON.stringify({ description: f.description, title: f.title }) }),
    onSuccess: (p: any) => {
      setParsed(true);
      setF({ ...f, title: f.title || p.title, required_skills: p.required_skills, preferred_skills: p.preferred_skills, min_years_experience: p.min_years_experience, education_level: p.education_level });
    },
  });
  const save = useMutation({
    mutationFn: () => api("/jobs", { method: "POST", body: JSON.stringify(f) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["myjobs"] }); qc.invalidateQueries({ queryKey: ["stats"] }); onDone(); },
  });
  const csv = (a: string[]) => a.join(", ");
  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const descShort = f.description.trim().length < 20;

  return (
    <Panel className="page-in mb-10 grid gap-5 p-6 shadow-depth-lg">
      <div className="flex items-center justify-between"><h2 className="font-semibold">New job</h2><Button size="sm" variant="quiet" onClick={onDone}>Cancel</Button></div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Company"><Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
        <Field label="Location"><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
      </div>
      <Field label="Job description" hint="Paste the full posting. Headings like Requirements and Nice to have help us separate required from preferred skills.">
        <Textarea rows={9} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      <div><Button variant="secondary" onClick={() => parse.mutate()} disabled={descShort || parse.isPending}><MagicWand size={16} />{parse.isPending ? "Reading..." : "Extract requirements"}</Button></div>
      {(parsed || f.required_skills.length > 0) && (
        <div className="grid gap-4 border-t border-line pt-5 md:grid-cols-2">
          <Field label="Required skills" hint="Comma separated. Count double in the score."><Input value={csv(f.required_skills)} onChange={(e) => setF({ ...f, required_skills: list(e.target.value) })} /></Field>
          <Field label="Preferred skills" hint="Comma separated."><Input value={csv(f.preferred_skills)} onChange={(e) => setF({ ...f, preferred_skills: list(e.target.value) })} /></Field>
          <Field label="Minimum years of experience"><Input type="number" min={0} value={f.min_years_experience} onChange={(e) => setF({ ...f, min_years_experience: Number(e.target.value) })} /></Field>
          <Field label="Education">
            <Select value={f.education_level} onChange={(e) => setF({ ...f, education_level: Number(e.target.value) })}>
              {EDU_LABELS.map((l, i) => <option key={l} value={i}>{l}</option>)}
            </Select>
          </Field>
        </div>
      )}
      <ErrorNote error={parse.error || save.error} />
      <div className="flex justify-end"><Button onClick={() => save.mutate()} disabled={!f.title || descShort || save.isPending}>{save.isPending ? "Publishing..." : "Publish job"}</Button></div>
    </Panel>
  );
}
