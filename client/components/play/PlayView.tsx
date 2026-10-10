"use client";

import { useT } from "@/lib/i18n";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Brain, Check, ChevronDown, Crown, History, Loader2, Lock, Plus, Swords, Target, Trophy, Users } from "lucide-react";
import { api, useAuth } from "@/lib/auth";
import { clerkEnabled } from "@/lib/clerk";
import { useApi } from "@/lib/useApi";
import { useTeamColour } from "@/lib/drivers";
import { countryFlag, localDay, localTime } from "@/lib/format";
import { teamById } from "@/lib/teams";
import { useNow } from "@/lib/useNow";
import type { Weekend } from "@/lib/types";
import type { LeaderboardEntry, League, Market, MarketOption, Markets, Prediction, TribeScore } from "@/lib/types-user";
import { Card, Countdown, Empty, ErrorNote, Segmented, Skeleton, TeamBar, cn } from "@/components/ui";
import { Avatar, Points } from "@/components/account/Avatar";
import { SignInCta } from "@/components/account/ClerkControls";
import { FantasyView } from "./FantasyView";
import { QuizView } from "./QuizView";
import { FantasyBoard, FriendsBoard, FriendsFeed, ShareButton } from "./Social";

type Mode = "predict" | "fantasy" | "quiz";
const TITLES: Record<Mode, { title: string; text: string }> = {
  predict: { title: "Predict the race", text: "Call the weekend, score points for every correct call, and climb the rankings. Bolder calls score more." },
  fantasy: { title: "Fantasy team", text: "Build a team of five drivers and two constructors within budget. Real results, real points." },
  quiz: { title: "Weekly quiz", text: "Five questions from F1 history, new every week, for extra points." },
};

export function PlayView() {
  const t = useT();
  const { user } = useAuth();
  const { data: weekend, error } = useApi<Weekend>("/api/weekend");
  const race = weekend?.current;
  const { data: markets } = useApi<Markets>(race ? `/api/game/markets/${race.season}/${race.round}` : null);
  const [version, setVersion] = useState(0); // bumps after a pick so lists refetch
  const { data: picks } = useApi<Prediction[]>(user && race ? `/api/game/predictions?season=${race.season}&round=${race.round}&v=${version}` : null);
  const [local, setLocal] = useState<Record<string, string | null>>({}); // optimistic picks by market
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("predict");

  const picked = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of picks ?? []) out[p.market] = p.pick;
    for (const [m, v] of Object.entries(local)) {
      if (v === null) delete out[m];
      else out[m] = v;
    }
    return out;
  }, [picks, local]);

  const choose = async (market: Market, option: MarketOption) => {
    if (!user || !markets) return;
    const removing = picked[market.key] === option.id;
    setLocal((l) => ({ ...l, [market.key]: removing ? null : option.id }));
    setSaving(market.key);
    setMessage(null);
    try {
      if (removing) await api("/api/game/predictions", { method: "DELETE", body: { season: markets.season, round: markets.round, market: market.key } });
      else await api("/api/game/predictions", { method: "PUT", body: { season: markets.season, round: markets.round, market: market.key, pick: option.id } });
      setVersion((v) => v + 1);
    } catch (err) {
      setLocal((l) => {
        const next = { ...l };
        delete next[market.key];
        return next;
      });
      setMessage((err as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const total = markets?.markets.length ?? 0;
  const made = Object.keys(picked).length;
  const potential = markets ? markets.markets.reduce((s, m) => s + (m.options.find((o) => o.id === picked[m.key])?.points ?? 0), 0) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">{t(TITLES[mode].title)}</h1>
          <p className="text-sm text-muted">{t(TITLES[mode].text)}</p>
        </div>
        {user ? (
          <div className="rounded-2xl border border-line bg-surface px-4 py-2 shadow-card">
            <p className="text-[11px] font-semibold text-muted">{t("Your points")}</p>
            <Points value={user.points} className="text-lg" />
          </div>
        ) : clerkEnabled ? (
          <SignInCta />
        ) : null}
      </div>

      <div className="[&>div]:flex [&>div]:w-full [&_button]:flex-1 sm:[&>div]:inline-flex sm:[&>div]:w-auto">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "predict", label: <span className="flex items-center justify-center gap-1.5"><Target size={14} /> {t("Predict")}</span> },
            { value: "fantasy", label: <span className="flex items-center justify-center gap-1.5"><Users size={14} /> {t("Fantasy")}</span> },
            { value: "quiz", label: <span className="flex items-center justify-center gap-1.5"><Brain size={14} /> {t("Quiz")}</span> },
          ]}
        />
      </div>

      {error && !weekend && <ErrorNote message={error} />}
      {message && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-500">{message}</p>}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          {mode === "fantasy" ? (
            race ? <FantasyView season={race.season} round={race.round} /> : <Skeleton className="h-96 rounded-2xl" />
          ) : mode === "quiz" ? (
            <QuizView />
          ) : !markets ? (
            <Skeleton className="h-96 rounded-2xl" />
          ) : (
            <>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-muted">Round {markets.round}</p>
                    <p className="font-display text-2xl font-bold">{countryFlag(race?.circuit.country)} {markets.name}</p>
                  </div>
                  {user && (
                    <div className="text-right text-sm">
                      <p className="font-semibold">{made} of {total} calls made</p>
                      <p className="text-xs text-muted">Up to {potential} points if they all land</p>
                    </div>
                  )}
                </div>
                {!user && <p className="mt-2 text-sm text-muted">{clerkEnabled ? "Sign in to lock in your calls." : "Sign-in isn't set up on this server yet."}</p>}
              </Card>
              <MarketList markets={markets} picked={picked} saving={saving} canPick={Boolean(user)} onChoose={choose} />
            </>
          )}
        </div>
        <div className="space-y-4 lg:sticky lg:top-20">
          <Rankings signedIn={Boolean(user)} version={version} season={race?.season ?? null} initial={mode === "fantasy" ? "fantasy" : "everyone"} key={mode} />
          {user && mode === "predict" && <HistoryCard version={version} />}
          {user && <FriendsFeed />}
        </div>
      </div>
    </div>
  );
}

