// Server-side helpers for talking to the F1 Node.js server.
// SERVER_URL is read at request time so one Docker image works in any environment.
const serverUrl = () => process.env.SERVER_URL || "http://localhost:4000";

export type Session = {
  session_key: number;
  session_name: string;
  session_type: string;
  date_start: string;
  date_end: string;
  status: "upcoming" | "live" | "finished";
};

export type Meeting = {
  meeting_key: number;
  meeting_name: string;
  meeting_official_name: string;
  location: string;
  country_name: string;
  circuit_short_name: string;
  date_start: string;
};

export type Weekend = { meeting: Meeting; sessions: Session[] };

export async function getWeekend(): Promise<Weekend> {
  const res = await fetch(`${serverUrl()}/api/weekend`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server responded ${res.status}`);
  }
  return res.json();
}
