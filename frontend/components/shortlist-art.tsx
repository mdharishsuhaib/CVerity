// Recruiter illustration: a batch of resumes becomes a ranked shortlist that can be exported as CSV.
// Pure SVG with theme tokens, so it follows light and dark mode and stays sharp at any size.
const ROWS = [
  { score: 94, name: 58, chips: [22, 28] },
  { score: 88, name: 46, chips: [26, 20] },
  { score: 76, name: 52, chips: [18, 24] },
  { score: 63, name: 40, chips: [24, 16] },
];

export function ShortlistArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 284" role="img" className={className}
      aria-label="A batch of 12 resumes is ranked into a shortlist with scores of 94, 88, 76 and 63, ready to export as CSV">

      <rect x="0" y="0" width="400" height="284" rx="16" className="fill-sunken" />

      {/* Batch of resumes */}
      <rect x="44" y="52" width="88" height="116" rx="8" className="fill-surface stroke-line" strokeWidth="1" opacity="0.6" />
      <rect x="36" y="60" width="88" height="116" rx="8" className="fill-surface stroke-line" strokeWidth="1" opacity="0.8" />
      <g>
        <rect x="28" y="68" width="88" height="116" rx="8" className="fill-surface stroke-line" strokeWidth="1" />
        <circle cx="44" cy="86" r="6" className="fill-accent-soft" />
        <rect x="54" y="82" width="40" height="5" rx="2.5" className="fill-ink" opacity="0.8" />
        <rect x="40" y="100" width="66" height="4" rx="2" className="fill-line" />
        <rect x="40" y="108" width="54" height="4" rx="2" className="fill-line" />
        <rect x="40" y="116" width="60" height="4" rx="2" className="fill-line" />
        <rect x="40" y="128" width="22" height="9" rx="4.5" className="fill-accent-soft" />
        <rect x="66" y="128" width="28" height="9" rx="4.5" className="fill-accent-soft" />
        <rect x="40" y="146" width="62" height="4" rx="2" className="fill-line" />
        <rect x="40" y="154" width="46" height="4" rx="2" className="fill-line" />
        <rect x="40" y="162" width="54" height="4" rx="2" className="fill-line" />
      </g>
      <rect x="30" y="204" width="86" height="22" rx="11" className="fill-accent-soft" />
      <text x="73" y="219" textAnchor="middle" className="fill-accent-ink" fontSize="10.5" fontWeight="600">12 resumes</text>

      <path d="M120 130 L150 130" fill="none" className="stroke-accent flow" strokeWidth="1.5" opacity="0.8" />

      {/* Ranked shortlist */}
      <rect x="150" y="28" width="226" height="224" rx="10" className="fill-surface stroke-line" strokeWidth="1" />
      <text x="166" y="52" className="fill-ink" fontSize="12" fontWeight="600">Shortlist</text>
      <rect x="322" y="40" width="40" height="18" rx="9" fill="none" className="stroke-accent" strokeWidth="1.2" />
      <text x="342" y="53" textAnchor="middle" className="fill-accent" fontSize="9.5" fontWeight="600">CSV</text>
      <rect x="150" y="64" width="226" height="1" className="fill-line" />

      {ROWS.map((r, i) => {
        const top = 76 + i * 42;
        const best = i === 0;
        const tone = r.score >= 80 ? "fill-accent" : "fill-warn";
        return (
          <g key={r.score} className="row-in" style={{ animationDelay: `${0.15 + i * 0.15}s` }}>
            {best && <rect x="158" y={top} width="210" height="36" rx="8" className="fill-accent-soft" />}
            <text x="170" y={top + 22} textAnchor="middle" className="fill-subtle" fontSize="10" fontFamily="var(--font-geist-mono), monospace">{i + 1}</text>
            <circle cx="192" cy={top + 18} r="9" className={best ? "fill-surface" : "fill-line"} />
            <rect x="208" y={top + 10} width={r.name} height="5" rx="2.5" className="fill-ink" opacity="0.8" />
            <rect x="208" y={top + 21} width={r.chips[0]} height="8" rx="4" className={best ? "fill-surface" : "fill-accent-soft"} />
            <rect x={212 + r.chips[0]} y={top + 21} width={r.chips[1]} height="8" rx="4" className={best ? "fill-surface" : "fill-accent-soft"} />
            <text x="360" y={top + 23} textAnchor="end" className={tone} fontSize="14" fontWeight="600"
              fontFamily="var(--font-geist-mono), monospace">{r.score}</text>
          </g>
        );
      })}

      <text x="200" y="272" textAnchor="middle" className="fill-subtle" fontSize="10.5">Bulk upload, ranked shortlist, one-click CSV export</text>
    </svg>
  );
}
