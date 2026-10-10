import { connection } from "next/server";
import { getWeekend, type Session } from "@/lib/api";
import { Panel } from "./LiveDashboard";

const statusStyles: Record<Session["status"], string> = {
  live: "bg-red-600 text-white",
  upcoming: "bg-neutral-800 text-neutral-300",
  finished: "bg-neutral-900 text-neutral-500",
};

export async function WeekendPanel() {
  await connection();
  let weekend;
  try {
    weekend = await getWeekend();
  } catch (err) {
    return (
      <Panel title="Race weekend">
        <p className="text-sm text-red-300">Could not load the schedule: {(err as Error).message}</p>
      </Panel>
    );
  }

  const { meeting, sessions } = weekend;
  return (
    <Panel title="Race weekend">
      <p className="font-semibold">{meeting.meeting_name}</p>
      <p className="text-sm text-neutral-400">
        {meeting.circuit_short_name} · {meeting.location}, {meeting.country_name}
      </p>
      <ul className="mt-3 divide-y divide-neutral-900">
        {sessions.map((s) => (
          <li key={s.session_key} className="flex items-center justify-between gap-4 py-2 text-sm">
            <div>
              <p className="font-medium">{s.session_name}</p>
              <p className="text-xs text-neutral-500">
                {new Date(s.date_start).toLocaleString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "UTC",
                  timeZoneName: "short",
                })}
              </p>
            </div>
            <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${statusStyles[s.status]}`}>{s.status}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
