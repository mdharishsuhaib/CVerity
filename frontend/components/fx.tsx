"use client";
/**
 * React Bits effects (https://reactbits.dev), loaded lazily and only in the browser so the first paint stays fast
 * and nothing WebGL-related runs during server rendering. Each effect is used on exactly one page or section.
 */
import dynamic from "next/dynamic";

const none = () => null;

export const LiquidEther = dynamic(() => import("./rb/LiquidEther"), { ssr: false, loading: none });
export const SplitText = dynamic(() => import("./rb/SplitText"), { ssr: false });
export const Counter = dynamic(() => import("./rb/Counter"), { ssr: false });
export const Stack = dynamic(() => import("./rb/Stack"), { ssr: false, loading: none });
export const SloshGauge = dynamic(() => import("./rb/SloshGauge"), { ssr: false, loading: none });
export const SpotlightCard = dynamic(() => import("./rb/SpotlightCard"), { ssr: false });
export const Grainient = dynamic(() => import("./rb/Grainient"), { ssr: false, loading: none });
export const Antigravity = dynamic(() => import("./rb/Antigravity"), { ssr: false, loading: none });
export const Lanyard = dynamic(() => import("./rb/Lanyard"), { ssr: false, loading: none });
export const Scanner = dynamic(() => import("./rb/Scanner"), { ssr: false, loading: none });
export const ShinyText = dynamic(() => import("./rb/ShinyText"), { ssr: false });
export const FuzzyText = dynamic(() => import("./rb/FuzzyText"), { ssr: false });

/* CVerity compositions built from React Bits pieces. */
export const HeroDeck = dynamic(() => import("./landing/hero-deck"), { ssr: false, loading: none });
export const StepsStack = dynamic(() => import("./landing/steps-stack"), { ssr: false, loading: none });
export const ShortlistStack = dynamic(() => import("./landing/shortlist-stack"), { ssr: false, loading: none });
export const WeightGauges = dynamic(() => import("./landing/weight-gauges"), { ssr: false, loading: none });
