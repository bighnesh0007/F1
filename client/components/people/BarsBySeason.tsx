"use client";

// One value per season as thin vertical bars (single series, so no legend), with a
// tooltip per bar and the latest and peak seasons labelled.
export function BarsBySeason({ data, label, format = String }: { data: { season: number; value: number }[]; label: string; format?: (v: number) => string }) {
  if (data.length === 0) return null;
  const sorted = [...data].sort((a, b) => a.season - b.season);
  const max = Math.max(...sorted.map((d) => d.value), 1);
  const peak = sorted.reduce((a, b) => (b.value > a.value ? b : a));
  return (
    <figure>
      <div className="flex h-36 items-end gap-[2px]" role="img" aria-label={`${label} by season`}>
        {sorted.map((d) => (
          <div key={d.season} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t-[4px] bg-accent/80 transition-colors group-hover:bg-accent"
              style={{ height: `${Math.max(d.value > 0 ? 3 : 0, (d.value / max) * 100)}%` }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-lg border border-line bg-surface px-2 py-1 text-xs whitespace-nowrap shadow-card group-hover:block">
              {d.season}: <b className="tnum">{format(d.value)}</b> {label.toLowerCase()}
            </span>
          </div>
        ))}
      </div>
      <figcaption className="mt-1.5 flex justify-between text-[11px] text-muted">
        <span>{sorted[0].season}</span>
        <span>
          Best: {peak.season} ({format(peak.value)})
        </span>
        <span>{sorted.at(-1)!.season}</span>
      </figcaption>
    </figure>
  );
}
