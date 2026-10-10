"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Award, CalendarCheck2, Check, Copy, Crown, Gift, Loader2, Lock, LogOut, Settings2, Sparkles, Trash2, Trophy, Wallet } from "lucide-react";
import { api, useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { useDrivers } from "@/lib/drivers";
import { readableInk, useSettings } from "@/lib/settings";
import { QUIZ, TEAMS, scoreQuiz, teamById, type Team } from "@/lib/teams";
import type { Badge, User } from "@/lib/types-user";
import { Card, Sheet, Skeleton, cn } from "@/components/ui";
import { Avatar, Points } from "./Avatar";
import { clerkEnabled } from "@/lib/clerk";
import { ConnectGoogleCalendarButton, useClerkActions } from "./ClerkControls";

export function ProfileView() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace("/sign-in");
  }, [loading, user, router]);
  if (!user) return <Skeleton className="h-72 rounded-3xl" />;
  return <Profile user={user} />;
}

function Profile({ user }: { user: User }) {
  const params = useSearchParams();
  const { setUser } = useAuth();
  const { update } = useSettings();
  const { data: profile } = useApi<{ badges: Badge[] }>(`/api/profile?v=${user.points}-${user.profile.team}-${user.profile.quizResult}-${user.google.calendar}`);
  const [quizOpen, setQuizOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(params.get("calendar") === "connected" ? "Google Calendar connected" : params.get("calendar") === "denied" ? "Calendar access wasn't granted" : null);
  const team = teamById(user.profile.team);
  const welcome = params.get("welcome") === "1" && !team;

  const save = async (patch: Record<string, unknown>) => {
    const { user: updated } = await api<{ user: User }>("/api/profile", { method: "PATCH", body: patch });
    setUser(updated);
    return updated;
  };

  const chooseTeam = async (t: Team) => {
    await save({ team: t.id });
    // Theme the app in the tribe's colours unless a favourite driver already does.
    update({ favouriteTeamColour: t.colour, teamAccent: true });
    setNotice(`Welcome to the ${t.tribe}!`);
  };

  return (
    <div className="space-y-4">
      <AnimatePresence>
        {notice && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center justify-between rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink">
            {notice}
            <button onClick={() => setNotice(null)} className="opacity-80 hover:opacity-100">Dismiss</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-line shadow-card" style={{ background: team ? `linear-gradient(120deg, #${team.colour}, #${team.colour}55 55%, var(--surface))` : "var(--surface)" }}>
        <div className="relative flex flex-wrap items-end gap-4 p-5 sm:p-7">
          <Avatar name={user.displayName} src={user.avatarUrl} team={user.profile.team} size={84} className="ring-4 ring-surface" />
          <div className="min-w-0 flex-1">
            {team && <p className="text-sm font-semibold opacity-90" style={{ color: readableInk(`#${team.colour}`) }}>{team.tribe}</p>}
            <h1 className="truncate font-display text-3xl font-bold sm:text-4xl" style={team ? { color: readableInk(`#${team.colour}`) } : undefined}>{user.displayName}</h1>
            <p className={cn("text-sm", team ? "opacity-75" : "text-muted")} style={team ? { color: readableInk(`#${team.colour}`) } : undefined}>@{user.handle} · fan since {user.profile.fanSince ?? new Date(user.createdAt).getFullYear()}</p>
          </div>
          <div className="rounded-2xl bg-surface/90 px-4 py-2.5 text-right shadow-card backdrop-blur">
            <p className="text-[11px] font-semibold text-muted">Points</p>
            <Points value={user.points} className="text-xl" />
          </div>
        </div>
      </section>

      {welcome && (
        <Card>
          <p className="font-display text-xl font-bold">Welcome to the grid, {user.displayName.split(" ")[0]}! 🏁</p>
          <p className="text-sm text-muted">First things first: which team do you ride with? Pick a tribe below, or let the quiz decide.</p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card
            title="Your tribe"
            icon={<Sparkles size={15} />}
            right={
              <button onClick={() => setQuizOpen(true)} className="rounded-lg px-2 py-1 text-xs font-semibold text-accent hover:bg-surface-2">
                {user.profile.quizResult ? "Retake quiz" : "Which team are you?"}
              </button>
            }
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TEAMS.map((t) => {
                const selected = t.id === user.profile.team;
                return (
                  <button
                    key={t.id}
                    onClick={() => chooseTeam(t)}
                    className={cn("group relative overflow-hidden rounded-2xl border p-3 text-left transition-all hover:-translate-y-0.5", selected ? "border-transparent ring-2" : "border-line hover:border-line-strong")}
                    style={selected ? { boxShadow: `0 0 0 2px #${t.colour}` } : undefined}
                  >
                    <span className="absolute inset-x-0 top-0 h-1" style={{ background: `#${t.colour}` }} />
                    <span className="block font-display font-bold">{t.tribe}</span>
                    <span className="block text-xs text-muted">{t.name}</span>
                    {selected && <Check size={16} className="absolute top-3 right-3" style={{ color: `#${t.colour}` }} />}
                  </button>
                );
              })}
            </div>
            {team && <p className="mt-3 text-sm text-muted">&ldquo;{team.vibe}&rdquo;</p>}
          </Card>

          <AboutForm user={user} save={save} />
        </div>

        <div className="space-y-4">
          <StatsCard user={user} />
          <Card title="Badges" icon={<Award size={15} />} right={<span className="text-xs text-faint">{profile?.badges.filter((b) => b.earned).length ?? 0}/{profile?.badges.length ?? 0}</span>}>
            {!profile ? (
              <Skeleton className="h-40" />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {profile.badges.map((b) => (
                  <div key={b.id} className={cn("rounded-xl px-3 py-2", b.earned ? "bg-surface-2" : "bg-surface-2/50 opacity-55")} title={b.description}>
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      {b.earned ? <Trophy size={13} className="text-yellow" /> : <Lock size={12} className="text-faint" />}
                      {b.title}
                    </p>
                    <p className="text-xs text-muted">{b.description}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <ConnectionsCard user={user} />
          {clerkEnabled && <AccountCard user={user} />}
        </div>
      </div>

      <QuizSheet
        open={quizOpen}
        onClose={() => setQuizOpen(false)}
        onDone={async (teamId) => {
          await save({ quizResult: teamId });
        }}
        onJoin={async (t) => {
          await chooseTeam(t);
          setQuizOpen(false);
        }}
      />
    </div>
  );
}

function AboutForm({ user, save }: { user: User; save: (patch: Record<string, unknown>) => Promise<User> }) {
  const { all } = useDrivers();
  const { update } = useSettings();
  const [form, setForm] = useState({
    displayName: user.displayName,
    driver: user.profile.driver ?? "",
    fanSince: user.profile.fanSince ? String(user.profile.fanSince) : "",
    country: user.profile.country ?? "",
    bio: user.profile.bio ?? "",
  });
  const [state, setState] = useState<"idle" | "saving" | "saved" | string>("idle");
  const drivers = [...all].sort((a, b) => a.fullName.localeCompare(b.fullName));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("saving");
    try {
      const driver = all.find((d) => d.number === form.driver);
      await save({
        displayName: form.displayName,
        driver: form.driver || null,
        driverName: driver?.fullName ?? null,
        fanSince: form.fanSince ? Number(form.fanSince) : null,
        country: form.country || null,
        bio: form.bio || null,
      });
      if (driver) update({ favouriteDriver: driver.number, favouriteTeamColour: driver.colour });
      setState("saved");
      setTimeout(() => setState("idle"), 2000);
    } catch (err) {
      setState((err as Error).message);
    }
  };

  const input = "w-full rounded-xl border border-line bg-surface-2 px-3 py-2 outline-none focus:border-accent";
  return (
    <Card title="About you">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Display name</span>
          <input className={input} value={form.displayName} maxLength={40} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Favourite driver</span>
          <select className={input} value={form.driver} onChange={(e) => setForm({ ...form, driver: e.target.value })}>
            <option value="">No favourite yet</option>
            {drivers.map((d) => (
              <option key={d.number} value={d.number}>
                {d.fullName} · {d.team}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Fan since</span>
          <input className={input} inputMode="numeric" placeholder="e.g. 2019" value={form.fanSince} onChange={(e) => setForm({ ...form, fanSince: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Country</span>
          <input className={input} maxLength={60} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">Bio</span>
          <textarea className={cn(input, "min-h-20")} maxLength={280} placeholder="Best race you ever watched? Hottest take?" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button disabled={state === "saving"} className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-60">
            {state === "saving" && <Loader2 size={14} className="animate-spin" />}
            Save profile
          </button>
          {state === "saved" && <span className="flex items-center gap-1 text-sm text-good"><Check size={14} /> Saved</span>}
          {!["idle", "saving", "saved"].includes(state) && <span className="text-sm text-red-500">{state}</span>}
        </div>
      </form>
    </Card>
  );
}

function StatsCard({ user }: { user: User }) {
  const s = user.stats;
  const accuracy = s.picks ? Math.round(((s.correct ?? 0) / s.picks) * 100) : 0;
  return (
    <Card
      title="Your stats"
      icon={<Trophy size={15} />}
      right={
        <Link href="/play" className="text-xs font-semibold text-accent">
          Predict →
        </Link>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Calls", String(s.picks ?? 0)],
          ["Correct", `${s.correct ?? 0} (${accuracy}%)`],
          ["Best call", `${s.bestPick ?? 0} pts`],
          ["Weekend streak", `🔥 ${s.streak?.current ?? 0} (best ${s.streak?.best ?? 0})`],
          ["Fantasy", `${s.fantasy ?? 0} pts`],
          ["Quizzes", String(s.quizWeeks ?? 0)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-surface-2 px-3 py-2">
            <p className="text-[10px] font-semibold tracking-wider text-faint uppercase">{label}</p>
            <p className="font-display text-lg font-bold">{value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ConnectionsCard({ user }: { user: User }) {
  const { refresh } = useAuth();
  const params = useSearchParams();
  // Coming back from Google: re-read the granted access from Clerk.
  useEffect(() => {
    if (!clerkEnabled || user.google.calendar) return;
    const id = setTimeout(() => void api("/api/auth/refresh", { body: {} }).then(refresh, () => {}), 0);
    return () => clearTimeout(id);
  }, [params, user.google.calendar, refresh]);
  return (
    <Card title="Connections" icon={<CalendarCheck2 size={15} />}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Google Calendar</p>
          <p className="text-xs text-muted">
            {user.google.calendar ? "Connected: add sessions and plan watch parties in one tap." : "Add sessions to your calendar and invite friends to watch parties."}
          </p>
        </div>
        {clerkEnabled && !user.google.calendar && (
          <div className="shrink-0 text-right">
            <ConnectGoogleCalendarButton className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink">Connect</ConnectGoogleCalendarButton>
          </div>
        )}
        {user.google.calendar && <Check size={18} className="shrink-0 text-good" />}
      </div>
      <p className="mt-3 text-xs text-faint">Your app settings (theme, favourite driver, alerts) are saved to your profile and follow you to any device.</p>
    </Card>
  );
}

function AccountCard({ user }: { user: User }) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState("");
  const { openAccount, signOut } = useClerkActions();
  const url = typeof window !== "undefined" ? `${window.location.origin}/u/${user.handle}` : `/u/${user.handle}`;
  const row = "flex w-full items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-left text-sm hover:bg-surface-3";
  return (
    <Card title="Account">
      <div className="space-y-2">
        <button
          onClick={async () => {
            await navigator.clipboard?.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className={row}
        >
          {copied ? <Check size={15} className="text-good" /> : <Copy size={15} className="text-faint" />}
          <span className="flex-1 truncate">{copied ? "Link copied" : "Share your public profile"}</span>
        </button>
        <Link href={`/u/${user.handle}`} className={row}>
          <Gift size={15} className="text-faint" /> View public profile
        </Link>
        <Link href="/pro" className={row}>
          <Crown size={15} className={user.pro ? "text-yellow" : "text-faint"} /> {user.pro ? "F1 Live Pro: active" : "Get F1 Live Pro"}
        </Link>
        <button onClick={openAccount} className={row} title="Link a wallet in Manage account → Web3 wallets">
          <Wallet size={15} className="text-faint" />
          <span className="flex-1 truncate">{user.wallet ? `Wallet ${user.wallet.slice(0, 6)}…${user.wallet.slice(-4)}` : "Link a crypto wallet (optional)"}</span>
        </button>
        <button onClick={openAccount} className={row}>
          <Settings2 size={15} className="text-faint" /> Manage account (email, password, sign-in methods)
        </button>
        <button onClick={() => void signOut()} className={row}>
          <LogOut size={15} className="text-faint" /> Sign out
        </button>
        {!confirming ? (
          <button onClick={() => setConfirming(true)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-500 hover:bg-red-500/10">
            <Trash2 size={15} /> Delete account
          </button>
        ) : (
          <div className="rounded-xl border border-red-500/40 p-3">
            <p className="text-sm">This deletes your account, profile and predictions for good. Type <b>DELETE</b> to confirm.</p>
            <div className="mt-2 flex gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} className="flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1 text-sm outline-none" />
              <button
                disabled={text !== "DELETE"}
                onClick={async () => {
                  await api("/api/profile", { method: "DELETE", body: {} });
                  await signOut();
                }}
                className="rounded-lg bg-red-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-40"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function QuizSheet({ open, onClose, onDone, onJoin }: { open: boolean; onClose: () => void; onDone: (team: string) => Promise<void>; onJoin: (team: Team) => Promise<void> }) {
  const [answers, setAnswers] = useState<number[]>([]);
  const step = answers.length;
  const done = step >= QUIZ.length;
  const result = done ? teamById(scoreQuiz(answers)) : null;

  useEffect(() => {
    if (done && result) void onDone(result.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  return (
    <Sheet
      open={open}
      onClose={() => {
        onClose();
        setTimeout(() => setAnswers([]), 400);
      }}
      title="Which team are you?"
      side="bottom"
    >
      <div className="mx-auto max-w-lg pb-4">
        {!done ? (
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
              <div className="mb-4 flex gap-1">
                {QUIZ.map((_, i) => (
                  <span key={i} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-accent" : "bg-surface-3")} />
                ))}
              </div>
              <p className="mb-3 font-display text-xl font-bold">{QUIZ[step].q}</p>
              <div className="space-y-2">
                {QUIZ[step].answers.map((a, i) => (
                  <button key={a.a} onClick={() => setAnswers([...answers, i])} className="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-left text-sm font-medium hover:border-accent">
                    {a.a}
                  </button>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        ) : (
          result && (
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", bounce: 0.4 }} className="text-center">
              <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full text-4xl" style={{ background: `#${result.colour}` }}>🏎️</div>
              <p className="text-sm text-muted">You belong with the</p>
              <p className="font-display text-4xl font-bold" style={{ color: `#${result.colour}` }}>{result.tribe}</p>
              <p className="mt-1 text-muted">{result.name} · &ldquo;{result.vibe}&rdquo;</p>
              <div className="mt-5 flex justify-center gap-2">
                <button onClick={() => onJoin(result)} className="rounded-xl px-4 py-2 font-semibold" style={{ background: `#${result.colour}`, color: readableInk(`#${result.colour}`) }}>
                  Join the {result.tribe}
                </button>
                <button onClick={() => setAnswers([])} className="rounded-xl border border-line px-4 py-2 font-semibold text-muted">
                  Try again
                </button>
              </div>
            </motion.div>
          )
        )}
      </div>
    </Sheet>
  );
}
