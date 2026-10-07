"use client";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MagicWand, Plus } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { EDU_LABELS } from "@/lib/utils";
import { RequireAuth } from "@/components/providers";
import { Button, ErrorNote, Field, Input, ListSkeleton, PageHeader, Panel, Select, Tag, Textarea } from "@/components/ui";

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

      <dl className="mb-10 grid grid-cols-2 gap-x-8 gap-y-4 border-y border-line py-5 md:grid-cols-4">
        {[["Open jobs", stats?.jobs], ["Candidates", stats?.candidates], ["Average match", stats?.avg_score], ["Scored 65 or higher", stats?.strong_matches]].map(([l, v]) => (
          <div key={l as string}><dt className="text-xs text-subtle">{l}</dt><dd className="mt-1 font-mono text-2xl font-semibold tabular">{v ?? "-"}</dd></div>
        ))}
      </dl>

      {showNew && <NewJob onDone={() => setShowNew(false)} />}
      <ErrorNote error={error} />
      {isLoading ? <ListSkeleton rows={4} /> : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface ring-1 ring-line/70">
          {jobs?.items.map((j: any) => (
            <li key={j.id}>
              <Link href={`/recruiter/jobs/${j.id}`} className="grid gap-2 p-5 transition-colors hover:bg-sunken/60 md:grid-cols-[1fr_auto] md:items-center">
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
          {jobs?.items.length === 0 && <li className="p-10 text-center text-sm text-muted">No jobs yet. Create one to start ranking candidates.</li>}
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
    <Panel className="mb-10 grid gap-5 p-6">
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
