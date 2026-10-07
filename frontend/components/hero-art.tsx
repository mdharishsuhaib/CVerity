// Hero illustration: one resume is scanned, passes through the CVerity engine and comes out as ranked job matches.
// Pure SVG with theme tokens, so it follows light and dark mode and stays sharp at any size.
const JOBS = [
  { top: 66, title: "Backend Engineer", score: 92, best: true },
  { top: 166, title: "Data Engineer", score: 84, best: false },
  { top: 266, title: "Cloud Architect", score: 71, best: false },
];

export function HeroMatchArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 400" role="img" className={className}
      aria-label="A resume with an ATS score of 88 is analyzed by CVerity and ranked against three jobs: 92, 84 and 71">

      <rect x="0" y="0" width="480" height="400" rx="16" className="fill-sunken" />

      {/* Resume */}
      <g>
        <rect x="28" y="56" width="144" height="288" rx="10" className="fill-surface stroke-line" strokeWidth="1" />
        <circle cx="50" cy="82" r="10" className="fill-accent-soft" />
        <rect x="66" y="74" width="70" height="7" rx="3.5" className="fill-ink" opacity="0.85" />
        <rect x="66" y="86" width="48" height="5" rx="2.5" className="fill-subtle" opacity="0.5" />

        <rect x="44" y="110" width="36" height="5" rx="2.5" className="fill-accent" />
        <rect x="44" y="122" width="112" height="4" rx="2" className="fill-line" />
        <rect x="44" y="132" width="100" height="4" rx="2" className="fill-line" />
        <rect x="44" y="142" width="108" height="4" rx="2" className="fill-line" />

        <rect x="44" y="162" width="30" height="5" rx="2.5" className="fill-accent" />
        <rect x="44" y="174" width="30" height="12" rx="6" className="fill-accent-soft" />
        <rect x="78" y="174" width="40" height="12" rx="6" className="fill-accent-soft" />
        <rect x="122" y="174" width="28" height="12" rx="6" className="fill-accent-soft" />
        <rect x="44" y="190" width="44" height="12" rx="6" className="fill-accent-soft" />
        <rect x="92" y="190" width="34" height="12" rx="6" className="fill-warn-soft" />

        <rect x="44" y="220" width="48" height="5" rx="2.5" className="fill-accent" />
        {[232, 242, 252, 262, 272].map((y, i) => (
          <rect key={y} x="44" y={y} width={[116, 96, 108, 84, 102][i]} height="4" rx="2" className="fill-line" />
        ))}
        <rect x="44" y="292" width="40" height="5" rx="2.5" className="fill-accent" />
        <rect x="44" y="304" width="104" height="4" rx="2" className="fill-line" />
        <rect x="44" y="314" width="76" height="4" rx="2" className="fill-line" />

        {/* Scan area starts just below the ATS badge (badge ends at y 66) and runs to the page's bottom edge (y 344). */}
        <linearGradient id="hero-scan-glow" x1="0" y1="0" x2="0" y2="1" className="text-accent">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset="0.5" stopColor="currentColor" stopOpacity="0.14" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
        <clipPath id="hero-resume-clip">
          <path d="M28 68 H172 V334 A10 10 0 0 1 162 344 H38 A10 10 0 0 1 28 334 Z" />
        </clipPath>
        <g clipPath="url(#hero-resume-clip)">
          {/* The glow is centred on the line, so it looks the same moving down and moving up. */}
          <g className="scan-band">
            <rect x="28" y="57.75" width="144" height="22" fill="url(#hero-scan-glow)" />
            <rect x="28" y="68" width="144" height="1.5" className="fill-accent" opacity="0.6" />
          </g>
        </g>

        {/* ATS badge */}
        <rect x="112" y="42" width="72" height="24" rx="12" className="fill-accent" />
        <text x="148" y="58" textAnchor="middle" className="fill-accent-on" fontSize="11" fontWeight="600">ATS 88</text>
      </g>

      {/* Connectors */}
      <path d="M172 200 L204 200" fill="none" className="stroke-accent flow" strokeWidth="1.5" opacity="0.8" />
      {JOBS.map((j) => (
        <path key={j.top} d={`M260 200 C 278 200, 274 ${j.top + 34}, 292 ${j.top + 34}`} fill="none"
          className="stroke-accent flow" strokeWidth="1.5" opacity={j.best ? 0.9 : 0.5} />
      ))}

      {/* CVerity engine */}
      <circle cx="232" cy="200" r="28" fill="none" className="stroke-accent hub-pulse" strokeWidth="2" />
      <rect x="204" y="172" width="56" height="56" rx="14" className="fill-accent" />
      <text x="232" y="207" textAnchor="middle" className="fill-accent-on" fontSize="19" fontWeight="700"
        fontFamily="var(--font-geist-sans), sans-serif">CV</text>

      {/* Ranked jobs */}
      {JOBS.map((j, i) => {
        const tone = j.score >= 80 ? "fill-accent" : "fill-warn";
        return (
          <g key={j.title}>
            <rect x="292" y={j.top} width="160" height="68" rx="10" strokeWidth={j.best ? 1.5 : 1}
              className={j.best ? "fill-surface stroke-accent" : "fill-surface stroke-line"} />
            <text x="306" y={j.top + 22} className="fill-subtle" fontSize="9.5" fontFamily="var(--font-geist-mono), monospace">#{i + 1}</text>
            <text x="324" y={j.top + 22} className="fill-ink" fontSize="11.5" fontWeight="500">{j.title}</text>
            <rect x="306" y={j.top + 32} width="58" height="4" rx="2" className="fill-line" />
            <rect x="306" y={j.top + 48} width="92" height="5" rx="2.5" className="fill-line" />
            <rect x="306" y={j.top + 48} width={92 * (j.score / 100)} height="5" rx="2.5" className={tone} />
            <text x="440" y={j.top + 54} textAnchor="end" className={tone} fontSize="18" fontWeight="600"
              fontFamily="var(--font-geist-mono), monospace">{j.score}</text>
          </g>
        );
      })}

      <text x="240" y="378" textAnchor="middle" className="fill-subtle" fontSize="11">One resume, scored and ranked against every open job</text>
    </svg>
  );
}
