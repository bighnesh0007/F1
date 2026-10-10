"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CalendarPlus, Check, ChevronDown, Copy, ExternalLink, Loader2, PartyPopper, Rss, Download, Video } from "lucide-react";
import { api, useAuth } from "@/lib/auth";
import { downloadWeekendIcs } from "@/lib/ics";
import { localDay, localTime } from "@/lib/format";
import type { Race } from "@/lib/types";
import { Sheet, cn } from "@/components/ui";

const DURATION_MIN: Record<string, number> = { Race: 120, Sprint: 60 };
const gcalDate = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// A Google Calendar "add event" link: works for anyone, no sign-in needed.
export function googleTemplateLink(race: Race, sessionKey = "Race") {
  const s = race.sessions.find((x) => x.key === sessionKey) ?? race.sessions.at(-1)!;
  const start = Date.parse(s.start);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `F1 ${s.name} · ${race.name}`,
    dates: `${gcalDate(start)}/${gcalDate(start + (DURATION_MIN[s.key] ?? 60) * 60_000)}`,
    location: `${race.circuit.name}, ${race.circuit.locality}, ${race.circuit.country}`,
    details: `Round ${race.round} of the ${race.season} season.`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export function CalendarMenu({ race, variant = "button" }: { race: Race; variant?: "button" | "icon" }) {
  const { user, googleAvailable } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [party, setParty] = useState(false);
  const [status, setStatus] = useState<{ busy?: boolean; text?: string; ok?: boolean }>({});
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const connected = Boolean(user?.google.calendar);
  const connectHref = `/api/auth/google?calendar=1&next=${encodeURIComponent(pathname)}`;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const sync = async (all: boolean) => {
    setStatus({ busy: true });
    try {
      const r = await api<{ added: number }>("/api/calendar/google/sync", { body: { season: race.season, round: race.round, all } });
      setStatus({ ok: true, text: `Added ${r.added} session${r.added === 1 ? "" : "s"} to Google Calendar` });
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message });
    }
  };

  const feedUrl = typeof window !== "undefined" ? `${window.location.host}/api/calendar/feed.ics` : "";
  const item = "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm hover:bg-surface-2";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={cn(
          variant === "icon"
            ? "rounded-lg p-1 text-faint hover:bg-surface-2 hover:text-ink"
            : "flex w-full items-center justify-center gap-2 rounded-xl border border-line py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-ink",
        )}
        title="Add to calendar"
      >
        <CalendarPlus size={variant === "icon" ? 15 : 15} />
        {variant === "button" && (
          <>
            Add to calendar <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
          </>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className={cn("absolute z-30 mt-2 w-80 rounded-2xl border border-line bg-surface p-2 shadow-2xl", variant === "icon" ? "right-0" : "left-1/2 -translate-x-1/2")}
          >
            <p className="px-3 pt-1 pb-2 text-xs font-semibold text-faint">GOOGLE CALENDAR</p>
            {connected ? (
              <>
                <button disabled={status.busy} onClick={() => sync(false)} className={item}>
                  <CalendarPlus size={16} className="text-accent" /> Add all {race.sessions.length} sessions this weekend
                </button>
                <button disabled={status.busy} onClick={() => sync(true)} className={item}>
                  <CalendarPlus size={16} className="text-accent" /> Add every remaining race weekend
                </button>
              </>
            ) : googleAvailable ? (
              <a href={user ? connectHref : `${connectHref}`} className={item}>
                <CalendarPlus size={16} className="text-accent" />
                <span>
                  {user ? "Connect Google Calendar" : "Sign in with Google"}
                  <span className="block text-xs text-muted">Then add whole weekends in one tap</span>
                </span>
              </a>
            ) : null}
            <a href={googleTemplateLink(race)} target="_blank" rel="noreferrer" className={item}>
              <ExternalLink size={16} className="text-faint" />
              <span>
                Open the race in Google Calendar
                <span className="block text-xs text-muted">{localDay(race.date)}, {localTime(race.date)} · no account needed</span>
              </span>
            </a>
            <button onClick={() => { setParty(true); setOpen(false); }} className={item}>
              <PartyPopper size={16} className="text-accent" />
              <span>
                Plan a watch party
                <span className="block text-xs text-muted">Invite friends, with a Google Meet link</span>
              </span>
            </button>
            {status.text && (
              <p className={cn("mx-2 my-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs", status.ok ? "bg-good/15 text-good" : "bg-red-500/10 text-red-500")}>
                {status.ok && <Check size={13} />} {status.text}
              </p>
            )}
            {status.busy && <p className="flex items-center gap-1.5 px-3 py-1 text-xs text-muted"><Loader2 size={13} className="animate-spin" /> Adding…</p>}

            <p className="mt-1 border-t border-line px-3 pt-3 pb-2 text-xs font-semibold text-faint">OTHER CALENDARS</p>
            <button onClick={() => downloadWeekendIcs(race)} className={item}>
              <Download size={16} className="text-faint" /> Apple / Outlook (.ics file)
            </button>
            <button
              onClick={async () => {
                await navigator.clipboard?.writeText(`webcal://${feedUrl}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className={item}
            >
              {copied ? <Check size={16} className="text-good" /> : <Rss size={16} className="text-faint" />}
              <span>
                {copied ? "Link copied" : "Subscribe to the whole season"}
                <span className="block text-xs text-muted">Copies a feed link that stays up to date</span>
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <WatchPartySheet race={race} open={party} onClose={() => setParty(false)} connected={connected} connectHref={connectHref} googleAvailable={googleAvailable} signedIn={Boolean(user)} />
    </div>
  );
}

function WatchPartySheet({ race, open, onClose, connected, connectHref, googleAvailable, signedIn }: { race: Race; open: boolean; onClose: () => void; connected: boolean; connectHref: string; googleAvailable: boolean; signedIn: boolean }) {
  const [session, setSession] = useState(race.sessions.at(-1)?.key ?? "Race");
  const [guests, setGuests] = useState("");
  const [early, setEarly] = useState(30);
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [meet, setMeet] = useState(true);
  const [result, setResult] = useState<{ link: string; meet: string | null; invited: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = "w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(
        await api("/api/calendar/google/watch-party", {
          body: { season: race.season, round: race.round, session, guests: guests.split(/[\s,;]+/).filter(Boolean), minutesBefore: early, location, note, meet },
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Plan a watch party">
      {!connected ? (
        <div className="space-y-3 text-sm">
          <p>Watch parties are created in your Google Calendar: friends get an invite, and there&apos;s a Google Meet link if you&apos;re watching apart.</p>
          {googleAvailable ? (
            <a href={connectHref} className="inline-block rounded-xl bg-accent px-4 py-2 font-semibold text-accent-ink">
              {signedIn ? "Connect Google Calendar" : "Sign in with Google"}
            </a>
          ) : (
            <p className="text-muted">Google sign-in isn&apos;t set up on this server yet (see the README).</p>
          )}
        </div>
      ) : result ? (
        <div className="space-y-3 text-center">
          <PartyPopper size={40} className="mx-auto text-accent" />
          <p className="font-display text-2xl font-bold">Party planned!</p>
          <p className="text-sm text-muted">{result.invited ? `${result.invited} invite${result.invited > 1 ? "s" : ""} sent.` : "It's in your calendar."}</p>
          <div className="flex flex-col gap-2">
            <a href={result.link} target="_blank" rel="noreferrer" className="rounded-xl bg-accent px-4 py-2 font-semibold text-accent-ink">Open in Google Calendar</a>
            {result.meet && <a href={result.meet} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl border border-line px-4 py-2 font-semibold"><Video size={16} /> Google Meet link</a>}
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Session</span>
            <select className={input} value={session} onChange={(e) => setSession(e.target.value)}>
              {race.sessions.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name} · {localDay(s.start)} {localTime(s.start)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Friends to invite</span>
            <textarea className={cn(input, "min-h-20")} placeholder="Email addresses, separated by commas or spaces" value={guests} onChange={(e) => setGuests(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Start</span>
            <select className={input} value={early} onChange={(e) => setEarly(Number(e.target.value))}>
              {[0, 15, 30, 60].map((m) => <option key={m} value={m}>{m ? `${m} minutes before lights out` : "At the session start"}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Where (optional)</span>
            <input className={input} placeholder="e.g. My place, or the pub on the corner" value={location} onChange={(e) => setLocation(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Note (optional)</span>
            <input className={input} placeholder="Bring snacks. Wear papaya." value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={meet} onChange={(e) => setMeet(e.target.checked)} className="accent-[var(--accent)]" /> Add a Google Meet link
          </label>
          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>}
          <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 font-semibold text-accent-ink disabled:opacity-60">
            {busy && <Loader2 size={15} className="animate-spin" />} Create watch party
          </button>
          <p className="text-xs text-faint"><Copy size={11} className="mr-1 inline" />Guests get an email invite from Google Calendar.</p>
        </form>
      )}
    </Sheet>
  );
}
