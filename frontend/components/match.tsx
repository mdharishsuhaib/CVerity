"use client";
import { useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { cn, scoreColor } from "@/lib/utils";
import { Meter, Panel, Score, Tag } from "@/components/ui";

export type Match = {
  score: number; verdict: string; components: Record<string, number | null>; matched: string[];
  partial: { skill: string; via: string; kind: string }[]; missing_required: string[]; missing_preferred: string[];
  candidate_years: number; required_years: number; highlights: string[]; concerns: string[];
};

function SkillGroup({ title, items, tone }: { title: string; items: React.ReactNode[]; tone?: string }) {
  if (!items.length) return null;
  return (
    <div>
      <p className={cn("mb-1.5 text-xs font-medium", tone ?? "text-muted")}>{title}</p>
      <div className="flex flex-wrap gap-1">{items}</div>
    </div>
  );
}

export function MatchBreakdown({ m }: { m: Match }) {
  return (
    <div className="grid gap-8 md:grid-cols-[1fr_1.2fr]">
      <div className="grid content-start gap-2.5">
        {Object.entries(m.components).map(([k, v]) => <Meter key={k} label={k} value={v} />)}
        <p className="pt-2 text-xs text-subtle">
          Experience: <span className="font-mono tabular text-ink">{m.candidate_years}</span> yrs (role asks for <span className="font-mono tabular text-ink">{m.required_years}</span>)
        </p>
      </div>
      <div className="grid content-start gap-4 text-sm">
        <SkillGroup title="Has" items={m.matched.map((s) => <Tag key={s} tone="good">{s}</Tag>)} />
        <SkillGroup title="Close match" items={m.partial.map((p) => <Tag key={p.skill} tone="warn">{p.skill} via {p.via}</Tag>)} />
        <SkillGroup title="Missing, required" tone="text-bad" items={m.missing_required.map((s) => <Tag key={s} tone="bad">{s}</Tag>)} />
        <SkillGroup title="Missing, nice to have" items={m.missing_preferred.map((s) => <Tag key={s}>{s}</Tag>)} />
        {(m.highlights.length > 0 || m.concerns.length > 0) && (
          <ul className="grid gap-1 border-t border-line pt-3">
            {m.highlights.map((h) => <li key={h} className="text-accent-ink">{h}</li>)}
            {m.concerns.map((h) => <li key={h} className="text-bad">{h}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

export function MatchRow({ title, subtitle, m, actions }: { title: string; subtitle?: string; m: Match; actions?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Panel as="article" className="p-0">
      <div className="flex flex-wrap items-center gap-4 p-4 md:flex-nowrap md:p-5">
        <Score score={m.score} size="sm" label="match" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium">{title}</h3>
          {subtitle && <p className="truncate text-sm text-subtle">{subtitle}</p>}
          <p className="mt-1 text-sm">
            <span className={cn("font-medium", scoreColor(m.score))}>{m.verdict}</span>
            <span className="ml-2 text-subtle">{m.matched.length} skills matched{m.missing_required.length ? `, ${m.missing_required.length} required missing` : ""}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <button onClick={() => setOpen(!open)} aria-expanded={open}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[13px] text-muted transition hover:bg-sunken hover:text-ink">
            Breakdown <CaretDown size={14} weight="bold" className={cn("transition-transform duration-200", open && "rotate-180")} />
          </button>
        </div>
      </div>
      {open && <div className="border-t border-line p-5"><MatchBreakdown m={m} /></div>}
    </Panel>
  );
}
