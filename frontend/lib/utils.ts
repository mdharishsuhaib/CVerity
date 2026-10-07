import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type Band = "strong" | "fair" | "weak" | "none";

export function band(score: number | null | undefined): Band {
  if (score == null) return "none";
  if (score >= 65) return "strong";
  if (score >= 50) return "fair";
  return "weak";
}

export function scoreColor(score: number | null | undefined): string {
  return { strong: "text-accent", fair: "text-warn", weak: "text-bad", none: "text-subtle" }[band(score)];
}

export function scoreFill(score: number | null | undefined): string {
  return { strong: "bg-accent", fair: "bg-warn", weak: "bg-bad", none: "bg-line" }[band(score)];
}

export const EDU_LABELS = ["Any", "High school", "Associate", "Bachelor's", "Master's", "Doctorate"];

export function fmtScore(n: number | null | undefined): string {
  return n == null ? "-" : `${Math.round(n)}`;
}
