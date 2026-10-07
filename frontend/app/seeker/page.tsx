"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileArrowUp } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { RequireAuth } from "@/components/providers";
import { Button, ErrorNote, ListSkeleton, PageHeader, Panel, Score, Tag } from "@/components/ui";

export default function SeekerDashboard() {
  return <RequireAuth role="seeker"><Inner /></RequireAuth>;
}

function Inner() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["resumes"], queryFn: () => api<any[]>("/resumes") });
  const upload = useMutation({
    mutationFn: (file: File) => { const fd = new FormData(); fd.append("file", file); return api("/resumes", { method: "POST", form: fd }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resumes"] }),
  });
  const del = useMutation({
    mutationFn: (id: number) => api(`/resumes/${id}`, { method: "DELETE" }),
    onSuccess: () => { setConfirming(null); qc.invalidateQueries({ queryKey: ["resumes"] }); },
  });
  const onFile = (f?: File | null) => f && upload.mutate(f);

  return (
    <>
      <PageHeader title="Resumes" sub="Each upload gets an ATS report and a ranked list of matching jobs." />
      <div className="grid gap-8 lg:grid-cols-[20rem_1fr]">
        <aside>
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
            disabled={upload.isPending}
            className={cn("grid w-full place-items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition",
              drag ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-accent/50")}
          >
            <FileArrowUp size={28} weight="duotone" className="text-accent" />
            <span className="font-medium">{upload.isPending ? "Reading your resume..." : "Drop a resume or browse"}</span>
            <span className="text-xs text-subtle">PDF, DOCX or TXT, up to 10 MB</span>
          </button>
          <input ref={input} type="file" accept=".pdf,.docx,.txt" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          <div className="mt-3"><ErrorNote error={upload.error} /></div>
        </aside>

        <div>
          <ErrorNote error={error} />
          {isLoading ? <ListSkeleton /> : data?.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line px-6 py-14 text-center">
              <p className="font-medium">No resumes yet</p>
              <p className="mx-auto mt-1 max-w-[40ch] text-sm text-muted">Upload one on the left. The report takes a few seconds.</p>
            </div>
          ) : (
            <ul className="grid gap-3">
              {data?.map((r) => (
                <li key={r.id}>
                  <Panel as="article" className="flex flex-wrap items-center gap-5 md:flex-nowrap">
                    <Score score={r.ats_score} size="sm" label="ATS" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/seeker/resumes/${r.id}`} className="block truncate font-medium hover:text-accent">{r.filename}</Link>
                      <p className="truncate text-sm text-subtle">
                        {r.titles?.[0] || r.candidate_name}{r.years_experience ? `, ${r.years_experience} yrs` : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">{r.top_skills.slice(0, 6).map((s: string) => <Tag key={s}>{s}</Tag>)}</div>
                    </div>
                    {confirming === r.id ? (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted">Delete this resume?</span>
                        <Button size="sm" variant="danger" onClick={() => del.mutate(r.id)} disabled={del.isPending}>Delete</Button>
                        <Button size="sm" variant="quiet" onClick={() => setConfirming(null)}>Keep</Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Link href={`/seeker/resumes/${r.id}?tab=matches`}><Button size="sm">Job matches</Button></Link>
                        <Link href={`/seeker/resumes/${r.id}`}><Button size="sm" variant="secondary">Report</Button></Link>
                        <Button size="sm" variant="quiet" onClick={() => setConfirming(r.id)}>Delete</Button>
                      </div>
                    )}
                  </Panel>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
