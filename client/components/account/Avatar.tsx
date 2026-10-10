"use client";

import { teamById } from "@/lib/teams";
import { cn } from "@/components/ui";

// A user's picture, or their initials on their team colour.
export function Avatar({ name, src, team, size = 36, className }: { name: string; src?: string | null; team?: string | null; size?: number; className?: string }) {
  const colour = teamById(team)?.colour ?? "e10600";
  const initials = name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-display font-bold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(140deg, #${colour}, #${colour}99)` }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size} height={size} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
      ) : (
        initials || "?"
      )}
    </span>
  );
}

export function Coins({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 font-display font-bold tnum", className)} title="Pit Coins (just for fun, no monetary value)">
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-yellow-300 to-amber-500 text-[9px] text-amber-950">P</span>
      {value.toLocaleString()}
    </span>
  );
}
