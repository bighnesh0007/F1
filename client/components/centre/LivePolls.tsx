"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Vote } from "lucide-react";
import { api } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import type { Poll } from "@/lib/types-user";
import { Card, cn } from "@/components/ui";

// A random id per device, used for votes only when sign-in isn't set up.
const DEVICE_KEY = "f1live.device";
function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}
const noop = () => () => {};

export function LivePolls() {
  const device = useSyncExternalStore(noop, deviceId, () => "");
  const [version, setVersion] = useState(0);
  const { data } = useApi<{ polls: Poll[]; signInRequired: boolean }>(device ? `/api/polls/live?device=${device}&v=${version}` : null, { refreshMs: 8000, keepPrevious: true });
  const [error, setError] = useState<string | null>(null);
  const polls = data?.polls ?? [];
  if (!polls.length) return null;

  const vote = async (poll: Poll, option: string) => {
    setError(null);
    try {
      await api(`/api/polls/${poll.kind}/vote`, { body: { option, device } });
      setVersion((v) => v + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Card title="Fan polls" icon={<Vote size={15} />}>
      <div className="grid gap-4 md:grid-cols-2">
        {polls.map((p) => (
          <PollView key={p.id} poll={p} onVote={(o) => vote(p, o)} />
        ))}
      </div>
      {data?.signInRequired && <p className="mt-3 text-xs text-muted">Sign in to vote.</p>}
      {error && <p role="alert" className="mt-2 text-xs text-bad">{error}</p>}
    </Card>
  );
}

function PollView({ poll, onVote }: { poll: Poll; onVote: (o: string) => void }) {
  const [all, setAll] = useState(false);
  const ranked = [...poll.options].sort((a, b) => (poll.results[b.id] ?? 0) - (poll.results[a.id] ?? 0));
  const shown = all || !poll.total ? ranked : ranked.slice(0, 6);
  return (
    <section>
      <p className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold">
        {poll.question}
        <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase", poll.open ? "bg-good/15 text-good" : "bg-surface-3 text-muted")}>{poll.open ? "Voting open" : "Closed"}</span>
      </p>
      <ul className={cn("space-y-1", !poll.total && "grid grid-cols-4 gap-1 space-y-0 sm:grid-cols-5")}>
        {shown.map((o) => {
          const n = poll.results[o.id] ?? 0;
          const pct = poll.total ? Math.round((n / poll.total) * 100) : 0;
          const mine = poll.myVote === o.id;
          return (
            <li key={o.id}>
              <button
                disabled={!poll.open}
                onClick={() => onVote(o.id)}
                aria-pressed={mine}
                className={cn("relative flex w-full items-center gap-2 overflow-hidden rounded-lg border px-2 py-1 text-left text-xs disabled:cursor-default", mine ? "border-accent" : "border-line hover:bg-surface-2")}
              >
                {poll.total > 0 && <span className="absolute inset-y-0 left-0 opacity-25" style={{ width: `${pct}%`, background: o.colour ? `#${o.colour}` : "var(--accent)" }} />}
                <span className="relative font-display font-bold">{o.label}</span>
                {mine && <Check size={12} className="relative text-accent" />}
                {poll.total > 0 && <span className="tnum relative ml-auto text-muted">{pct}%</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {poll.total > 0 && (
        <p className="mt-1.5 flex justify-between text-[11px] text-muted">
          <span>{poll.total} vote{poll.total === 1 ? "" : "s"}</span>
          {ranked.length > 6 && <button onClick={() => setAll((v) => !v)} className="font-semibold hover:text-ink">{all ? "Top 6" : "All drivers"}</button>}
        </p>
      )}
    </section>
  );
}
