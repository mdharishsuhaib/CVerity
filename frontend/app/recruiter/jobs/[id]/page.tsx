"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CaretDown, DownloadSimple, UploadSimple } from "@phosphor-icons/react";
import { API_URL, api, download, getToken } from "@/lib/api";
import { cn, scoreColor } from "@/lib/utils";
import { RequireAuth } from "@/components/providers";
import { Button, ErrorNote, Field, Input, ListSkeleton, Panel, Tag } from "@/components/ui";
import { MatchBreakdown } from "@/components/match";

export default function Page() {
  return <RequireAuth role="recruiter"><JobDetail /></RequireAuth>;
}

function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [flt, setFlt] = useState({ min_score: 0, min_years: 0, skills: "" });
  const [sel, setSel] = useState<number[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [compare, setCompare] = useState(false);

  const { data: job } = useQuery({ queryKey: ["job", id], queryFn: () => api(`/jobs/${id}`) });
  const qs = new URLSearchParams({ min_score: String(flt.min_score || 0), min_years: String(flt.min_years || 0), skills: flt.skills }).toString();
  const { data, isLoading, error } = useQuery({
    queryKey: ["cands", id, qs], queryFn: () => api(`/match/job/${id}/candidates?${qs}`),
    refetchInterval: (q) => (q.state.data?.items?.some((i: any) => !i.match && i.resume.status !== "failed") ? 2000 : false),
  });
  const up = useMutation({
    mutationFn: (files: FileList) => { const fd = new FormData(); Array.from(files).forEach((f) => fd.append("files", f)); return api(`/recruiter/jobs/${id}/resumes`, { method: "POST", form: fd }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cands", id] }); qc.invalidateQueries({ queryKey: ["stats"] }); },
  });
  const cmp = useQuery({ queryKey: ["cmp", id, sel], enabled: compare && sel.length > 1, queryFn: () => api(`/recruiter/jobs/${id}/compare?ids=${sel.join(",")}`) });
  const toggle = (rid: number) => setSel((s) => (s.includes(rid) ? s.filter((x) => x !== rid) : s.length < 5 ? [...s, rid] : s));
  const processing = data?.items?.filter((i: any) => !i.match && i.resume.status !== "failed").length ?? 0;

  // Real-time progress over Server-Sent Events while any candidate is still being analyzed.
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!processing && !up.isPending) return;
    const token = getToken();
    if (!token || typeof EventSource === "undefined") return;
    const es = new EventSource(`${API_URL}/recruiter/jobs/${id}/events?token=${encodeURIComponent(token)}`);
    es.addEventListener("progress", () => {
      setLive(true);
      qc.invalidateQueries({ queryKey: ["cands", id] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    });
    es.onerror = () => setLive(false);
    return () => { es.close(); setLive(false); };
  }, [processing > 0, up.isPending, id, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid gap-8">
      <Link href="/recruiter" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted transition hover:text-ink"><ArrowLeft size={14} weight="bold" />Jobs</Link>

      {job && (
        <header>
          <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">{job.title}</h1>
          <p className="mt-1 text-muted">{[job.company, job.location, job.min_years_experience ? `${job.min_years_experience}+ yrs` : null].filter(Boolean).join(", ")}</p>
          <div className="mt-3 flex flex-wrap gap-1">
            {job.required_skills.map((s: string) => <Tag key={s} tone="accent">{s}</Tag>)}
            {job.preferred_skills.map((s: string) => <Tag key={s}>{s}</Tag>)}
          </div>
        </header>
      )}

      <section className="grid gap-4 rounded-xl bg-sunken p-4 md:grid-cols-[auto_1fr] md:items-end md:p-5">
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" multiple accept=".pdf,.docx,.txt" hidden onChange={(e) => { if (e.target.files?.length) up.mutate(e.target.files); e.target.value = ""; }} />
          <Button onClick={() => input.current?.click()} disabled={up.isPending}><UploadSimple size={16} weight="bold" />{up.isPending ? "Uploading..." : "Upload resumes"}</Button>
          <Button variant="secondary" onClick={() => download(`/recruiter/jobs/${id}/export.csv`, `candidates_${id}.csv`)}><DownloadSimple size={16} />CSV</Button>
          <Button variant="secondary" disabled={sel.length < 2} onClick={() => setCompare(!compare)}>{compare ? "Close comparison" : `Compare ${sel.length || ""}`.trim()}</Button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:ml-auto md:grid-cols-[6rem_6rem_14rem]">
          <Field label="Min score"><Input type="number" min={0} max={100} value={flt.min_score} onChange={(e) => setFlt({ ...flt, min_score: Number(e.target.value) })} /></Field>
          <Field label="Min years"><Input type="number" min={0} value={flt.min_years} onChange={(e) => setFlt({ ...flt, min_years: Number(e.target.value) })} /></Field>
          <Field label="Must have" className="col-span-2 md:col-span-1"><Input placeholder="python, aws" value={flt.skills} onChange={(e) => setFlt({ ...flt, skills: e.target.value })} /></Field>
        </div>
      </section>

      <ErrorNote error={up.error || error} />
      {up.data?.rejected?.length > 0 && <p className="text-sm text-warn">Skipped {up.data.rejected.map((r: any) => r.filename).join(", ")}: unsupported, empty or over 10 MB.</p>}
      {processing > 0 && (
        <p className="inline-flex items-center gap-2 text-sm text-muted" aria-live="polite">
          <span className={cn("h-2 w-2 rounded-full", live ? "animate-pulse bg-accent" : "bg-subtle")} aria-hidden />
          Scoring {processing} resume{processing > 1 ? "s" : ""}. {live ? "Live updates on." : "The list updates on its own."}
        </p>
      )}

      {compare && cmp.data && (
        <section aria-label="Comparison" className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cmp.data.candidates.length}, minmax(0, 1fr))` }}>
          {cmp.data.candidates.map((c: any) => (
            <Panel key={c.resume.id} as="article">
              <p className={cn("font-mono text-3xl font-semibold tabular", scoreColor(c.match.score))}>{Math.round(c.match.score)}</p>
              <h3 className="mt-1 truncate font-medium">{c.resume.candidate_name}</h3>
              <p className="text-xs text-subtle">{c.resume.profile.years_experience} yrs, {c.resume.profile.education_label}, ATS {Math.round(c.resume.ats.score)}</p>
              <dl className="mt-4 grid gap-1.5 text-sm">
                {Object.entries(c.match.components).map(([k, v]: any) => (
                  <div key={k} className="flex justify-between"><dt className="capitalize text-muted">{k}</dt><dd className={cn("font-mono tabular", scoreColor(v))}>{v == null ? "n/a" : Math.round(v)}</dd></div>
                ))}
              </dl>
              {c.match.missing_required.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="mb-1.5 text-xs text-bad">Missing</p>
                  <div className="flex flex-wrap gap-1">{c.match.missing_required.map((s: string) => <Tag key={s} tone="bad">{s}</Tag>)}</div>
                </div>
              )}
            </Panel>
          ))}
        </section>
      )}

      {isLoading ? <ListSkeleton rows={4} /> : data?.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-14 text-center">
          <p className="font-medium">No candidates yet</p>
          <p className="mx-auto mt-1 max-w-[42ch] text-sm text-muted">Upload up to 100 resumes at once. Each one is scored against this job in the background.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-surface ring-1 ring-line/70">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-subtle">
              <tr className="border-b border-line">
                <th className="w-10 p-3"><span className="sr-only">Select</span></th>
                <th className="w-10 py-3 font-medium">#</th><th className="py-3 font-medium">Candidate</th><th className="py-3 font-medium">Match</th>
                <th className="py-3 font-medium">Experience</th><th className="py-3 font-medium">ATS</th><th className="py-3 pr-3 font-medium">Missing required</th><th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {data?.items.map((it: any) => {
                const isOpen = open === it.resume.id;
                return (
                  <Fragment key={it.resume.id}>
                    <tr className={cn("border-b border-line/60 transition-colors last:border-0", it.match && "cursor-pointer hover:bg-sunken/60", isOpen && "bg-sunken/60")}
                      onClick={() => it.match && setOpen(isOpen ? null : it.resume.id)}>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Select ${it.resume.candidate_name}`} className="h-4 w-4 accent-[rgb(var(--accent))]" disabled={!it.match} checked={sel.includes(it.resume.id)} onChange={() => toggle(it.resume.id)} />
                      </td>
                      <td className="font-mono tabular text-subtle">{it.rank ?? ""}</td>
                      <td className="py-3"><p className="font-medium">{it.resume.candidate_name}</p><p className="text-xs text-subtle">{it.resume.titles?.[0] || it.resume.filename}</p></td>
                      <td>{it.match ? <span className={cn("font-mono text-base font-semibold tabular", scoreColor(it.match.score))}>{Math.round(it.match.score)}</span>
                        : <Tag tone={it.resume.status === "failed" ? "bad" : "warn"}>{it.resume.status === "failed" ? "Failed" : "Scoring"}</Tag>}</td>
                      <td className="font-mono tabular text-muted">{it.resume.years_experience ?? "-"} yrs</td>
                      <td className="font-mono tabular text-muted">{it.resume.ats_score != null ? Math.round(it.resume.ats_score) : "-"}</td>
                      <td className="max-w-[16rem] truncate pr-3 text-bad">{it.match?.missing_required.join(", ") || <span className="text-subtle">{it.resume.error || "None"}</span>}</td>
                      <td className="pr-3 text-subtle">{it.match && <CaretDown size={14} className={cn("transition-transform", isOpen && "rotate-180")} />}</td>
                    </tr>
                    {isOpen && <tr className="border-b border-line/60"><td colSpan={8} className="bg-sunken/40 p-6"><MatchBreakdown m={it.match} /></td></tr>}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
