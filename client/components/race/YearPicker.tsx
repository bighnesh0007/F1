"use client";

import { useRouter, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Steps through seasons with ?year=; the current season has no query string.
export function YearPicker({ year, current, min = 1950 }: { year: number; current: number; min?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const go = (y: number) => router.push(y >= current ? pathname : `${pathname}?year=${y}`);
  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-surface-2 p-1">
      <button onClick={() => go(year - 1)} disabled={year <= min} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink disabled:opacity-30" aria-label="Previous season">
        <ChevronLeft size={16} />
      </button>
      <span className="tnum min-w-14 text-center font-display font-bold">{year}</span>
      <button onClick={() => go(year + 1)} disabled={year >= current} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink disabled:opacity-30" aria-label="Next season">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
