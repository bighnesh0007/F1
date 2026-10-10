"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Crown, Gift, Loader2, Lock, Plus, Receipt, Swords, Ticket, Trophy, Users, X } from "lucide-react";
import { api, useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { useTeamColour } from "@/lib/drivers";
import { countryFlag, localDay, localTime } from "@/lib/format";
import { teamById } from "@/lib/teams";
import { useNow } from "@/lib/useNow";
import type { Weekend } from "@/lib/types";
import type { Bet, LeaderboardEntry, League, Market, MarketOption, Markets } from "@/lib/types-user";
import { Card, Countdown, Empty, ErrorNote, Segmented, Skeleton, TeamBar, cn } from "@/components/ui";
import { Avatar, Coins } from "@/components/account/Avatar";

type Pick = { market: Market; option: MarketOption; stake: number };

export function PlayView() {
  const { user, setUser } = useAuth();
  const { data: weekend, error } = useApi<Weekend>("/api/weekend");
  const race = weekend?.current;
  const { data: markets } = useApi<Markets>(race ? `/api/game/markets/${race.season}/${race.round}` : null);
  const [slip, setSlip] = useState<Pick[]>([]);
  const [version, setVersion] = useState(0); // bumps after bets/bonus so lists refetch

  const toggle = (market: Market, option: MarketOption) => {
    setSlip((prev) => {
      const exists = prev.some((p) => p.market.key === market.key && p.option.id === option.id);
      return exists ? prev.filter((p) => !(p.market.key === market.key && p.option.id === option.id)) : [...prev, { market, option, stake: 50 }];
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Predict & play</h1>
          <p className="text-sm text-muted">Call the race, stake your Pit Coins, climb the leaderboard. Just for fun: coins have no cash value.</p>
        </div>
        {user ? (
          <div className="flex items-center gap-2">
            <DailyBonus lastClaimed={user.lastDailyBonus} onClaimed={(coins) => { setUser({ ...user, coins, lastDailyBonus: new Date().toISOString().slice(0, 10) }); setVersion((v) => v + 1); }} />
            <div className="rounded-2xl border border-line bg-surface px-4 py-2 shadow-card"><Coins value={user.coins} className="text-lg" /></div>
          </div>
        ) : (
          <Link href="/login?next=/play" className="rounded-xl bg-accent px-4 py-2 font-semibold text-accent-ink">Sign in to play</Link>
        )}
      </div>

      {error && !weekend && <ErrorNote message={error} />}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          {!markets ? (
            <Skeleton className="h-96 rounded-2xl" />
          ) : (
            <>
              <Card>
                <p className="text-xs font-semibold text-muted">Round {markets.round}</p>
                <p className="font-display text-2xl font-bold">{countryFlag(race?.circuit.country)} {markets.name}</p>
              </Card>
              <MarketList markets={markets} slip={slip} onToggle={toggle} />
            </>
          )}
        </div>
        <div className="space-y-4 lg:sticky lg:top-20">
          <BetSlip
            slip={slip}
            setSlip={setSlip}
            signedIn={Boolean(user)}
            onPlaced={(coins) => {
              if (user) setUser({ ...user, coins });
              setVersion((v) => v + 1);
            }}
            season={markets?.season}
            round={markets?.round}
          />
          {user && <MyBets version={version} />}
          <Leaderboards signedIn={Boolean(user)} version={version} />
        </div>
      </div>
    </div>
  );
}

function DailyBonus({ lastClaimed, onClaimed }: { lastClaimed: string | null; onClaimed: (coins: number) => void }) {
  const now = useNow(60_000);
  const [state, setState] = useState<"idle" | "busy" | { amount: number; streak: number }>("idle");
  const claimed = now != null && lastClaimed === new Date(now).toISOString().slice(0, 10);
  if (typeof state === "object") {
    return <span className="flex items-center gap-1.5 rounded-xl bg-good/15 px-3 py-2 text-sm font-semibold text-good"><Check size={15} /> +{state.amount} (day {state.streak})</span>;
  }
  return (
    <button
      disabled={claimed || state === "busy"}
      onClick={async () => {
        setState("busy");
        try {
          const r = await api<{ amount: number; streak: number; coins: number }>("/api/game/daily", { body: {} });
          setState(r);
          onClaimed(r.coins);
        } catch {
          setState("idle");
        }
      }}
      className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold shadow-card disabled:opacity-50"
    >
      <Gift size={15} className="text-accent" /> {claimed ? "Bonus claimed" : "Daily bonus"}
    </button>
  );
}

function MarketList({ markets, slip, onToggle }: { markets: Markets; slip: Pick[]; onToggle: (m: Market, o: MarketOption) => void }) {
  const now = useNow(30_000);
  const main = markets.markets.filter((m) => !m.key.startsWith("teammates:"));
  const teammates = markets.markets.filter((m) => m.key.startsWith("teammates:"));
  const [open, setOpen] = useState<string>("winner");
  const selected = (m: Market, o: MarketOption) => slip.some((p) => p.market.key === m.key && p.option.id === o.id);
  const locked = (m: Market) => now != null && now >= Date.parse(m.lockAt);

  return (
    <div className="space-y-3">
      {main.map((m) => {
        const isOpen = open === m.key;
        const closed = locked(m);
        return (
          <Card key={m.key} bodyClassName="p-0">
            <button onClick={() => setOpen(isOpen ? "" : m.key)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
              <div className="flex-1">
                <p className="font-display text-lg font-bold">{m.title}</p>
                <p className="text-xs text-muted">{m.hint}</p>
              </div>
              <span className="text-right text-xs text-muted">
                {closed ? (
                  <span className="flex items-center gap-1"><Lock size={12} /> Closed</span>
                ) : (
                  <>
                    Closes {now ? `${localDay(m.lockAt)} ${localTime(m.lockAt)}` : ""}
                    <br />
                    <span className="font-semibold text-ink"><Countdown to={m.lockAt} compact /></span>
                  </>
                )}
              </span>
              <ChevronDown size={18} className={cn("text-faint transition-transform", isOpen && "rotate-180")} />
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-3 xl:grid-cols-4">
                    {m.options.map((o) => (
                      <OptionButton key={o.id} option={o} selected={selected(m, o)} disabled={closed} onClick={() => onToggle(m, o)} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        );
      })}

      {teammates.length > 0 && (
        <Card title="Teammate battles" icon={<Swords size={15} />} right={<span className="text-xs text-faint">Who finishes ahead? · 1.9×</span>}>
          <div className="grid gap-2 sm:grid-cols-2">
            {teammates.map((m) => (
              <div key={m.key} className="rounded-xl bg-surface-2 p-2">
                <p className="mb-1.5 px-1 text-xs font-semibold text-muted">{m.team}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {m.options.map((o) => (
                    <OptionButton key={o.id} option={o} compact selected={selected(m, o)} disabled={locked(m)} onClick={() => onToggle(m, o)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function OptionButton({ option, selected, disabled, onClick, compact }: { option: MarketOption; selected: boolean; disabled: boolean; onClick: () => void; compact?: boolean }) {
  const teamColour = useTeamColour();
  const colour = option.team ? teamColour(option.team) : null;
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-all disabled:opacity-40",
        selected ? "border-accent bg-accent/10 ring-1 ring-accent" : "border-line bg-surface hover:border-line-strong",
      )}
    >
      {colour && <TeamBar colour={colour} className="h-7" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{option.code && !compact ? option.label : option.label.split(" ").slice(1).join(" ") || option.label}</span>
        {!compact && option.team && <span className="block truncate text-[11px] text-muted">{option.team}</span>}
      </span>
      <span className={cn("rounded-lg px-1.5 py-0.5 font-display text-sm font-bold tnum", selected ? "bg-accent text-accent-ink" : "bg-surface-2")}>{option.odds.toFixed(1)}×</span>
    </button>
  );
}

function BetSlip({ slip, setSlip, signedIn, onPlaced, season, round }: { slip: Pick[]; setSlip: (s: Pick[]) => void; signedIn: boolean; onPlaced: (coins: number) => void; season?: number; round?: number }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const total = slip.reduce((s, p) => s + (p.stake || 0), 0);
  const potential = slip.reduce((s, p) => s + Math.floor((p.stake || 0) * p.option.odds), 0);

  const place = async () => {
    setBusy(true);
    setMessage(null);
    let coins: number | null = null;
    const failed: Pick[] = [];
    let lastError = "";
    for (const p of slip) {
      try {
        const r = await api<{ coins: number }>("/api/game/bets", { body: { season, round, market: p.market.key, pick: p.option.id, stake: p.stake } });
        coins = r.coins;
      } catch (err) {
        failed.push(p);
        lastError = (err as Error).message;
      }
    }
    if (coins != null) onPlaced(coins);
    setSlip(failed);
    setMessage(failed.length ? { ok: false, text: lastError } : { ok: true, text: "Predictions locked in. Good luck! 🍀" });
    setBusy(false);
  };

  return (
    <Card title="Prediction slip" icon={<Ticket size={15} />} right={slip.length > 0 ? <button onClick={() => setSlip([])} className="text-xs text-muted hover:text-ink">Clear</button> : null}>
      {slip.length === 0 ? (
        <p className="text-sm text-muted">{message?.ok ? message.text : "Tap any pick to add it here."}</p>
      ) : (
        <div className="space-y-2">
          {slip.map((p, i) => (
            <div key={`${p.market.key}-${p.option.id}`} className="rounded-xl bg-surface-2 p-2.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.option.label}</p>
                  <p className="truncate text-xs text-muted">{p.market.title}{p.market.team ? ` · ${p.market.team}` : ""} · {p.option.odds.toFixed(1)}×</p>
                </div>
                <button onClick={() => setSlip(slip.filter((_, j) => j !== i))} className="text-faint hover:text-ink" aria-label="Remove"><X size={15} /></button>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                {[25, 50, 100, 250].map((v) => (
                  <button key={v} onClick={() => setSlip(slip.map((x, j) => (j === i ? { ...x, stake: v } : x)))} className={cn("rounded-lg px-2 py-1 text-xs font-semibold", p.stake === v ? "bg-accent text-accent-ink" : "bg-surface text-muted")}>
                    {v}
                  </button>
                ))}
                <input
                  inputMode="numeric"
                  value={p.stake || ""}
                  onChange={(e) => setSlip(slip.map((x, j) => (j === i ? { ...x, stake: Number(e.target.value.replace(/\D/g, "").slice(0, 4)) } : x)))}
                  className="tnum w-16 rounded-lg border border-line bg-surface px-2 py-1 text-right text-xs outline-none"
                  aria-label="Stake"
                />
              </div>
            </div>
          ))}
          <div className="flex justify-between pt-1 text-sm"><span className="text-muted">Total stake</span><Coins value={total} /></div>
          <div className="flex justify-between text-sm"><span className="text-muted">Potential return</span><Coins value={potential} className="text-good" /></div>
          {message && !message.ok && <p className="rounded-lg bg-red-500/10 px-2 py-1.5 text-xs text-red-500">{message.text}</p>}
          {signedIn ? (
            <button onClick={place} disabled={busy || total === 0} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 font-semibold text-accent-ink disabled:opacity-50">
              {busy && <Loader2 size={15} className="animate-spin" />} Lock in {slip.length} prediction{slip.length > 1 ? "s" : ""}
            </button>
          ) : (
            <Link href="/login?next=/play" className="block w-full rounded-xl bg-accent py-2.5 text-center font-semibold text-accent-ink">Sign in to lock in</Link>
          )}
        </div>
      )}
    </Card>
  );
}

const STATUS_STYLE = {
  open: "bg-surface-3 text-muted",
  won: "bg-good/15 text-good",
  lost: "bg-red-500/10 text-red-500",
  void: "bg-surface-3 text-muted",
};

function MyBets({ version }: { version: number }) {
  const { data: bets } = useApi<Bet[]>(`/api/game/bets?v=${version}`);
  return (
    <Card title="Your predictions" icon={<Receipt size={15} />}>
      {!bets ? (
        <Skeleton className="h-24" />
      ) : bets.length === 0 ? (
        <p className="text-sm text-muted">No predictions yet.</p>
      ) : (
        <ul className="scroll-thin -mr-2 max-h-72 space-y-1.5 overflow-y-auto pr-2">
          {bets.map((b) => (
            <li key={b._id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-2.5 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{b.pickLabel} <span className="font-normal text-muted">· {b.odds.toFixed(1)}×</span></p>
                <p className="truncate text-xs text-muted">{b.marketTitle} · {b.race.replace(" Grand Prix", " GP")}</p>
              </div>
              <div className="text-right">
                <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase", STATUS_STYLE[b.status])}>{b.status}</span>
                <p className="mt-0.5 text-xs tnum text-muted">{b.status === "won" ? `+${b.payout}` : b.status === "lost" ? `−${b.stake}` : `${b.stake}`}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Leaderboards({ signedIn, version }: { signedIn: boolean; version: number }) {
  const [tab, setTab] = useState<"global" | "leagues">("global");
  return (
    <Card
      title="Leaderboard"
      icon={<Trophy size={15} />}
      right={signedIn ? <Segmented size="sm" value={tab} onChange={setTab} options={[{ value: "global", label: "Everyone" }, { value: "leagues", label: "Leagues" }]} /> : null}
    >
      {tab === "global" ? <GlobalBoard version={version} /> : <Leagues />}
    </Card>
  );
}

function BoardList({ entries }: { entries: LeaderboardEntry[] }) {
  const { user } = useAuth();
  if (!entries.length) return <Empty title="No players yet">Be the first on the board!</Empty>;
  return (
    <ol className="space-y-1">
      {entries.slice(0, 20).map((e, i) => (
        <li key={e.handle}>
          <Link href={`/u/${e.handle}`} className={cn("flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface-2", user?.handle === e.handle && "bg-surface-2 ring-1 ring-accent/50")}>
            <span className="w-5 text-center font-display font-bold">{i === 0 ? <Crown size={15} className="mx-auto text-yellow" /> : i + 1}</span>
            <Avatar name={e.displayName} src={e.avatarUrl} team={e.team} size={28} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{e.displayName}</span>
              <span className="block truncate text-[11px] text-muted">{teamById(e.team)?.tribe ?? "No tribe yet"} · {e.won} won</span>
            </span>
            <Coins value={e.coins} className="text-sm" />
          </Link>
        </li>
      ))}
    </ol>
  );
}

function GlobalBoard({ version }: { version: number }) {
  const { data, error } = useApi<LeaderboardEntry[]>(`/api/game/leaderboard?v=${version}`);
  if (error && !data) return <p className="text-sm text-muted">{error}</p>;
  if (!data) return <Skeleton className="h-40" />;
  return <BoardList entries={data} />;
}

function Leagues() {
  const [version, setVersion] = useState(0);
  const { data: leagues } = useApi<League[]>(`/api/game/leagues?v=${version}`);
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const selected = useMemo(() => openCode ?? leagues?.[0]?.code ?? null, [openCode, leagues]);
  const { data: league } = useApi<{ code: string; name: string; members: LeaderboardEntry[] }>(selected ? `/api/game/leagues/${selected}?v=${version}` : null);

  const run = async (fn: () => Promise<{ code: string }>) => {
    setError(null);
    try {
      const r = await fn();
      setVersion((v) => v + 1);
      setOpenCode(r.code);
      setName("");
      setCode("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      {leagues && leagues.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {leagues.map((l) => (
            <button key={l.code} onClick={() => setOpenCode(l.code)} className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", selected === l.code ? "border-accent bg-accent/10" : "border-line text-muted")}>
              <Users size={11} className="mr-1 inline" />{l.name} · {l.members}
            </button>
          ))}
        </div>
      )}
      {league && (
        <div>
          <p className="mb-2 text-xs text-muted">Invite friends with code <b className="font-mono text-ink">{league.code}</b></p>
          <BoardList entries={league.members} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 border-t border-line pt-3">
        <form onSubmit={(e) => { e.preventDefault(); void run(() => api("/api/game/leagues", { body: { name } })); }} className="space-y-1.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="League name" maxLength={40} className="w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none" />
          <button disabled={!name.trim()} className="flex w-full items-center justify-center gap-1 rounded-lg bg-accent py-1.5 text-xs font-semibold text-accent-ink disabled:opacity-40"><Plus size={13} /> Create</button>
        </form>
        <form onSubmit={(e) => { e.preventDefault(); void run(() => api("/api/game/leagues/join", { body: { code } })); }} className="space-y-1.5">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Invite code" maxLength={6} className="w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm uppercase outline-none" />
          <button disabled={code.length < 6} className="w-full rounded-lg border border-line py-1.5 text-xs font-semibold disabled:opacity-40">Join</button>
        </form>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