function MarketList({ markets, picked, saving, canPick, onChoose }: { markets: Markets; picked: Record<string, string>; saving: string | null; canPick: boolean; onChoose: (m: Market, o: MarketOption) => void }) {
  const now = useNow(30_000);
  const main = markets.markets.filter((m) => !m.key.startsWith("teammates:"));
  const teammates = markets.markets.filter((m) => m.key.startsWith("teammates:"));
  const [open, setOpen] = useState<string>("winner");
  const locked = (m: Market) => now != null && now >= Date.parse(m.lockAt);

  return (
    <div className="space-y-3">
      {main.map((m) => {
        const isOpen = open === m.key;
        const closed = locked(m);
        const mine = m.options.find((o) => o.id === picked[m.key]);
        return (
          <Card key={m.key} bodyClassName="p-0">
            <button onClick={() => setOpen(isOpen ? "" : m.key)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-bold">{m.title}</p>
                <p className="truncate text-xs text-muted">
                  {mine ? (
                    <span className="font-semibold text-accent">
                      <Check size={12} className="mr-0.5 inline" />
                      {mine.label} · {mine.points} pts
                    </span>
                  ) : (
                    m.hint
                  )}
                </p>
              </div>
              {saving === m.key && <Loader2 size={15} className="animate-spin text-muted" />}
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
                      <OptionButton key={o.id} option={o} selected={picked[m.key] === o.id} disabled={closed || !canPick} onClick={() => onChoose(m, o)} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        );
      })}

      {teammates.length > 0 && (
        <Card title="Teammate battles" icon={<Swords size={15} />} right={<span className="text-xs text-faint">Who finishes ahead? · 15 pts each</span>}>
          <div className="grid gap-2 sm:grid-cols-2">
            {teammates.map((m) => (
              <div key={m.key} className="rounded-xl bg-surface-2 p-2">
                <p className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-muted">
                  {m.team}
                  {saving === m.key && <Loader2 size={12} className="animate-spin" />}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {m.options.map((o) => (
                    <OptionButton key={o.id} option={o} compact selected={picked[m.key] === o.id} disabled={locked(m) || !canPick} onClick={() => onChoose(m, o)} />
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
  const name = compact ? option.label.split(" ").slice(1).join(" ") || option.label : option.label;
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-all disabled:cursor-not-allowed",
        selected ? "border-accent bg-accent/10 ring-1 ring-accent" : "border-line bg-surface hover:border-line-strong",
        disabled && !selected && "opacity-50",
      )}
    >
      {colour && <TeamBar colour={colour} className="h-7" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{name}</span>
        {!compact && option.team && <span className="block truncate text-[11px] text-muted">{option.team}</span>}
      </span>
      <span className={cn("rounded-lg px-1.5 py-0.5 font-display text-xs font-bold tnum", selected ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted")}>
        {selected ? <Check size={12} className="inline" /> : `+${option.points}`}
      </span>
    </button>
  );
}

const STATUS_STYLE: Record<Prediction["status"], string> = {
  open: "bg-surface-3 text-muted",
  correct: "bg-good/15 text-good",
  wrong: "bg-red-500/10 text-red-500",
  void: "bg-surface-3 text-muted",
};

function HistoryCard({ version }: { version: number }) {
  const { data } = useApi<Prediction[]>(`/api/game/predictions?v=${version}`);
  const past = (data ?? []).filter((p) => p.status !== "open");
  return (
    <Card title="Your results" icon={<History size={15} />}>
      {!data ? (
        <Skeleton className="h-24" />
      ) : past.length === 0 ? (
        <p className="text-sm text-muted">Scored predictions appear here after each session.</p>
      ) : (
        <ul className="scroll-thin -mr-2 max-h-72 space-y-1.5 overflow-y-auto pr-2">
          {past.map((p) => (
            <li key={p._id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-2.5 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.pickLabel}</p>
                <p className="truncate text-xs text-muted">{p.marketTitle} · {p.race.replace(" Grand Prix", " GP")}</p>
              </div>
              <div className="text-right">
                <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase", STATUS_STYLE[p.status])}>{p.status}</span>
                <p className="mt-0.5 text-xs tnum text-muted">{p.status === "correct" ? `+${p.earned}` : "0"}</p>
                {p.status === "correct" && <ShareButton url={`/c/${p._id}`} title={`I called ${p.pickLabel}!`} className="-mr-2" />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type RankTab = "everyone" | "friends" | "tribes" | "fantasy" | "leagues";

function Rankings({ signedIn, version, season, initial }: { signedIn: boolean; version: number; season: number | null; initial: RankTab }) {
  const [tab, setTab] = useState<RankTab>(initial);
  const options = [
    { value: "everyone" as const, label: "All" },
    ...(signedIn ? [{ value: "friends" as const, label: "Friends" }] : []),
    { value: "tribes" as const, label: "Tribes" },
    { value: "fantasy" as const, label: "Fantasy" },
    ...(signedIn ? [{ value: "leagues" as const, label: "Leagues" }] : []),
  ];
  return (
    <Card title="Rankings" icon={<Trophy size={15} />}>
      <div className="scroll-thin -mx-1 mb-3 overflow-x-auto px-1 [&>div]:flex [&>div]:w-full [&_button]:flex-1">
        <Segmented size="sm" value={tab} onChange={setTab} options={options} />
      </div>
      {tab === "everyone" && <GlobalBoard version={version} />}
      {tab === "friends" && <FriendsBoard />}
      {tab === "tribes" && <TribeBoard />}
      {tab === "fantasy" && (season ? <FantasyBoard season={season} /> : <Skeleton className="h-40" />)}
      {tab === "leagues" && <Leagues />}
    </Card>
  );
}

function BoardList({ entries }: { entries: LeaderboardEntry[] }) {
  const { user } = useAuth();
  if (!entries.length) return <Empty title="No players yet">Be the first on the board!</Empty>;
  return (
    <ol className="space-y-1">
      {entries.slice(0, 25).map((e, i) => (
        <li key={e.handle}>
          <Link href={`/u/${e.handle}`} className={cn("flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface-2", user?.handle === e.handle && "bg-surface-2 ring-1 ring-accent/50")}>
            <span className="w-5 text-center font-display font-bold">{i === 0 ? <Crown size={15} className="mx-auto text-yellow" /> : i + 1}</span>
            <Avatar name={e.displayName} src={e.avatarUrl} team={e.team} size={28} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{e.displayName}</span>
              <span className="block truncate text-[11px] text-muted">{teamById(e.team)?.tribe ?? "No tribe yet"} · {e.correct}/{e.picks} correct</span>
            </span>
            <Points value={e.points} className="text-sm" />
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

function TribeBoard() {
  const { data, error } = useApi<TribeScore[]>("/api/game/tribes");
  if (error && !data) return <p className="text-sm text-muted">{error}</p>;
  if (!data) return <Skeleton className="h-40" />;
  if (!data.length) return <Empty title="No tribes yet">Pick your team on your profile to represent them here.</Empty>;
  const max = data[0].points || 1;
  return (
    <ol className="space-y-2">
      {data.map((t, i) => {
        const team = teamById(t.team);
        return (
          <li key={t.team}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-semibold">
                <span className="w-4 text-xs text-faint">{i + 1}</span>
                <span className="h-3 w-3 rounded-full" style={{ background: `#${team?.colour ?? "888"}` }} />
                {team?.tribe ?? t.team}
              </span>
              <span className="text-xs text-muted">{t.fans} fan{t.fans === 1 ? "" : "s"} · avg {t.average}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, (t.points / max) * 100)}%`, background: `#${team?.colour ?? "888"}` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Leagues() {
  const [version, setVersion] = useState(0);
  const { data: leagues } = useApi<League[]>(`/api/game/leagues?v=${version}`);
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const selected = openCode ?? leagues?.[0]?.code ?? null;
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
      {league ? (
        <div>
          <p className="mb-2 text-xs text-muted">Invite friends with code <b className="font-mono text-ink">{league.code}</b></p>
          <BoardList entries={league.members} />
        </div>
      ) : (
        leagues?.length === 0 && <p className="flex items-center gap-2 text-sm text-muted"><Target size={14} /> Start a league and share the code with friends.</p>
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
