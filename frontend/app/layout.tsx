import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: { default: "CVerity: Resume Intelligence and Job Matcher", template: "%s | CVerity" },
  description: "Score your resume for ATS readiness, see exactly which skills a job needs, and rank candidates with explainable match scores.",
  openGraph: { title: "CVerity: Resume Intelligence and Job Matcher", description: "Resume intelligence and explainable job matching for job seekers and recruiters.", type: "website" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f7f7f8" }, { media: "(prefers-color-scheme: dark)", color: "#0c0c0e" }],
};

// Homepage only: a reload always opens at the very top, instantly (no smooth scroll up from where you were).
// Runs before the first paint, so the browser never restores the old position or jumps to a #section.
// Normal navigation, links to /#how and the Back button keep their usual behavior.
const HOME_TOP_ON_RELOAD = `(function(){try{
if(location.pathname!=="/")return;
var n=performance.getEntriesByType&&performance.getEntriesByType("navigation")[0];
if(!(n?n.type==="reload":performance.navigation&&performance.navigation.type===1))return;
history.scrollRestoration="manual";
if(location.hash)history.replaceState(history.state,"",location.pathname+location.search);
var top=function(){var h=document.documentElement,b=h.style.scrollBehavior;h.style.scrollBehavior="auto";window.scrollTo(0,0);h.style.scrollBehavior=b;};
top();document.addEventListener("DOMContentLoaded",top);
window.addEventListener("load",function(){top();setTimeout(function(){history.scrollRestoration="auto";},0);});
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: HOME_TOP_ON_RELOAD }} />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
