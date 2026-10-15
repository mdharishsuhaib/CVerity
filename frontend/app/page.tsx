"use client";
import { Features, ValueStrip } from "@/components/landing/features";
import { Hero } from "@/components/landing/hero";
import { Faq, FinalCta, HowItWorks, Scoring, Trust } from "@/components/landing/sections";

export default function Home() {
  return (
    <>
      <Hero />
      <ValueStrip />
      <Features />
      <HowItWorks />
      <Scoring />
      <Trust />
      <Faq />
      <FinalCta />
    </>
  );
}
