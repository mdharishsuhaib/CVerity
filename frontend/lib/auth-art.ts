/**
 * Live artwork for the auth screens: the Sign up badge face and the Log in folder label are built from what the
 * visitor types, so the 3D badge shows their own name and the folder becomes "<Name>'s CVerity".
 */

const FALLBACK_NAME = "Ananya Rao"; // same as the Full name placeholder, shown until the visitor types
const FALLBACK_FIRST = "Ananya";
/** Matches the 30-character limit on the Full name and Email fields. */
export const ART_MAX = 30;

const xml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

/** Full name as it should appear on the badge: trimmed, single spaces, at most 30 characters. */
export function badgeName(raw: string): string {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return FALLBACK_NAME;
  return Array.from(name).slice(0, ART_MAX).join("").trimEnd();
}

function initials(name: string): string {
  const words = name.split(" ").filter(Boolean);
  const first = Array.from(words[0] ?? "")[0] ?? "";
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] ?? "" : "";
  return (first + last).toUpperCase() || "CV";
}

/** "haris@gmail.com" -> "Haris", "mohammed.ali99@x.com" -> "Mohammed". Falls back to the demo name while empty. */
export function emailFirstName(email: string): string {
  const local = email.trim().split("@")[0] ?? "";
  const word = local.split(/[._\-+\d]+/).find(Boolean) ?? "";
  if (!word) return FALLBACK_FIRST;
  const chars = Array.from(word).slice(0, ART_MAX);
  return chars[0].toUpperCase() + chars.slice(1).join("").toLowerCase();
}

/** The Sign up badge face as an SVG data URL, with the visitor's name and initials. */
export function badgeFront(rawName: string): string {
  const name = badgeName(rawName);
  const len = Array.from(name).length;
  // The name line is 528px wide; shrink the font for long names, and for wide letters squeeze the line
  // to exactly 528px so a full 30-character name never overflows the card.
  const size = Math.max(26, Math.min(46, Math.floor(880 / Math.max(1, len))));
  const fit = len * size * 0.62 > 528 ? ` textLength="528" lengthAdjust="spacingAndGlyphs"` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="900" viewBox="0 0 640 900">
  <defs>
    <linearGradient id="top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0e7a5f"/><stop offset="1" stop-color="#0a5845"/></linearGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5fd3ae"/><stop offset="1" stop-color="#0e7a5f"/></linearGradient>
  </defs>
  <rect width="640" height="900" fill="#ffffff"/>
  <rect width="640" height="300" fill="url(#top)"/>
  <circle cx="560" cy="40" r="180" fill="#ffffff" opacity="0.06"/>
  <circle cx="80" cy="300" r="120" fill="#ffffff" opacity="0.05"/>
  <rect x="270" y="34" width="100" height="16" rx="8" fill="#ffffff" opacity="0.35"/>
  <rect x="56" y="92" width="64" height="64" rx="16" fill="#ffffff"/>
  <text x="88" y="135" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700" fill="#0e7a5f">CV</text>
  <text x="140" y="135" font-family="Segoe UI, Arial, sans-serif" font-size="38" font-weight="700" fill="#ffffff">CVerity</text>
  <text x="56" y="210" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="600" fill="#ffffff" opacity="0.8" letter-spacing="3">VERIFIED RESUME</text>
  <circle cx="320" cy="330" r="92" fill="#ffffff"/>
  <circle cx="320" cy="330" r="80" fill="#e5f2ed"/>
  <text x="320" y="350" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="58" font-weight="700" fill="#0e7a5f">${xml(initials(name))}</text>
  <text x="320" y="480" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="700" fill="#18181b"${fit}>${xml(name)}</text>
  <text x="320" y="522" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="500" fill="#52525b">Data Analyst · Bengaluru</text>
  <rect x="56" y="572" width="528" height="1.5" fill="#e4e4e7"/>
  <circle cx="132" cy="660" r="56" fill="none" stroke="#e4e4e7" stroke-width="12"/>
  <circle cx="132" cy="660" r="56" fill="none" stroke="url(#ring)" stroke-width="12" stroke-linecap="round" stroke-dasharray="324 352" transform="rotate(-90 132 660)"/>
  <text x="132" y="674" text-anchor="middle" font-family="Consolas, monospace" font-size="40" font-weight="700" fill="#18181b">92</text>
  <text x="216" y="646" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="600" fill="#52525b" letter-spacing="2">ATS SCORE</text>
  <text x="216" y="684" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="700" fill="#0e7a5f">Grade A · Top 8%</text>
  <g font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="600" fill="#0a5845">
    <rect x="56" y="752" width="112" height="44" rx="22" fill="#e5f2ed"/><text x="112" y="781" text-anchor="middle">Python</text>
    <rect x="180" y="752" width="84" height="44" rx="22" fill="#e5f2ed"/><text x="222" y="781" text-anchor="middle">SQL</text>
    <rect x="276" y="752" width="120" height="44" rx="22" fill="#e5f2ed"/><text x="336" y="781" text-anchor="middle">Tableau</text>
    <rect x="408" y="752" width="128" height="44" rx="22" fill="#e5f2ed"/><text x="472" y="781" text-anchor="middle">Power BI</text>
  </g>
  <text x="56" y="856" font-family="Consolas, monospace" font-size="18" fill="#8a8a93">ID CV-2026-0892</text>
  <circle cx="568" cy="848" r="18" fill="#0e7a5f"/>
  <path d="M559 848 l6 6 l12 -13" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
