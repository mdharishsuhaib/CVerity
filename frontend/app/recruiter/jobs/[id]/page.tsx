"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CaretDown, DownloadSimple, Eye, EyeSlash, Trash, UploadSimple, X } from "@phosphor-icons/react";
import { API_URL, api, download } from "@/lib/api";
import { cn, scoreColor } from "@/lib/utils";
import { RequireAuth } from "@/components/providers";
import { Button, Empty, ErrorNote, Field, Input, ListSkeleton, Score, Select, Tag, Textarea } from "@/components/ui";
import { TiltCard } from "@/components/landing/three-d";
import { MatchBreakdown } from "@/components/match";

export default function Page() {
  return <RequireAuth role="recruiter"><JobDetail /></RequireAuth>;
}

function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [flt, setFlt] = useState({ min_score: 0, min_years: 0, skills: "", stage: "" });
  const [sel, setSel] = useState<number[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [compare, setCompare] = useState(false);
  const [blind, setBlind] = useBlindMode();

  const { data: job } = useQuery({ queryKey: ["job", id], queryFn: () => api(`/jobs/${id}`) });
  const qs = new URLSearchParams({ min_score: String(flt.min_score || 0), min_years: String(flt.min_years || 0), skills: flt.skills, ...(flt.stage ? { stage: flt.stage } : {}) }).toString();
  const { data, isLoading, error } = useQuery({
    queryKey: ["cands", id, qs], queryFn: () => api(`/match/job/${id}/candidates?${qs}`),
    // Fast while resumes are being analyzed; otherwise every 15 seconds so new applicants appear on their own.
    refetchInterval: (q) => (q.state.data?.items?.some((i: any) => !i.match && i.resume.status !== "failed") ? 2000 : 15_000),
    refetchOnWindowFocus: true,
  });
  const pipe = useQuery({ queryKey: ["pipeline", id], queryFn: () => api<{ stages: string[]; counts: Record<string, number> }>(`/recruiter/jobs/${id}/pipeline`), refetchInterval: 15_000 });
  const setCand = useMutation({
    mutationFn: ({ rid, ...body }: { rid: number; stage?: string; notes?: string }) =>
      api(`/recruiter/jobs/${id}/candidates/${rid}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cands", id] }); qc.invalidateQueries({ queryKey: ["pipeline", id] }); qc.invalidateQueries({ queryKey: ["stats"] }); },
  });
  const up = useMutation({
    mutationFn: (files: File[]) => { const fd = new FormData(); files.forEach((f) => fd.append("files", f)); return api(`/recruiter/jobs/${id}/resumes`, { method: "POST", form: fd }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cands", id] }); qc.invalidateQueries({ queryKey: ["stats"] }); qc.invalidateQueries({ queryKey: ["pipeline", id] }); },
  });
  // Blind screening: hide names and file names (which often contain names) so candidates are judged on skills.
  const nameOf = (r: any) => (blind ? `Candidate ${r.id}` : r.candidate_name);
  const items: any[] = data?.items ?? [];
  const visibleIds = items.map((i) => i.resume.id as number);
  // Selection drives bulk actions (any number) and Compare (the first 5 scored ones).
  const selected = sel.filter((rid) => visibleIds.includes(rid));
  const compareIds = items.filter((i) => i.match && selected.includes(i.resume.id)).map((i) => i.resume.id as number).slice(0, 5);
  const allOn = visibleIds.length > 0 && selected.length === visibleIds.length;
  const someOn = selected.length > 0 && !allOn;
  const cmp = useQuery({ queryKey: ["cmp", id, compareIds], enabled: compare && compareIds.length > 1, queryFn: () => api(`/recruiter/jobs/${id}/compare?ids=${compareIds.join(",")}`) });
  const toggle = (rid: number) => setSel((s) => (s.includes(rid) ? s.filter((x) => x !== rid) : [...s, rid]));
  const toggleAll = () => setSel(allOn ? [] : visibleIds);
  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["cands", id] }); qc.invalidateQueries({ queryKey: ["pipeline", id] });
    qc.invalidateQueries({ queryKey: ["stats"] }); qc.invalidateQueries({ queryKey: ["cmp", id] });
  };
  const [bulkStage, setBulkStage] = useState("shortlisted");
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [confirmOne, setConfirmOne] = useState<number | null>(null);
  const stageMany = useMutation({
    mutationFn: (body: { resume_ids: number[]; stage: string }) =>
      api<{ updated: number; stage: string }>(`/recruiter/jobs/${id}/candidates/bulk-stage`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: refreshAll,
  });
  const removeMany = useMutation({
    mutationFn: (ids: number[]) => api<{ deleted: number }>(`/recruiter/jobs/${id}/candidates/bulk-delete`, { method: "POST", body: JSON.stringify({ resume_ids: ids }) }),
    onSuccess: (_r, ids) => { setSel((s) => s.filter((x) => !ids.includes(x))); setConfirmBulk(false); setCompare(false); refreshAll(); },
  });
  const removeOne = useMutation({
    mutationFn: (rid: number) => api(`/recruiter/jobs/${id}/candidates/${rid}`, { method: "DELETE" }),
    onSuccess: (_r, rid) => { setSel((s) => s.filter((x) => x !== rid)); setConfirmOne(null); if (open === rid) setOpen(null); refreshAll(); },
  });
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = someOn; }, [someOn]);
  useEffect(() => { if (!selected.length) setConfirmBulk(false); }, [selected.length]);
  const processing = data?.items?.filter((i: any) => !i.match && i.resume.status !== "failed").length ?? 0;

  // Real-time progress over Server-Sent Events while any candidate is still being analyzed.
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!processing && !up.isPending) return;
    if (typeof EventSource === "undefined") return;
    // Same-origin EventSource sends the HttpOnly session cookie automatically: no token in the URL (or in logs).
    const es = new EventSource(`${API_URL}/recruiter/jobs/${id}/events`, { withCredentials: true });
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

      <section className="grid gap-4 rounded-2xl bg-surface p-4 shadow-depth md:grid-cols-[auto_1fr] md:items-end md:p-5">
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" multiple accept=".pdf,.docx,.txt" hidden onChange={(e) => {
            // Copy the files first: clearing the input (so the same files can be picked again) empties its live FileList,
            // and the upload runs a moment later, which would otherwise send no files at all.
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) up.mutate(files);
          }} />
          <Button onClick={() => input.current?.click()} disabled={up.isPending}><UploadSimple size={16} weight="bold" />{up.isPending ? "Uploading..." : "Add resumes"}</Button>
          <Button variant="secondary" onClick={() => download(`/recruiter/jobs/${id}/export`, `candidates_${id}.csv`)}><DownloadSimple size={16} />Export CSV</Button>
          <Button variant="secondary" disabled={compareIds.length < 2} onClick={() => setCompare(!compare)}
            title="Select 2 to 5 scored candidates to compare them side by side">{compare ? "Close" : `Compare ${compareIds.length || ""}`.trim()}</Button>
          <Button variant={blind ? "primary" : "secondary"} aria-pressed={blind} onClick={() => setBlind(!blind)}
            title="Hide candidate names and file names so you screen on skills and experience only">
            {blind ? <EyeSlash size={16} /> : <Eye size={16} />}{blind ? "Blind: on" : "Blind mode"}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:ml-auto md:grid-cols-[6rem_6rem_14rem]">
          <Field label="Min score"><Input type="number" min={0} max={100} value={flt.min_score} onChange={(e) => setFlt({ ...flt, min_score: Number(e.target.value) })} /></Field>
          <Field label="Min years"><Input type="number" min={0} value={flt.min_years} onChange={(e) => setFlt({ ...flt, min_years: Number(e.target.value) })} /></Field>
          <Field label="Must have" className="col-span-2 md:col-span-1"><Input placeholder="python, aws" value={flt.skills} onChange={(e) => setFlt({ ...flt, skills: e.target.value })} /></Field>
        </div>
      </section>

      {pipe.data && (
        <nav aria-label="Hiring stage" className="-mt-4 flex flex-wrap gap-1.5">
          {[["", "All"], ...pipe.data.stages.map((s) => [s, STAGE_LABELS[s] ?? s])].map(([s, label]) => {
            const n = s ? pipe.data!.counts[s] ?? 0 : Object.values(pipe.data!.counts).reduce((a, b) => a + b, 0);
            const on = flt.stage === s;
            return (
              <button key={s || "all"} onClick={() => setFlt({ ...flt, stage: s })} aria-pressed={on}
                className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition",
                  on ? "bg-gradient-to-b from-ink to-ink/85 text-bg shadow-[inset_0_1px_0_rgb(255_255_255/0.15),0_6px_14px_-8px_rgb(var(--shadow)/0.8)]" : "bg-surface text-muted shadow-key hover:-translate-y-px hover:text-ink")}>
                {label}<span className={cn("font-mono text-xs tabular", on ? "text-bg/70" : "text-subtle")}>{n}</span>
              </button>
            );
          })}
        </nav>
      )}

      <ErrorNote error={up.error || error || setCand.error || stageMany.error || removeMany.error || removeOne.error} />
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
            <TiltCard key={c.resume.id} as="article" max={5} className="fade-up h-full rounded-xl bg-surface p-5 shadow-depth-lg">
              <div className="relative z-[2] [transform:translateZ(30px)]"><Score score={c.match.score} size="md" label="match" /></div>
              <h3 className="relative z-[2] mt-3 truncate text-center font-medium [transform:translateZ(20px)]">{nameOf(c.resume)}</h3>
              <p className="relative z-[2] text-center text-xs text-subtle">{c.resume.profile.years_experience} yrs, {c.resume.profile.education_label}, ATS {Math.round(c.resume.ats.score)}</p>
              <dl className="relative z-[2] mt-4 grid gap-1.5 text-sm [transform:translateZ(10px)]">
                {Object.entries(c.match.components).map(([k, v]: any) => (
                  <div key={k} className="flex justify-between"><dt className="capitalize text-muted">{k}</dt><dd className={cn("font-mono tabular", scoreColor(v))}>{v == null ? "n/a" : Math.round(v)}</dd></div>
                ))}
              </dl>
              {c.match.missing_required.length > 0 && (
                <div className="relative z-[2] mt-4 border-t border-line pt-3">
                  <p className="mb-1.5 text-xs text-bad">Missing</p>
                  <div className="flex flex-wrap gap-1">{c.match.missing_required.map((s: string) => <Tag key={s} tone="bad">{s}</Tag>)}</div>
                </div>
              )}
            </TiltCard>
          ))}
        </section>
      )}

      {isLoading ? <ListSkeleton rows={4} /> : data?.items.length === 0 && flt.stage ? (
        <p className="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">No candidates in the {STAGE_LABELS[flt.stage]?.toLowerCase()} stage.</p>
      ) : data?.items.length === 0 ? (
        <Empty title="No candidates yet" body="Upload up to 100 resumes at once. Each one is scored against this job in the background." />
      ) : (
        <div className="grid gap-3">
        {selected.length > 0 && (
          <div role="region" aria-label="Bulk actions" className="fade-up flex flex-wrap items-center gap-2 rounded-xl bg-surface px-4 py-3 shadow-depth">
            <p className="mr-1 text-sm font-medium"><span className="font-mono tabular">{selected.length}</span> selected</p>
            <label className="flex items-center gap-2 text-sm text-muted">Move to
              <Select className="h-8 w-36 text-xs" value={bulkStage} onChange={(e) => setBulkStage(e.target.value)} aria-label="Stage for selected candidates">
                {(pipe.data?.stages ?? Object.keys(STAGE_LABELS)).map((s) => <option key={s} value={s}>{STAGE_LABELS[s] ?? s}</option>)}
              </Select>
            </label>
            <Button size="sm" disabled={stageMany.isPending} onClick={() => stageMany.mutate({ resume_ids: selected, stage: bulkStage })}>
              {stageMany.isPending ? "Updating..." : "Apply stage"}
            </Button>
            {confirmBulk ? (
              <span className="inline-flex items-center gap-1.5">
                <Button size="sm" variant="danger" disabled={removeMany.isPending} onClick={() => removeMany.mutate(selected)}>
                  <Trash size={14} weight="bold" />{removeMany.isPending ? "Deleting..." : `Delete ${selected.length}`}
                </Button>
                <Button size="sm" variant="quiet" onClick={() => setConfirmBulk(false)}>Cancel</Button>
              </span>
            ) : (
              <Button size="sm" variant="secondary" className="text-bad" onClick={() => setConfirmBulk(true)}><Trash size={14} />Delete</Button>
            )}
            <Button size="sm" variant="quiet" className="ml-auto" onClick={() => setSel([])}><X size={14} />Clear</Button>
            {stageMany.isSuccess && !stageMany.isPending && (
              <p className="w-full text-xs text-subtle" aria-live="polite">Moved {stageMany.data.updated} to {STAGE_LABELS[stageMany.data.stage]}. Applicants&apos; boards update too.</p>
            )}
          </div>
        )}
        <div className="relative overflow-x-auto rounded-2xl bg-surface shadow-depth-lg">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-sunken/60 text-left text-xs text-subtle">
              <tr className="border-b border-line">
                <th className="w-10 p-3">
                  <input ref={selectAllRef} type="checkbox" aria-label={allOn ? "Clear selection" : "Select all candidates"} title="Select all"
                    className="h-4 w-4 accent-[rgb(var(--accent))]" checked={allOn} onChange={toggleAll} />
                </th>
                <th className="w-10 py-3 font-medium">#</th><th className="py-3 font-medium">Candidate</th><th className="py-3 font-medium">Match</th>
                <th className="py-3 font-medium">Stage</th>
                <th className="py-3 font-medium">Experience</th><th className="py-3 font-medium">ATS</th><th className="py-3 pr-3 font-medium">Missing required</th>
                <th className="w-24"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it: any) => {
                const isOpen = open === it.resume.id;
                const on = selected.includes(it.resume.id);
                return (
                  <Fragment key={it.resume.id}>
                    <tr className={cn("border-b border-line/60 transition-colors last:border-0", it.match && "cursor-pointer hover:bg-sunken/60", (isOpen || on) && "bg-sunken/60")}
                      onClick={() => it.match && setOpen(isOpen ? null : it.resume.id)}>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Select ${nameOf(it.resume)}`} className="h-4 w-4 accent-[rgb(var(--accent))]" checked={on} onChange={() => toggle(it.resume.id)} />
                      </td>
                      <td className="font-mono tabular text-subtle">{it.rank ?? ""}</td>
                      <td className="py-3">
                        <p className="font-medium">{nameOf(it.resume)}</p>
                        <p className="text-xs text-subtle">{it.resume.titles?.[0] || (blind ? "" : it.resume.filename)}{it.resume.notes ? <span className="ml-1.5 text-accent-ink" title="Has notes">· notes</span> : null}</p>
                      </td>
                      <td>{it.match ? <span className={cn("font-mono text-base font-semibold tabular", scoreColor(it.match.score))}>{Math.round(it.match.score)}</span>
                        : <Tag tone={it.resume.status === "failed" ? "bad" : "warn"}>{it.resume.status === "failed" ? "Failed" : "Scoring"}</Tag>}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <label><span className="sr-only">Stage for {nameOf(it.resume)}</span>
                          <Select className="h-8 w-32 text-xs" value={it.resume.stage} disabled={it.resume.status === "failed"}
                            onChange={(e) => setCand.mutate({ rid: it.resume.id, stage: e.target.value })}>
                            {(pipe.data?.stages ?? Object.keys(STAGE_LABELS)).map((s) => <option key={s} value={s}>{STAGE_LABELS[s] ?? s}</option>)}
                          </Select>
                        </label>
                      </td>
                      <td className="font-mono tabular text-muted">{it.resume.years_experience ?? "-"} yrs</td>
                      <td className="font-mono tabular text-muted">{it.resume.ats_score != null ? Math.round(it.resume.ats_score) : "-"}</td>
                      <td className="max-w-[16rem] truncate pr-3 text-bad">{it.match?.missing_required.join(", ") || <span className="text-subtle">{it.resume.error || "None"}</span>}</td>
                      <td className="pr-3 text-subtle" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {confirmOne === it.resume.id ? (
                            <>
                              <Button size="sm" variant="danger" className="h-7 px-2 text-xs" disabled={removeOne.isPending}
                                onClick={() => removeOne.mutate(it.resume.id)}>{removeOne.isPending ? "..." : "Delete"}</Button>
                              <button className="rounded p-1 text-subtle hover:bg-sunken hover:text-ink" aria-label="Cancel" onClick={() => setConfirmOne(null)}><X size={14} /></button>
                            </>
                          ) : (
                            <button className="rounded-md p-1.5 text-subtle transition hover:bg-bad-soft hover:text-bad" title="Delete candidate"
                              aria-label={`Delete ${nameOf(it.resume)}`} onClick={() => setConfirmOne(it.resume.id)}><Trash size={15} /></button>
                          )}
                          {it.match && <button className="rounded-md p-1.5 hover:bg-sunken hover:text-ink" aria-label={isOpen ? "Hide breakdown" : "Show breakdown"}
                            aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : it.resume.id)}>
                            <CaretDown size={14} className={cn("transition-transform", isOpen && "rotate-180")} /></button>}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-line/60">
                        <td colSpan={9} className="bg-sunken/40 p-6">
                          <MatchBreakdown m={it.match} />
                          <CandidateNotes key={it.resume.id} initial={it.resume.notes} saving={setCand.isPending}
                            onSave={(notes) => setCand.mutate({ rid: it.resume.id, notes })} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </div>
  );
}

