"use client";
import { useEffect, useRef, useState } from "react";
import SloshGauge from "@/components/rb/SloshGauge";

type Weight = readonly [string, number, string];

/** Scoring section: liquid gauges that fill to each signal's real weight when they scroll into view. */
export default function WeightGauges({ weights }: { weights: readonly Weight[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={box} className="grid grid-cols-5 items-end gap-3 sm:gap-5">
      {weights.map(([t, w], i) => (
        <div key={t} className="grid justify-items-center gap-3">
          <SloshGauge value={on ? w : 0} liquidColor="#0e7a5f" glassColor="#d4d4d8" width={64} height={150 + (w / 35) * 40}
            radius={18} ticks={3} viscosity={0.12} tilt={0.55} splash={0.5} ariaLabel={`${t} weight ${w}%`}
            className={on ? "transition-opacity duration-700" : "opacity-60"} key={`${t}-${i}`} />
          <span className="text-center text-xs font-medium text-muted sm:text-sm">{t}</span>
        </div>
      ))}
    </div>
  );
}
