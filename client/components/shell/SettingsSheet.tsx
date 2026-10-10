"use client";

import { Accessibility, ArrowDown, ArrowUp, Bell, Eye, EyeOff, Moon, Palette, Star, Sun, Monitor, Volume2, Zap, LayoutGrid } from "lucide-react";
import { useSettings, type LivePanel } from "@/lib/settings";
import { useDrivers } from "@/lib/drivers";
import { sounds } from "@/lib/sound";
import { timeZoneName } from "@/lib/format";
import { Segmented, Sheet, TeamBar, cn } from "@/components/ui";
import { useNow } from "@/lib/useNow";

const PANEL_LABELS: Record<LivePanel, string> = {
  battles: "Battles",
  feed: "Race feed",
  weather: "Weather",
  radio: "Team radio",
};

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, update } = useSettings();
  const { all } = useDrivers();
  const now = useNow(60_000);
  const drivers = [...all].sort((a, b) => a.team.localeCompare(b.team) || a.tla.localeCompare(b.tla));

  const movePanel = (index: number, dir: -1 | 1) => {
    const panels = [...settings.livePanels];
    const target = index + dir;
    if (target < 0 || target >= panels.length) return;
    [panels[index], panels[target]] = [panels[target], panels[index]];
    update({ livePanels: panels });
  };

  const requestReminders = async (on: boolean) => {
    if (on && "Notification" in window && Notification.permission !== "granted") {
      const result = await Notification.requestPermission();
      if (result !== "granted") return;
    }
    update({ reminders: on });
  };

  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <div className="space-y-7">
        <Section icon={<Star size={16} />} title="Favourite driver" hint="Highlighted everywhere, and their team colour can theme the app.">
          <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto pr-1 scroll-thin">
            {drivers.length === 0 && <p className="col-span-2 text-sm text-muted">Loading drivers…</p>}
            {drivers.map((d) => {
              const selected = settings.favouriteDriver === d.number;
              return (
                <button
                  key={d.number}
                  onClick={() => update({ favouriteDriver: selected ? null : d.number, favouriteTeamColour: selected ? null : d.colour })}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm transition-colors",
                    selected ? "border-accent bg-surface-2" : "border-line hover:bg-surface-2",
                  )}
                >
                  <TeamBar colour={d.colour} className="h-6" />
                  <span className="min-w-0">
                    <span className="block font-semibold">{d.tla}</span>
                    <span className="block truncate text-xs text-muted">{d.team}</span>
                  </span>
                  {selected && <Star size={14} className="ml-auto shrink-0 fill-current text-accent" />}
                </button>
              );
            })}
          </div>
        </Section>

        <Section icon={<Palette size={16} />} title="Appearance">
          <Segmented
            value={settings.theme}
            onChange={(theme) => update({ theme })}
            options={[
              { value: "system", label: <span className="flex items-center gap-1.5"><Monitor size={14} /> Auto</span> },
              { value: "dark", label: <span className="flex items-center gap-1.5"><Moon size={14} /> Dark</span> },
              { value: "light", label: <span className="flex items-center gap-1.5"><Sun size={14} /> Light</span> },
            ]}
          />
          <Toggle
            label="Team colour accent"
            hint={settings.favouriteDriver ? "Use your favourite driver's team colour." : "Pick a favourite driver first."}
            checked={settings.teamAccent}
            onChange={(teamAccent) => update({ teamAccent })}
          />
        </Section>

        <Section icon={<Accessibility size={16} />} title="Accessibility">
          <Toggle
            label="Colour-blind friendly colours"
            hint="Blue and orange instead of green and red for personal bests, gains and warnings."
            checked={settings.colourBlind}
            onChange={(colourBlind) => update({ colourBlind })}
          />
          <Toggle
            label="Reduce motion"
            hint="Turns off animations and flag effects. Your device's reduced-motion setting is always respected."
            checked={settings.reduceMotion}
            onChange={(reduceMotion) => update({ reduceMotion })}
          />
        </Section>

        <Section icon={<EyeOff size={16} />} title="Spoiler-free mode" hint="Hides results, standings and finishing orders until you tap to reveal.">
          <Toggle label="Hide results" checked={settings.spoilerFree} onChange={(spoilerFree) => update({ spoilerFree })} />
        </Section>

        <Section icon={<Zap size={16} />} title="During sessions">
          <Toggle label="Pop-up alerts" hint="Overtakes, pit stops and fastest laps." checked={settings.alerts} onChange={(alerts) => update({ alerts })} />
          <Toggle label="Flag effects" hint="Full-screen safety car, red flag and chequered flag moments." checked={settings.flagEffects} onChange={(flagEffects) => update({ flagEffects })} />
          <Toggle
            label="Sound effects"
            hint="Start lights, chequered flag, team radio."
            icon={<Volume2 size={14} />}
            checked={settings.sounds}
            onChange={(on) => {
              update({ sounds: on });
              if (on) sounds.alert();
            }}
          />
        </Section>

        <Section icon={<Bell size={16} />} title="Session reminders" hint="A notification before each session starts, while this app is open in a tab. To be reminded when it's closed, add sessions to your calendar from the Schedule page.">
          <Toggle label="Remind me" checked={settings.reminders} onChange={requestReminders} />
          {settings.reminders && (
            <Segmented
              size="sm"
              value={String(settings.reminderMinutes)}
              onChange={(v) => update({ reminderMinutes: Number(v) })}
              options={[5, 15, 30, 60].map((m) => ({ value: String(m), label: `${m} min before` }))}
            />
          )}
        </Section>

        <Section icon={<LayoutGrid size={16} />} title="Live sidebar" hint="Choose which panels show next to the track map, and their order.">
          <ul className="space-y-1.5">
            {settings.livePanels.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                <button
                  onClick={() => update({ livePanels: settings.livePanels.map((x) => (x.id === p.id ? { ...x, visible: !x.visible } : x)) })}
                  className={cn("rounded-lg p-1", p.visible ? "text-ink" : "text-faint")}
                  aria-label={p.visible ? `Hide ${PANEL_LABELS[p.id]}` : `Show ${PANEL_LABELS[p.id]}`}
                >
                  {p.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <span className={cn("flex-1 text-sm", !p.visible && "text-faint line-through")}>{PANEL_LABELS[p.id]}</span>
                <button onClick={() => movePanel(i, -1)} disabled={i === 0} className="rounded-lg p-1 text-muted disabled:opacity-30" aria-label="Move up">
                  <ArrowUp size={15} />
                </button>
                <button onClick={() => movePanel(i, 1)} disabled={i === settings.livePanels.length - 1} className="rounded-lg p-1 text-muted disabled:opacity-30" aria-label="Move down">
                  <ArrowDown size={15} />
                </button>
              </li>
            ))}
          </ul>
        </Section>

        <p className="text-xs text-faint">
          {now != null && <>All times are shown in your time zone ({timeZoneName()}). </>}
          Settings are saved in this browser.
        </p>
      </div>
    </Sheet>
  );
}

function Section({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="flex items-center gap-2 font-semibold">
          <span className="text-accent">{icon}</span>
          {title}
        </h3>
        {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Toggle({ label, hint, checked, onChange, icon }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; icon?: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="flex items-center gap-1.5 text-sm font-medium">{icon}{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-surface-3")}
      >
        <span className={cn("absolute top-0.5 left-0 h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </button>
    </label>
  );
}
