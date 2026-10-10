"use client";

import { createContext, useContext, useMemo } from "react";
import { useApi } from "./useApi";
import { useLive } from "./live-context";

export type DriverInfo = {
  number: string;
  tla: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
  team: string;
  colour: string; // hex without '#'
  headshot: string | null;
};

type DriversResponse = { session: string | null; drivers: Record<string, Omit<DriverInfo, "colour"> & { teamColour?: string }> };

type Ctx = {
  byNumber: Record<string, DriverInfo>;
  get: (number?: string | null) => DriverInfo;
  byCode: (code?: string | null) => DriverInfo | null;
  all: DriverInfo[];
};

const DriversContext = createContext<Ctx | null>(null);

// Driver names, team colours and photos: the latest archived session's driver list,
// overridden by the live session's when one is running.
export function DriversProvider({ children }: { children: React.ReactNode }) {
  const { data } = useApi<DriversResponse>("/api/drivers");
  const { topics } = useLive();
  const liveList = topics.DriverList;

  const value = useMemo<Ctx>(() => {
    const byNumber: Record<string, DriverInfo> = {};
    for (const [n, d] of Object.entries(data?.drivers ?? {})) {
      byNumber[n] = {
        number: n,
        tla: d.tla ?? n,
        firstName: d.firstName,
        lastName: d.lastName,
        fullName: d.fullName ?? `${d.firstName ?? ""} ${d.lastName ?? ""}`.trim(),
        team: d.team ?? "",
        colour: d.teamColour ?? "888888",
        headshot: d.headshot ?? null,
      };
    }
    for (const [n, d] of Object.entries<Record<string, string>>(liveList ?? {})) {
      if (!/^\d+$/.test(n) || !d) continue;
      const prev = byNumber[n];
      byNumber[n] = {
        number: n,
        tla: d.Tla ?? prev?.tla ?? n,
        firstName: d.FirstName ?? prev?.firstName,
        lastName: d.LastName ?? prev?.lastName,
        fullName: d.FullName ?? prev?.fullName ?? n,
        team: d.TeamName ?? prev?.team ?? "",
        colour: d.TeamColour ?? prev?.colour ?? "888888",
        headshot: d.HeadshotUrl ?? prev?.headshot ?? null,
      };
    }
    const codes = new Map(Object.values(byNumber).map((d) => [d.tla.toUpperCase(), d]));
    return {
      byNumber,
      all: Object.values(byNumber),
      get: (number) =>
        byNumber[number ?? ""] ?? { number: number ?? "", tla: number ?? "?", fullName: number ?? "", team: "", colour: "888888", headshot: null },
      byCode: (code) => (code ? codes.get(code.toUpperCase()) ?? null : null),
    };
  }, [data, liveList]);

  return <DriversContext.Provider value={value}>{children}</DriversContext.Provider>;
}

export function useDrivers() {
  const ctx = useContext(DriversContext);
  if (!ctx) throw new Error("useDrivers must be used inside DriversProvider");
  return ctx;
}

// Team colours for Jolpica constructor ids, from the current grid where possible.
export function useTeamColour() {
  const { all } = useDrivers();
  return useMemo(() => {
    const byTeam = new Map<string, string>();
    for (const d of all) if (d.team) byTeam.set(normTeam(d.team), d.colour);
    return (teamName?: string | null) => {
      const key = normTeam(teamName ?? "");
      for (const [name, colour] of byTeam) if (name.includes(key) || key.includes(name)) return colour;
      return "888888";
    };
  }, [all]);
}

function normTeam(name: string) {
  return name.toLowerCase().replace(/f1 team|racing|formula one|team|scuderia|bwt|visa|cash app|stake|kick|moneygram|aramco|mercedes-amg|petronas/g, "").replace(/[^a-z]/g, "");
}
