"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { RequireAuth } from "@/components/providers";
import { Button, ErrorNote, Field, Input, PageHeader, Panel, Score, Skeleton, Textarea } from "@/components/ui";
import { MatchBreakdown } from "@/components/match";

export default function Page() {
  return <RequireAuth><Analyze /></RequireAuth>;
}

function Analyze() {
  const [file, setFile] = useState<File | null>(null);
  const [jd, setJd] = useState("");
  const [title, setTitle] = useState("");
  const m = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      if (file) fd.append("file", file);
      fd.append("job_description", jd);
      fd.append("job_title", title);
      return api("/match/score", { method: "POST", form: fd });
    },
  });
  const ready = !!file && jd.trim().length >= 20;

  return (
    <>
      <PageHeader title="Quick match" sub="Score any resume against any job description. Nothing is saved." />
      <div className="grid gap-8 lg:grid-cols-[1fr_1.15fr]">
        <form className="grid content-start gap-5" onSubmit={(e) => { e.preventDefault(); if (ready) m.mutate(); }}>
          <Field label="Resume" hint="PDF, DOCX or TXT">
            <input type="file" accept=".pdf,.docx,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="text-sm text-muted file:mr-3 file:h-9 file:rounded-md file:border-0 file:bg-sunken file:px-3 file:text-sm file:font-medium file:text-ink hover:file:bg-line" />
          </Field>
          <Field label="Job title" hint="Optional. Improves the title score."><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Job description"><Textarea rows={12} value={jd} onChange={(e) => setJd(e.target.value)} /></Field>
          <ErrorNote error={m.error} />
          <div><Button disabled={!ready || m.isPending}>{m.isPending ? "Scoring..." : "Score match"}</Button></div>
        </form>

        <div>
          {m.isPending && <div className="grid gap-3"><Skeleton className="h-28" /><Skeleton className="h-56" /></div>}
          {m.data && !m.isPending && (
            <Panel className="p-0">
              <div className="flex flex-wrap items-center gap-6 border-b border-line p-5">
                <Score score={m.data.match.score} size="lg" label="Match" />
                <Score score={m.data.ats.score} size="md" label="ATS" />
                <div>
                  <p className="text-lg font-semibold">{m.data.match.verdict}</p>
                  <p className="text-sm text-subtle">{m.data.job.required_skills.length} required and {m.data.job.preferred_skills.length} preferred skills found in the posting</p>
                </div>
              </div>
              <div className="p-5"><MatchBreakdown m={m.data.match} /></div>
            </Panel>
          )}
          {!m.data && !m.isPending && (
            <div className="grid h-full min-h-[16rem] place-items-center rounded-xl border border-dashed border-line p-8 text-center">
              <p className="max-w-[34ch] text-sm text-muted">Your score, matched skills and gaps will show up here.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
