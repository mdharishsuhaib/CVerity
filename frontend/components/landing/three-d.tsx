"use client";
import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** True when the device has a fine pointer and the user has not asked for reduced motion. */
function canTilt() {
  return typeof window !== "undefined"
    && window.matchMedia("(pointer: fine)").matches
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Pointer-driven 3D tilt. Writes --rx/--ry (rotation) and --mx/--my (spotlight position) as CSS variables on the element,
 * so the browser animates on the compositor and React never re-renders while the pointer moves.
 */
export function useTilt<T extends HTMLElement>(max = 8, target?: React.RefObject<HTMLElement | null>) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    const area = target?.current ?? el;
    if (!el || !area || !canTilt()) return;
    let frame = 0;
    const move = (e: PointerEvent) => {
      const r = area.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.setProperty("--ry", `${(x - 0.5) * 2 * max}deg`);
        el.style.setProperty("--rx", `${(0.5 - y) * 2 * max}deg`);
        el.style.setProperty("--mx", `${x * 100}%`);
        el.style.setProperty("--my", `${y * 100}%`);
      });
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    };
    area.addEventListener("pointermove", move);
    area.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      area.removeEventListener("pointermove", move);
      area.removeEventListener("pointerleave", leave);
    };
  }, [max, target]);
  return ref;
}

/** A card that tilts toward the pointer with a soft spotlight that follows it. */
export function TiltCard({ className, children, max = 6, as: Tag = "div" }: {
  className?: string; children: React.ReactNode; max?: number; as?: "div" | "article" | "li";
}) {
  const ref = useTilt<HTMLDivElement>(max);
  return (
    <div className="[perspective:1000px]">
      <Tag ref={ref as React.Ref<never>} className={cn("tilt-3d spotlight relative [transform-style:preserve-3d]", className)}>
        {children}
      </Tag>
    </div>
  );
}

/** Wraps an illustration in a tilted 3D frame with depth shadow; follows the pointer. */
export function Frame3D({ children, className, base = "tilt-left" }: { children: React.ReactNode; className?: string; base?: "tilt-left" | "tilt-right" }) {
  const ref = useTilt<HTMLDivElement>(5);
  return (
    <div className={cn("[perspective:1600px]", className)}>
      <div ref={ref} className={cn("frame-3d relative [transform-style:preserve-3d]", base)}>
        <div aria-hidden className="absolute inset-x-8 -bottom-10 h-16 rounded-[50%] bg-[rgb(var(--shadow)/0.22)] blur-2xl [transform:translateZ(-60px)]" />
        <div className="spotlight relative rounded-[22px] bg-surface p-2 ring-1 ring-line/80 shadow-[0_40px_100px_-40px_rgb(var(--shadow)/0.55)]">
          {children}
        </div>
      </div>
    </div>
  );
}
