import { Suspense } from "react";
import { connection } from "next/server";
import { getWeekend, type Session } from "@/lib/api";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">
        F1 <span className="text-red-500">Live</span>
      </h1>
      <p className="mt-1 text-sm text-neutral-400">
        Real race data from OpenF1. The live track map is coming next.
      </p>
      <Suspense fallback={<p className="mt-8 text-neutral-400">Loading race weekend…</p>}>
        <Weekend />
      </Suspense>
    </main>
  );
}

async function Weekend() {
  await connection();

  let weekend;
  try {
    weekend = await getWeekend();
  } catch (err) {
    return (
      <p className="mt-8 rounded-lg border border-red-900 bg-red-950/40 p-4 text-red-300">
        Could not load race data: {(err as Error).message}
      </p>
    );
  }

  const { meeting, sessions } = weekend;
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold">{meeting.meeting_name}</h2>
      <p className="text-sm text-neutral-400">
        {meeting.circuit_short_name} · {meeting.location}, {meeting.country_name}
      </p>
      <ul className="mt-6 divide-y divide-neutral-800 rounded-lg border border-neutral-800">
        {sessions.map((s) => (
          <SessionRow key={s.session_key} session={s} />
        ))}
      </ul>
    </section>
  );
}

const statusStyles: Record<Session["status"], string> = {
  live: "bg-red-600 text-white",
  upcoming: "bg-neutral-800 text-neutral-300",
  finished: "bg-neutral-900 text-neutral-500",
};

function SessionRow({ session }: { session: Session }) {
  const start = new Date(session.date_start);
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div>
        <p className="font-medium">{session.session_name}</p>
        <p className="text-sm text-neutral-400">
          {start.toLocaleString("en-GB", {
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
      <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${statusStyles[session.status]}`}>
        {session.status}
      </span>
    </li>
  );
}
