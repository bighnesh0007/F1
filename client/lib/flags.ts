// Which marshal sectors are under yellow flags, from race control messages in order.
export type FlagMessage = { flag?: string | null; scope?: string | null; sector?: number | null; message?: string };

export function yellowSectors(messages: FlagMessage[]) {
  const active = new Map<number, "yellow" | "double">();
  for (const m of messages) {
    const flag = String(m.flag ?? "").toUpperCase();
    // A track-wide green or chequered flag clears everything.
    if (m.scope === "Track" && (flag === "GREEN" || flag === "CLEAR" || flag === "CHEQUERED")) active.clear();
    if (m.scope !== "Sector" || m.sector == null) continue;
    if (flag === "DOUBLE YELLOW") active.set(m.sector, "double");
    else if (flag === "YELLOW") active.set(m.sector, active.get(m.sector) === "double" ? "double" : "yellow");
    else if (flag === "CLEAR" || flag === "GREEN") active.delete(m.sector);
  }
  return active;
}
