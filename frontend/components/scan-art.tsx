// Illustration: a resume being scanned, with keyword hits feeding a match score and four checks.
// Pure SVG with theme tokens, so it follows light and dark mode and stays sharp at any size.
export function ResumeScanArt({ className }: { className?: string }) {
  const rows = [
    { y: 150, label: "ATS ready", w: 78 },
    { y: 174, label: "Job fit", w: 64 },
    { y: 198, label: "Rewrites", w: 52 },
    { y: 222, label: "Ranked", w: 70 },
  ];
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 400 270" role="img" aria-labelledby="scan-art-title" className={className}>
      <title id="scan-art-title">A resume being scanned for skills, producing a match score of 84 and four checks</title>

      <rect x="0" y="0" width="400" height="270" rx="16" className="fill-sunken" />

      {/* Resume page */}
      <g>
        <rect x="28" y="26" width="178" height="218" rx="10" className="fill-surface stroke-line" strokeWidth="1" />
        <circle cx="52" cy="52" r="11" className="fill-accent-soft" />
        <rect x="70" y="44" width="80" height="7" rx="3.5" className="fill-ink" opacity="0.85" />
        <rect x="70" y="56" width="56" height="5" rx="2.5" className="fill-subtle" opacity="0.5" />

        <rect x="44" y="80" width="40" height="5" rx="2.5" className="fill-accent" />
        <rect x="44" y="92" width="146" height="4" rx="2" className="fill-line" />
        <rect x="44" y="102" width="128" height="4" rx="2" className="fill-line" />

        <rect x="44" y="122" width="52" height="5" rx="2.5" className="fill-accent" />
        {/* keyword hits */}
        <rect x="44" y="134" width="34" height="12" rx="6" className="fill-accent-soft" />
        <rect x="82" y="134" width="42" height="12" rx="6" className="fill-accent-soft" />
        <rect x="128" y="134" width="30" height="12" rx="6" className="fill-accent-soft" />
        <rect x="44" y="150" width="46" height="12" rx="6" className="fill-accent-soft" />
        <rect x="94" y="150" width="36" height="12" rx="6" className="fill-warn-soft" />

        <rect x="44" y="176" width="44" height="5" rx="2.5" className="fill-accent" />
        <rect x="44" y="188" width="140" height="4" rx="2" className="fill-line" />
        <rect x="44" y="198" width="118" height="4" rx="2" className="fill-line" />
        <rect x="44" y="208" width="132" height="4" rx="2" className="fill-line" />
        <rect x="44" y="218" width="96" height="4" rx="2" className="fill-line" />

        {/* scan band */}
        <g className="scan-band">
          <rect x="30" y="70" width="174" height="22" className="fill-accent" opacity="0.08" />
          <rect x="30" y="91" width="174" height="1.5" className="fill-accent" opacity="0.6" />
        </g>
      </g>

      {/* Connector */}
      <path d="M210 135 C 236 135, 236 80, 256 80" fill="none" className="stroke-accent" strokeWidth="1.5" strokeDasharray="3 4" opacity="0.7" />

      {/* Score ring */}
      <g transform="translate(300 80)">
        <circle r={r} fill="none" className="stroke-line" strokeWidth="6" />
        <circle r={r} fill="none" className="stroke-accent" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${c * 0.84} ${c}`} transform="rotate(-90)" />
        <text y="6" textAnchor="middle" className="fill-ink" fontSize="18" fontWeight="600" fontFamily="var(--font-geist-mono), monospace">84</text>
      </g>
      <text x="300" y="128" textAnchor="middle" className="fill-subtle" fontSize="10.5">match score</text>

      {/* Four answers */}
      {rows.map((row) => (
        <g key={row.label}>
          <circle cx="250" cy={row.y} r="6" className="fill-accent-soft" />
          <path d={`M247 ${row.y} l2 2 l4 -4`} fill="none" className="stroke-accent" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <text x="262" y={row.y + 3.5} className="fill-muted" fontSize="10.5">{row.label}</text>
          <rect x="316" y={row.y - 2} width="58" height="4" rx="2" className="fill-line" />
          <rect x="316" y={row.y - 2} width={58 * (row.w / 100)} height="4" rx="2" className="fill-accent" />
        </g>
      ))}
    </svg>
  );
}
