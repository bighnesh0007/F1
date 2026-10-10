"use client";

import { useSearchParams } from "next/navigation";

// Season from the ?year= query string; null means the current season.
export function useYearParam() {
  const params = useSearchParams();
  const year = params.get("year");
  return year && /^\d{4}$/.test(year) ? Number(year) : null;
}

export const yearQuery = (year: number | null) => (year ? `?year=${year}` : "");
