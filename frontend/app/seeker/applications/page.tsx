"use client";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NotePencil, Trash } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { cn, scoreColor } from "@/lib/utils";
import { RequireAuth } from "@/components/providers";
import { Button, Empty, ErrorNote, ListSkeleton, PageHeader, Panel, Select, Textarea } from "@/components/ui";

export default function Page() {
  return <RequireAuth role="seeker"><Applications /></RequireAuth>;
}

const LABELS: Record<string, string> = { saved: "Saved", applied: "Applied", interviewing: "Interviewing", offer: "Offer", rejected: "Closed" };
const DOT: Record<string, string> = { saved: "bg-subtle", applied: "bg-accent/60", interviewing: "bg-warn", offer: "bg-accent", rejected: "bg-bad/70" };

type App = {
  id: number; status: string; notes: string; resume_id: number | null; match_score: number | null;
  applied_at: string | null; updated_at: string | null;
  job: { id: number; title: string; company: string; location: string };
};

function Applications() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["applications"], queryFn: () => api<{ statuses: string[]; items: App[] }>("/applications") });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: number; status?: string; notes?: string }) => api(`/applications/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["applications"] }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/applications/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["applications"] }),
  });
  const statuses = data?.statuses ?? Object.keys(LABELS);
  const items = data?.items ?? [];
  const active = items.filter((a) => a.status !== "rejected" && a.status !== "saved").length;

  return (
    <>
      <PageHeader title="Applications" sub={items.length ? `${items.length} tracked, ${active} in progress.` : "Track the jobs you're going after, from saved to offer."} />
      <ErrorNote error={error || update.error || remove.error} />
      {isLoading ? <ListSkeleton /> : items.length === 0 ? (
        <Empty title="Nothing tracked yet" body="Open a resume's job matches and press Track on the roles you want to follow."
          action={<Link href="/seeker"><Button>Go to resumes</Button></Link>} />
      ) : (
        <div className="relative -mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
          <div className="grid min-w-[60rem] grid-cols-5 gap-4">
            {statuses.map((s) => {
              const col = items.filter((a) => a.status === s);
              return (
                <section key={s} aria-label={LABELS[s]} className="grid content-start gap-3 rounded-2xl bg-sunken/70 p-3 shadow-[inset_0_1px_3px_rgb(var(--shadow)/0.1)]">
                  <h2 className="flex items-center gap-2 px-1 text-sm font-medium">
                    <span className={cn("h-2 w-2 rounded-full", DOT[s])} aria-hidden />{LABELS[s]}
                    <span className="ml-auto font-mono text-xs tabular text-subtle">{col.length}</span>
                  </h2>
                  {col.map((a) => <Card key={a.id} a={a} statuses={statuses} onChange={(b) => update.mutate({ id: a.id, ...b })} onDelete={() => remove.mutate(a.id)} />)}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function Card({ a, statuses, onChange, onDelete }: { a: App; statuses: string[]; onChange: (b: { status?: string; notes?: string }) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(a.notes);
  const [confirm, setConfirm] = useState(false);
  return (
    <Panel as="article" className="lift grid gap-2 p-3.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium leading-snug">
            {a.resume_id ? <Link href={`/seeker/resumes/${a.resume_id}?tab=matches`} className="hover:text-accent">{a.job.title}</Link> : a.job.title}
          </h3>
          <p className="truncate text-xs text-subtle">{[a.job.company, a.job.location].filter(Boolean).join(", ")}</p>
        </div>
        {a.match_score != null && <span className={cn("font-mono text-sm font-semibold tabular", scoreColor(a.match_score))} title="Match score">{Math.round(a.match_score)}</span>}
      </div>
      {a.applied_at && <p className="text-xs text-subtle">Applied {new Date(a.applied_at).toLocaleDateString()}</p>}
      {editing ? (
        <div className="grid gap-2">
          <Textarea rows={3} value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} placeholder="Recruiter name, salary, next steps..." aria-label="Notes" autoFocus />
          <div className="flex gap-1.5">
            <Button size="sm" onClick={() => { onChange({ notes }); setEditing(false); }}>Save</Button>
            <Button size="sm" variant="quiet" onClick={() => { setNotes(a.notes); setEditing(false); }}>Cancel</Button>
          </div>
        </div>
      ) : a.notes ? (
        <p className="line-clamp-3 whitespace-pre-line text-xs text-muted">{a.notes}</p>
      ) : null}
      <div className="flex items-center gap-1 pt-1">
        <label className="flex-1"><span className="sr-only">Status</span>
          <Select className="h-8 text-xs" value={a.status} onChange={(e) => onChange({ status: e.target.value })}>
            {statuses.map((s) => <option key={s} value={s}>{LABELS[s]}</option>)}
          </Select>
        </label>
        {!editing && <Button size="sm" variant="quiet" className="px-2" aria-label="Edit notes" onClick={() => setEditing(true)}><NotePencil size={14} /></Button>}
        {confirm ? (
          <Button size="sm" variant="danger" className="px-2" onClick={onDelete} onBlur={() => setConfirm(false)} autoFocus>Remove</Button>
        ) : (
          <Button size="sm" variant="quiet" className="px-2" aria-label="Stop tracking" onClick={() => setConfirm(true)}><Trash size={14} /></Button>
        )}
      </div>
    </Panel>
  );
}