const STAGE_LABELS: Record<string, string> = { new: "New", shortlisted: "Shortlisted", interview: "Interview", offer: "Offer", hired: "Hired", rejected: "Rejected" };

/** Blind screening preference, remembered on this device. */
function useBlindMode(): [boolean, (v: boolean) => void] {
  const [blind, setBlindState] = useState(false);
  useEffect(() => { setBlindState(localStorage.getItem("cverity.blind") === "1"); }, []);
  const setBlind = (v: boolean) => {
    setBlindState(v);
    localStorage.setItem("cverity.blind", v ? "1" : "0");
  };
  return [blind, setBlind];
}

function CandidateNotes({ initial, onSave, saving }: { initial: string; onSave: (notes: string) => void; saving: boolean }) {
  const [notes, setNotes] = useState(initial);
  const dirty = notes !== initial;
  return (
    <div className="mt-6 grid gap-2 border-t border-line pt-5">
      <label htmlFor="cand-notes" className="text-sm font-medium">Private notes</label>
      <Textarea id="cand-notes" rows={3} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)}
        placeholder="Phone screen feedback, salary expectations, availability..." />
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!dirty || saving} onClick={() => onSave(notes)}>{saving ? "Saving..." : "Save"}</Button>
        {!dirty && initial && <span className="text-xs text-subtle">Saved</span>}
      </div>
    </div>
  );
}
