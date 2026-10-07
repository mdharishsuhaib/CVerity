import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: { default: "CVerity: resume intelligence and job matching", template: "%s | CVerity" },
  description: "Score your resume for ATS readiness, see exactly which skills a job needs, and rank candidates with explainable match scores.",
  openGraph: { title: "CVerity", description: "Resume intelligence and explainable job matching for job seekers and recruiters.", type: "website" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f7f7f8" }, { media: "(prefers-color-scheme: dark)", color: "#0c0c0e" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
