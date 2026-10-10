import type { Race } from "./types";

// Builds an .ics calendar file for a race weekend's sessions and downloads it.
export function downloadWeekendIcs(race: Race) {
  const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "").replace(/Z?$/, "Z");
  const now = stamp(new Date().toISOString());
  const events = race.sessions.map((s) => {
    const start = new Date(s.start);
    const minutes = s.key === "Race" ? 120 : s.key === "Sprint" ? 60 : 60;
    const end = new Date(start.getTime() + minutes * 60_000);
    return [
      "BEGIN:VEVENT",
      `UID:f1live-${race.season}-${race.round}-${s.key}@f1live`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(start.toISOString())}`,
      `DTEND:${stamp(end.toISOString())}`,
      `SUMMARY:F1 ${s.name} · ${race.name}`,
      `LOCATION:${race.circuit.name}, ${race.circuit.locality}, ${race.circuit.country}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT15M",
      "ACTION:DISPLAY",
      `DESCRIPTION:${s.name} starts in 15 minutes`,
      "END:VALARM",
      "END:VEVENT",
    ].join("\r\n");
  });
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//F1 Live//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${race.season}-${race.name.replace(/\s+/g, "-")}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
