"use client";
import { ChartLineUp, ClipboardText, MagicWand, UploadSimple } from "@phosphor-icons/react";
import ScrollStack, { ScrollStackItem } from "@/components/rb/ScrollStack";

const STEPS = [
  [UploadSimple, "01", "Upload", "Drop a PDF, DOCX or TXT. CVerity extracts sections, contact details, dated experience and skills."],
  [ChartLineUp, "02", "Score", "Eight ATS checks and a match score against every open role, each with its reasons."],
  [MagicWand, "03", "Improve", "Rewrite weak bullets, add missing keywords, then generate a cover letter and interview prep."],
  [ClipboardText, "04", "Apply and track", "Save the roles you want and move them from applied to offer on one board."],
] as const;

/** How it works: each step card slides up and stacks on the previous one as the page scrolls. */
export default function StepsStack() {
  return (
    <ScrollStack useWindowScroll itemDistance={80} itemStackDistance={26} stackPosition="18%" baseScale={0.9} itemScale={0.03}
      dimAmount={0.06} tiltAmount={0} holdDistance={120}>
      {STEPS.map(([Icon, n, t, d]) => (
        <ScrollStackItem key={n} itemClassName="!h-64 md:!h-60 !p-8 md:!p-10">
          <div className="grid h-full gap-6 md:grid-cols-[auto_1fr] md:items-center md:gap-10">
                  <div className="flex items-center gap-4 md:inline-flex md:flex-col md:items-center md:gap-3">
                    <span className="font-mono text-5xl font-semibold leading-none tracking-tight text-accent/25 md:text-7xl">{n}</span>
                    <Icon size={30} weight="regular" className="shrink-0 text-accent" aria-hidden />
                  </div>
            <div>
              <h3 className="text-2xl font-semibold tracking-tight md:text-3xl">{t}</h3>
              <p className="mt-3 max-w-[52ch] text-base leading-relaxed text-muted md:text-lg">{d}</p>
            </div>
          </div>
        </ScrollStackItem>
      ))}
    </ScrollStack>
  );
}
